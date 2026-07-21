package opendota;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

final class GoldenCombatClassifier {
    static final String MODEL = "golden-cross-match-knn-v1";
    static final String SCHEMA = "dota-lens-golden-learning/1.0";

    private static final int NEIGHBOR_LIMIT = 5;
    private static final double MULTI_MATCH_MIN_SIMILARITY = 0.78;
    private static final double SINGLE_MATCH_MIN_SIMILARITY = 0.88;
    private static final double MIN_VOTE_SHARE = 0.56;
    private static final double[] FEATURE_WEIGHTS = {
            2.0, 1.2, 1.2, 1.5, 1.5, 1.0, 0.8, 0.8, 0.8, 0.4, 0.3, 0.4, 0.8, 0.7
    };
    private static final List<String> LABEL_ORDER = List.of(
            "teamfight", "skirmish", "pickoff", "trade", "poke", "non_combat");

    private final Path analysesDirectory;
    private final Path goldenDirectory;
    private Model cachedModel;

    GoldenCombatClassifier(Path analysesDirectory, Path goldenDirectory) {
        this.analysesDirectory = analysesDirectory;
        this.goldenDirectory = goldenDirectory;
    }

    synchronized void invalidate() {
        cachedModel = null;
    }

    JsonObject summary() throws IOException {
        return model().summary();
    }

    JsonObject apply(JsonObject analysis, long excludedMatchId) throws IOException {
        Model model = model();
        JsonObject modules = object(analysis, "modules");
        JsonObject combat = object(modules, "combat");
        JsonArray sourceFights = array(combat, "fights");
        JsonArray visibleFights = new JsonArray();
        JsonArray suppressedFights = new JsonArray();
        int learnedCandidates = 0;

        for (JsonElement value : sourceFights) {
            if (!value.isJsonObject()) continue;
            JsonObject fight = value.getAsJsonObject();
            String baseline = string(fight, "kind", "unknown");
            Prediction prediction = predict(features(fight, null), model.samples, excludedMatchId);
            JsonObject classification = object(fight, "classification");
            fight.add("classification", classification);
            classification.addProperty("baseline_kind", baseline);
            classification.addProperty("learning_model", MODEL);
            classification.addProperty("learning_applied", prediction.accepted);
            if (prediction.hasNeighbors()) {
                classification.addProperty("learned_label", prediction.label);
                classification.addProperty("similarity", round(prediction.similarity));
                classification.addProperty("vote_share", round(prediction.voteShare));
                classification.add("similar_samples", prediction.neighborJson());
            }
            if (prediction.accepted) {
                learnedCandidates++;
                classification.addProperty("source", "golden_cross_match_similarity");
                if (prediction.label.equals("non_combat")) {
                    classification.addProperty("suppressed", true);
                    suppressedFights.add(fight);
                    continue;
                }
                fight.addProperty("kind", productLabel(prediction.label));
            } else {
                classification.addProperty("source", "combat_spatiotemporal_rules");
            }
            visibleFights.add(fight);
        }

        combat.add("fights", visibleFights);
        combat.add("suppressed_fights", suppressedFights);
        JsonObject learning = model.summary();
        learning.addProperty("excluded_match_id", excludedMatchId);
        learning.addProperty("candidates", sourceFights.size());
        learning.addProperty("learned_candidates", learnedCandidates);
        learning.addProperty("suppressed_candidates", suppressedFights.size());
        combat.add("learning", learning);
        return analysis;
    }

    private synchronized Model model() throws IOException {
        if (cachedModel == null) cachedModel = buildModel();
        return cachedModel;
    }

    private Model buildModel() throws IOException {
        List<TrainingSample> samples = new ArrayList<>();
        Map<String, Integer> labelCounts = new LinkedHashMap<>();
        LABEL_ORDER.forEach(label -> labelCounts.put(label, 0));
        int eligibleMatches = 0;
        int skippedEvents = 0;

        if (Files.isDirectory(goldenDirectory)) {
            try (Stream<Path> directories = Files.list(goldenDirectory)) {
                for (Path directory : directories.filter(Files::isDirectory)
                        .sorted(Comparator.comparing(path -> path.getFileName().toString())).toList()) {
                    Long matchId = positiveLong(directory.getFileName().toString());
                    if (matchId == null) continue;
                    FrozenDocument frozen = frozenDocument(directory);
                    if (frozen == null) continue;
                    JsonObject summary = AnalysisStorage.readWithModules(
                            analysesDirectory.resolve(Long.toString(matchId)), Set.of("combat"));
                    if (summary == null) continue;
                    eligibleMatches++;
                    JsonArray fights = GoldenSampleStore.predictedFights(summary);
                    for (JsonElement eventValue : array(frozen.document, "events")) {
                        if (!eventValue.isJsonObject()) continue;
                        JsonObject event = eventValue.getAsJsonObject();
                        JsonObject fight = matchedFight(event, fights);
                        if (fight == null) {
                            skippedEvents++;
                            continue;
                        }
                        String label = string(event, "label", "non_combat");
                        if (!labelCounts.containsKey(label)) continue;
                        labelCounts.put(label, labelCounts.get(label) + 1);
                        samples.add(new TrainingSample(
                                matchId,
                                string(event, "id", "gold-event"),
                                label,
                                string(event, "confidence", "medium"),
                                frozen.source,
                                features(fight, event)));
                    }
                }
            }
        }
        return new Model(List.copyOf(samples), eligibleMatches, skippedEvents, labelCounts);
    }

    private FrozenDocument frozenDocument(Path directory) throws IOException {
        JsonObject adjudicated = readJson(directory.resolve("adjudicated.json"));
        if (adjudicated != null && string(adjudicated, "status", "draft").equals("adjudicated")) {
            return new FrozenDocument(adjudicated, "adjudicated");
        }
        JsonObject primary = readJson(directory.resolve("primary.json"));
        if (primary != null && string(primary, "status", "draft").equals("complete")) {
            return new FrozenDocument(primary, "primary_complete");
        }
        JsonObject secondary = readJson(directory.resolve("secondary.json"));
        if (secondary != null && string(secondary, "status", "draft").equals("complete")) {
            return new FrozenDocument(secondary, "secondary_complete");
        }
        return null;
    }

    private Prediction predict(FeatureVector query, List<TrainingSample> samples, long excludedMatchId) {
        List<Neighbor> neighbors = samples.stream()
                .filter(sample -> sample.matchId != excludedMatchId)
                .map(sample -> new Neighbor(sample, similarity(query, sample.features)))
                .sorted(Comparator.comparingDouble(Neighbor::similarity).reversed())
                .limit(NEIGHBOR_LIMIT)
                .toList();
        if (neighbors.isEmpty()) return Prediction.empty();

        Map<String, Double> votes = new LinkedHashMap<>();
        LABEL_ORDER.forEach(label -> votes.put(label, 0.0));
        for (Neighbor neighbor : neighbors) {
            double weight = Math.pow(Math.max(0, neighbor.similarity), 4)
                    * confidenceWeight(neighbor.sample.confidence)
                    * (neighbor.sample.source.equals("adjudicated") ? 1.0 : 0.9);
            votes.put(neighbor.sample.label, votes.getOrDefault(neighbor.sample.label, 0.0) + weight);
        }
        String label = LABEL_ORDER.get(0);
        double bestVote = -1;
        double totalVote = 0;
        for (String candidate : LABEL_ORDER) {
            double vote = votes.getOrDefault(candidate, 0.0);
            totalVote += vote;
            if (vote > bestVote) {
                label = candidate;
                bestVote = vote;
            }
        }
        double voteShare = totalVote == 0 ? 0 : bestVote / totalVote;
        double nearest = neighbors.get(0).similarity;
        long distinctMatches = neighbors.stream().map(neighbor -> neighbor.sample.matchId).distinct().count();
        double threshold = distinctMatches >= 2 ? MULTI_MATCH_MIN_SIMILARITY : SINGLE_MATCH_MIN_SIMILARITY;
        boolean hardGate = !label.equals("teamfight")
                || query.active >= 5 && query.radiant >= 2 && query.dire >= 2
                && !(query.radiant == 2 && query.dire == 2);
        boolean accepted = nearest >= threshold && voteShare >= MIN_VOTE_SHARE && hardGate;
        return new Prediction(label, nearest, voteShare, accepted, neighbors.subList(0, Math.min(3, neighbors.size())));
    }

    private static FeatureVector features(JsonObject fight, JsonObject annotation) {
        JsonArray participants = annotation == null ? array(fight, "participants") : array(annotation, "participants");
        if (participants.isEmpty()) participants = array(fight, "participants");
        int radiant = 0;
        int dire = 0;
        for (JsonElement value : participants) {
            int slot = value.getAsInt();
            if (slot < 5) radiant++; else dire++;
        }
        int active = radiant + dire;
        double start = annotation == null
                ? number(fight, "contact_start", number(fight, "start", 0))
                : number(annotation, "contact_start_ms", 0) / 1000.0;
        double end = annotation == null
                ? number(fight, "contact_end", number(fight, "end", start))
                : number(annotation, "contact_end_ms", start * 1000) / 1000.0;
        double duration = Math.max(1, end - start);
        int deaths = integer(fight, "radiant_deaths", 0) + integer(fight, "dire_deaths", 0);
        double damage = number(fight, "total_damage", number(fight, "damage", 0));
        JsonObject classification = object(fight, "classification");
        double intensity = number(classification, "intensity_score", 0);
        int casts = 0;
        double control = 0;
        boolean radiantDamage = false;
        boolean direDamage = false;
        for (JsonElement value : array(fight, "events")) {
            if (!value.isJsonObject()) continue;
            JsonObject event = value.getAsJsonObject();
            String kind = string(event, "kind", "");
            if (kind.equals("ability_use")) casts++;
            if (kind.equals("control")) control += number(event, "value", 0);
            if (kind.equals("damage")) {
                int actor = integer(event, "actor_slot", -1);
                if (actor >= 0 && actor < 5) radiantDamage = true;
                if (actor >= 5 && actor < 10) direDamage = true;
            }
        }
        double balance = active == 0 ? 0 : Math.min(radiant, dire) / (double) Math.max(1, Math.max(radiant, dire));
        double scatter = number(fight, "scatter_radius_pct", 0);
        int nearby = array(fight, "nearby_slots").size();
        String region = string(fight, "region", "").toLowerCase();
        Set<String> tags = new HashSet<>();
        if (annotation != null) {
            for (JsonElement value : array(annotation, "tags")) tags.add(value.getAsString());
        }
        boolean laneContext = tags.contains("lane") || region.contains("lane");
        boolean objectiveContext = tags.contains("roshan") || tags.contains("highground")
                || tags.contains("objective") || region.contains("roshan") || region.contains("base");
        double[] values = {
                clamp(active / 10.0),
                clamp(balance),
                clamp(duration / 30.0),
                clamp(deaths / 5.0),
                clamp(Math.log1p(Math.max(0, damage)) / Math.log1p(12_000)),
                clamp(intensity / 100.0),
                clamp(casts / 24.0),
                clamp(control / 15.0),
                radiantDamage && direDamage ? 1.0 : 0.0,
                clamp(scatter / 18.0),
                clamp(nearby / 5.0),
                clamp(start / 2400.0),
                laneContext ? 1.0 : 0.0,
                objectiveContext ? 1.0 : 0.0,
        };
        return new FeatureVector(values, active, radiant, dire);
    }

    private static JsonObject matchedFight(JsonObject event, JsonArray fights) {
        double eventStart = number(event, "contact_start_ms", 0);
        double eventEnd = number(event, "contact_end_ms", eventStart);
        JsonObject best = null;
        double bestScore = -1;
        for (JsonElement value : fights) {
            if (!value.isJsonObject()) continue;
            JsonObject fight = value.getAsJsonObject();
            double fightStart = number(fight, "contact_start", number(fight, "start", 0)) * 1000;
            double fightEnd = number(fight, "contact_end", number(fight, "end", fightStart / 1000)) * 1000;
            double intersection = Math.max(0, Math.min(eventEnd, fightEnd) - Math.max(eventStart, fightStart));
            double union = Math.max(1, Math.max(eventEnd, fightEnd) - Math.min(eventStart, fightStart));
            double delta = Math.abs(eventStart - fightStart);
            if (intersection <= 0 && delta > 12_000) continue;
            double score = intersection / union * 0.7 + Math.max(0, 1 - delta / 15_000) * 0.3;
            if (score > bestScore) {
                best = fight;
                bestScore = score;
            }
        }
        return best;
    }

    private static double similarity(FeatureVector left, FeatureVector right) {
        double weighted = 0;
        double totalWeight = 0;
        for (int index = 0; index < FEATURE_WEIGHTS.length; index++) {
            double delta = left.values[index] - right.values[index];
            weighted += FEATURE_WEIGHTS[index] * delta * delta;
            totalWeight += FEATURE_WEIGHTS[index];
        }
        return clamp(1.0 - Math.sqrt(weighted / Math.max(1, totalWeight)));
    }

    private static double confidenceWeight(String confidence) {
        return switch (confidence) {
            case "high" -> 1.0;
            case "low" -> 0.65;
            default -> 0.85;
        };
    }

    private static String productLabel(String label) {
        return switch (label) {
            case "poke" -> "harass";
            case "trade" -> "lane_trade";
            default -> label;
        };
    }

    private static JsonObject readJson(Path path) throws IOException {
        if (!Files.isRegularFile(path)) return null;
        JsonElement parsed = JsonParser.parseString(Files.readString(path, StandardCharsets.UTF_8));
        return parsed.isJsonObject() ? parsed.getAsJsonObject() : null;
    }

    private static JsonObject object(JsonObject parent, String field) {
        JsonElement value = parent == null ? null : parent.get(field);
        return value != null && value.isJsonObject() ? value.getAsJsonObject() : new JsonObject();
    }

    private static JsonArray array(JsonObject parent, String field) {
        JsonElement value = parent == null ? null : parent.get(field);
        return value != null && value.isJsonArray() ? value.getAsJsonArray() : new JsonArray();
    }

    private static String string(JsonObject object, String field, String fallback) {
        JsonElement value = object == null ? null : object.get(field);
        try {
            return value == null || value.isJsonNull() ? fallback : value.getAsString();
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static double number(JsonObject object, String field, double fallback) {
        JsonElement value = object == null ? null : object.get(field);
        try {
            return value == null || value.isJsonNull() ? fallback : value.getAsDouble();
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static int integer(JsonObject object, String field, int fallback) {
        return (int) Math.round(number(object, field, fallback));
    }

    private static Long positiveLong(String value) {
        try {
            long parsed = Long.parseLong(value);
            return parsed > 0 ? parsed : null;
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static double clamp(double value) {
        return Math.max(0, Math.min(1, value));
    }

    private static double round(double value) {
        return Math.round(value * 1000.0) / 1000.0;
    }

    private record FrozenDocument(JsonObject document, String source) {}
    private record FeatureVector(double[] values, int active, int radiant, int dire) {}
    private record TrainingSample(long matchId, String eventId, String label, String confidence,
            String source, FeatureVector features) {}
    private record Neighbor(TrainingSample sample, double similarity) {}

    private record Prediction(String label, double similarity, double voteShare, boolean accepted,
            List<Neighbor> neighbors) {
        static Prediction empty() {
            return new Prediction("", 0, 0, false, List.of());
        }

        boolean hasNeighbors() {
            return !neighbors.isEmpty();
        }

        JsonArray neighborJson() {
            JsonArray rows = new JsonArray();
            for (Neighbor neighbor : neighbors) {
                JsonObject row = new JsonObject();
                row.addProperty("match_id", neighbor.sample.matchId);
                row.addProperty("event_id", neighbor.sample.eventId);
                row.addProperty("label", neighbor.sample.label);
                row.addProperty("similarity", round(neighbor.similarity));
                row.addProperty("source", neighbor.sample.source);
                rows.add(row);
            }
            return rows;
        }
    }

    private final class Model {
        final List<TrainingSample> samples;
        final int eligibleMatches;
        final int skippedEvents;
        final Map<String, Integer> labelCounts;

        Model(List<TrainingSample> samples, int eligibleMatches, int skippedEvents,
                Map<String, Integer> labelCounts) {
            this.samples = samples;
            this.eligibleMatches = eligibleMatches;
            this.skippedEvents = skippedEvents;
            this.labelCounts = Map.copyOf(labelCounts);
        }

        JsonObject summary() {
            int evaluable = 0;
            int correct = 0;
            Set<Long> sampleMatches = new HashSet<>();
            for (TrainingSample sample : samples) {
                sampleMatches.add(sample.matchId);
                Prediction prediction = predict(sample.features, samples, sample.matchId);
                if (!prediction.accepted) continue;
                evaluable++;
                if (prediction.label.equals(sample.label)) correct++;
            }
            JsonObject result = new JsonObject();
            result.addProperty("schema", SCHEMA);
            result.addProperty("model", MODEL);
            result.addProperty("feature_version", "combat-similarity-features/1.0");
            result.addProperty("status", samples.isEmpty() ? "empty" : sampleMatches.size() < 2 ? "bootstrap" : "active");
            result.addProperty("eligible_matches", eligibleMatches);
            result.addProperty("training_matches", sampleMatches.size());
            result.addProperty("samples", samples.size());
            result.addProperty("skipped_events", skippedEvents);
            result.addProperty("automatic_update", true);
            result.addProperty("leave_one_match_out", true);
            result.addProperty("minimum_similarity", MULTI_MATCH_MIN_SIMILARITY);
            JsonObject labels = new JsonObject();
            LABEL_ORDER.forEach(label -> labels.addProperty(label, labelCounts.getOrDefault(label, 0)));
            result.add("labels", labels);
            JsonObject validation = new JsonObject();
            validation.addProperty("evaluable_samples", evaluable);
            validation.addProperty("correct_samples", correct);
            validation.addProperty("accuracy", evaluable == 0 ? 0 : round(correct / (double) evaluable));
            validation.addProperty("coverage", samples.isEmpty() ? 0 : round(evaluable / (double) samples.size()));
            result.add("cross_match_validation", validation);
            return result;
        }
    }
}
