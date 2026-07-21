package opendota;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

final class GoldenSampleStore {
    static final String SCHEMA = "dota-lens-combat-golden/1.0";
    static final String EVALUATION_SCHEMA = "dota-lens-combat-evaluation/1.0";

    private static final Gson PRETTY_GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Set<String> ANNOTATORS = Set.of("primary", "secondary", "adjudicated");
    private static final Set<String> STATUSES = Set.of("draft", "complete", "adjudicated");
    private static final Set<String> LABELS = Set.of(
            "poke", "trade", "pickoff", "skirmish", "teamfight", "non_combat");
    private static final Set<String> CONFIDENCE = Set.of("high", "medium", "low");
    private static final Set<String> TAGS = Set.of(
            "lane", "zero_death", "long_chase", "simultaneous", "roshan", "highground",
            "illusion", "buyback", "vision_advantage", "objective", "forced_retreat");

    private final Path analysesDirectory;
    private final Path goldenDirectory;
    private final GoldenCombatClassifier classifier;

    GoldenSampleStore(Path dataDirectory) throws IOException {
        Path root = dataDirectory.toAbsolutePath().normalize();
        analysesDirectory = root.resolve("analyses");
        goldenDirectory = root.resolve("qa").resolve("goldens");
        Files.createDirectories(goldenDirectory);
        classifier = new GoldenCombatClassifier(analysesDirectory, goldenDirectory);
    }

    JsonObject list(String annotator) throws IOException {
        String safeAnnotator = annotator(annotator);
        JsonArray matches = new JsonArray();
        List<JsonObject> rows = new ArrayList<>();
        if (Files.isDirectory(analysesDirectory)) {
            try (Stream<Path> directories = Files.list(analysesDirectory)) {
                for (Path directory : directories.filter(Files::isDirectory).toList()) {
                    Long matchId = positiveLong(directory.getFileName().toString());
                    if (matchId == null || !Files.isRegularFile(directory.resolve("summary.json"))) continue;
                    JsonObject summary = summary(matchId);
                    if (summary == null) continue;
                    JsonObject row = new JsonObject();
                    row.addProperty("match_id", matchId);
                    JsonObject match = object(summary, "match");
                    copy(match, row, "duration", "patch_name", "start_time", "radiant_score", "dire_score");
                    JsonArray players = array(match, "players");
                    row.addProperty("players", players.size());
                    row.addProperty("predicted_fights", predictedFights(summary).size());
                    row.add("annotation", annotationSummary(matchId, safeAnnotator));
                    JsonObject slots = new JsonObject();
                    for (String slot : ANNOTATORS) slots.add(slot, annotationSummary(matchId, slot));
                    row.add("annotation_slots", slots);
                    rows.add(row);
                }
            }
        }
        rows.sort(Comparator.comparingLong(row -> -row.get("match_id").getAsLong()));
        rows.forEach(matches::add);
        JsonObject result = new JsonObject();
        result.addProperty("schema", SCHEMA);
        result.addProperty("annotator", safeAnnotator);
        result.addProperty("generated_at", Instant.now().toString());
        result.add("learning_model", classifier.summary());
        result.add("matches", matches);
        return result;
    }

    JsonObject document(long matchId, String annotator) throws IOException {
        String safeAnnotator = annotator(annotator);
        requireSummary(matchId);
        JsonObject existing = read(matchId, safeAnnotator);
        if (existing != null) {
            existing.addProperty("exists", true);
            return existing;
        }
        JsonObject template = template(matchId, safeAnnotator);
        template.addProperty("exists", false);
        return template;
    }

    JsonObject save(long matchId, String annotator, JsonObject input) throws IOException {
        String safeAnnotator = annotator(annotator);
        JsonObject summary = requireSummary(matchId);
        JsonObject existing = read(matchId, safeAnnotator);
        JsonObject normalized = normalize(matchId, safeAnnotator, input == null ? new JsonObject() : input,
                summary, existing);
        Path path = annotationPath(matchId, safeAnnotator);
        Files.createDirectories(path.getParent());
        Path temporary = path.resolveSibling(path.getFileName() + ".tmp");
        Files.writeString(temporary, PRETTY_GSON.toJson(normalized), StandardCharsets.UTF_8);
        try {
            Files.move(temporary, path, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException atomicMoveFailed) {
            Files.move(temporary, path, StandardCopyOption.REPLACE_EXISTING);
        }
        classifier.invalidate();
        normalized.addProperty("exists", true);
        return normalized;
    }

    JsonObject evaluate(long matchId, String annotator) throws IOException {
        String safeAnnotator = annotator(annotator);
        JsonObject gold = read(matchId, safeAnnotator);
        if (gold == null) throw new IllegalArgumentException("No saved annotation for this match and annotator");
        JsonObject result = GoldenSampleEvaluator.evaluate(gold, requireSummary(matchId));
        result.add("learning_model", classifier.summary());
        return result;
    }

    JsonObject benchmark(String annotator) throws IOException {
        String safeAnnotator = annotator(annotator);
        List<JsonObject> evaluations = new ArrayList<>();
        JsonObject labels = new JsonObject();
        JsonObject tags = new JsonObject();
        int documents = 0;
        int drafts = 0;
        int completedEvents = 0;

        if (Files.isDirectory(goldenDirectory)) {
            try (Stream<Path> directories = Files.list(goldenDirectory)) {
                for (Path directory : directories.filter(Files::isDirectory).toList()) {
                    Long matchId = positiveLong(directory.getFileName().toString());
                    if (matchId == null) continue;
                    JsonObject gold = read(matchId, safeAnnotator);
                    if (gold == null) continue;
                    documents++;
                    String status = string(gold, "status", "draft");
                    boolean eligible = safeAnnotator.equals("adjudicated")
                            ? status.equals("adjudicated") : status.equals("complete");
                    if (!eligible) {
                        drafts++;
                        continue;
                    }
                    JsonObject summary = summary(matchId);
                    if (summary == null) continue;
                    JsonArray events = array(gold, "events");
                    completedEvents += events.size();
                    for (JsonElement value : events) {
                        if (!value.isJsonObject()) continue;
                        JsonObject event = value.getAsJsonObject();
                        increment(labels, string(event, "label", "unknown"));
                        for (JsonElement tag : array(event, "tags")) increment(tags, tag.getAsString());
                    }
                    evaluations.add(GoldenSampleEvaluator.evaluate(gold, summary));
                }
            }
        }

        JsonObject result = GoldenSampleEvaluator.aggregate(safeAnnotator, evaluations);
        JsonObject coverage = new JsonObject();
        coverage.addProperty("documents", documents);
        coverage.addProperty("eligible_matches", evaluations.size());
        coverage.addProperty("incomplete_documents", drafts);
        coverage.addProperty("events", completedEvents);
        coverage.add("labels", labels);
        coverage.add("tags", tags);
        result.add("coverage", coverage);
        result.add("learning_model", classifier.summary());
        return result;
    }

    JsonObject applyLearning(long matchId, JsonObject analysis) throws IOException {
        return classifier.apply(analysis, matchId);
    }

    private JsonObject normalize(long matchId, String annotator, JsonObject input, JsonObject summary,
            JsonObject existing) {
        String status = string(input, "status", "draft");
        if (!STATUSES.contains(status)) throw new IllegalArgumentException("Unknown annotation status: " + status);
        if (status.equals("adjudicated") && !annotator.equals("adjudicated")) {
            throw new IllegalArgumentException("Only the adjudicated slot can use adjudicated status");
        }

        JsonObject result = new JsonObject();
        result.addProperty("schema", SCHEMA);
        result.addProperty("match_id", matchId);
        result.addProperty("annotator", annotator);
        result.addProperty("annotation_version", Math.max(1, integer(input, "annotation_version", 1)));
        result.addProperty("status", status);
        boolean blindMode = bool(input, "blind_mode", true);
        if (!status.equals("draft") && !annotator.equals("adjudicated") && !blindMode) {
            throw new IllegalArgumentException("Completed primary and secondary annotations must remain blind");
        }
        result.addProperty("blind_mode", blindMode);
        result.addProperty("created_at", existing == null
                ? Instant.now().toString() : string(existing, "created_at", Instant.now().toString()));
        result.addProperty("updated_at", Instant.now().toString());
        result.addProperty("source_summary_schema", string(summary, "schema", "unknown"));
        JsonObject match = object(summary, "match");
        String patch = string(match, "patch_name", "unknown");
        result.addProperty("replay_patch", patch);
        result.addProperty("coordinate_version", MapCoordinateService.COORDINATE_VERSION);
        result.addProperty("notes", limited(string(input, "notes", ""), 2000));

        long durationMs = Math.max(0, longValue(match, "duration", 0)) * 1000L;
        JsonArray eventRows = array(input, "events");
        JsonArray events = new JsonArray();
        Set<String> ids = new HashSet<>();
        MapCoordinateService coordinates = new MapCoordinateService(patch);
        for (int index = 0; index < eventRows.size(); index++) {
            JsonElement value = eventRows.get(index);
            if (!value.isJsonObject()) throw new IllegalArgumentException("Annotation event must be an object");
            JsonObject event = normalizeEvent(value.getAsJsonObject(), index, durationMs, coordinates, status);
            String id = event.get("id").getAsString();
            if (!ids.add(id)) throw new IllegalArgumentException("Duplicate annotation event id: " + id);
            events.add(event);
        }
        result.add("events", events);
        result.addProperty("event_count", events.size());
        return result;
    }

    private JsonObject normalizeEvent(JsonObject input, int index, long durationMs,
            MapCoordinateService coordinates, String documentStatus) {
        JsonObject event = new JsonObject();
        String id = string(input, "id", "gold-" + (index + 1)).replaceAll("[^A-Za-z0-9_-]", "-");
        if (id.isBlank()) id = "gold-" + (index + 1);
        String label = string(input, "label", "non_combat");
        if (!LABELS.contains(label)) throw new IllegalArgumentException("Unknown combat label: " + label);

        long contactStart = rangedTime(input, "contact_start_ms", 0, durationMs);
        long reviewStart = rangedTime(input, "review_start_ms", Math.max(-180_000, contactStart - 10_000), durationMs);
        long contactEnd = rangedTime(input, "contact_end_ms", contactStart, durationMs + 120_000);
        long peak = rangedTime(input, "peak_ms", contactStart, durationMs + 120_000);
        if (reviewStart > contactStart || contactStart > contactEnd || peak < contactStart || peak > contactEnd) {
            throw new IllegalArgumentException("Event time order must be review <= contact <= peak <= end");
        }

        JsonArray participants = slots(input, "participants");
        JsonArray nearby = slots(input, "nearby_slots");
        String confidence = string(input, "confidence", "medium");
        if (!CONFIDENCE.contains(confidence)) throw new IllegalArgumentException("Unknown confidence: " + confidence);

        event.addProperty("id", id);
        event.addProperty("label", label);
        event.addProperty("review_start_ms", reviewStart);
        event.addProperty("contact_start_ms", contactStart);
        event.addProperty("contact_end_ms", contactEnd);
        event.addProperty("peak_ms", peak);
        event.add("participants", participants);
        event.add("nearby_slots", nearby);
        event.add("tags", tags(input));
        event.addProperty("confidence", confidence);
        event.addProperty("notes", limited(string(input, "notes", ""), 1000));

        JsonObject centerInput = object(input, "center");
        MapCoordinateService.Point point = coordinates.fromPercent(
                nullableFloat(centerInput, "map_x"), nullableFloat(centerInput, "map_y"));
        if (point != null) {
            MapCoordinateService.Region region = coordinates.classify(point);
            JsonObject center = new JsonObject();
            center.addProperty("map_x", round(point.x()));
            center.addProperty("map_y", round(point.y()));
            center.addProperty("world_x", round(point.worldX()));
            center.addProperty("world_y", round(point.worldY()));
            center.addProperty("region", region.primary());
            center.addProperty("region_context", region.context());
            center.addProperty("coordinate_version", MapCoordinateService.COORDINATE_VERSION);
            center.addProperty("region_version", MapCoordinateService.REGION_VERSION);
            event.add("center", center);
        }
        event.addProperty("radius_world", Math.max(0, Math.min(5000, integer(input, "radius_world", 700))));

        if (!documentStatus.equals("draft") && !label.equals("non_combat")) {
            if (contactStart - reviewStart > 10_000) {
                throw new IllegalArgumentException("Completed combat review may trace back at most 10 seconds");
            }
            if (!event.has("center")) throw new IllegalArgumentException("Completed combat events require a map center");
            if (participants.size() < 2) throw new IllegalArgumentException("Completed combat events require participants");
            if (label.equals("teamfight")) validateTeamfight(participants);
        }
        return event;
    }

    private static void validateTeamfight(JsonArray participants) {
        int radiant = 0;
        int dire = 0;
        for (JsonElement value : participants) {
            if (value.getAsInt() < 5) radiant++; else dire++;
        }
        if (radiant == 2 && dire == 2) throw new IllegalArgumentException("2v2 must be labeled as skirmish");
        if (participants.size() < 5 || radiant < 2 || dire < 2) {
            throw new IllegalArgumentException("Teamfight requires at least five participants and two per team");
        }
    }

    private JsonObject annotationSummary(long matchId, String annotator) throws IOException {
        JsonObject document = read(matchId, annotator);
        JsonObject result = new JsonObject();
        result.addProperty("annotator", annotator);
        result.addProperty("exists", document != null);
        result.addProperty("status", document == null ? "not_started" : string(document, "status", "draft"));
        result.addProperty("event_count", document == null ? 0 : array(document, "events").size());
        if (document != null && document.has("updated_at")) result.add("updated_at", document.get("updated_at"));
        return result;
    }

    private JsonObject template(long matchId, String annotator) throws IOException {
        JsonObject summary = requireSummary(matchId);
        JsonObject result = new JsonObject();
        result.addProperty("schema", SCHEMA);
        result.addProperty("match_id", matchId);
        result.addProperty("annotator", annotator);
        result.addProperty("annotation_version", 1);
        result.addProperty("status", "draft");
        result.addProperty("blind_mode", true);
        result.addProperty("created_at", Instant.now().toString());
        result.addProperty("updated_at", Instant.now().toString());
        result.addProperty("source_summary_schema", string(summary, "schema", "unknown"));
        result.addProperty("replay_patch", string(object(summary, "match"), "patch_name", "unknown"));
        result.addProperty("coordinate_version", MapCoordinateService.COORDINATE_VERSION);
        result.addProperty("notes", "");
        result.add("events", new JsonArray());
        result.addProperty("event_count", 0);
        return result;
    }

    private JsonObject read(long matchId, String annotator) throws IOException {
        Path path = annotationPath(matchId, annotator);
        if (!Files.isRegularFile(path)) return null;
        JsonElement parsed = JsonParser.parseString(Files.readString(path, StandardCharsets.UTF_8));
        return parsed.isJsonObject() ? parsed.getAsJsonObject() : null;
    }

    private JsonObject requireSummary(long matchId) throws IOException {
        JsonObject summary = summary(matchId);
        if (summary == null) throw new IllegalArgumentException("Match has no local analysis: " + matchId);
        return summary;
    }

    private JsonObject summary(long matchId) throws IOException {
        return AnalysisStorage.readWithModules(
                analysesDirectory.resolve(Long.toString(matchId)), Set.of("combat"));
    }

    private Path annotationPath(long matchId, String annotator) {
        return goldenDirectory.resolve(Long.toString(matchId)).resolve(annotator + ".json");
    }

    private static String annotator(String value) {
        String normalized = value == null || value.isBlank() ? "primary" : value.trim().toLowerCase();
        if (!ANNOTATORS.contains(normalized)) throw new IllegalArgumentException("Unknown annotator slot: " + value);
        return normalized;
    }

    static JsonArray predictedFights(JsonObject summary) {
        return array(object(object(summary, "modules"), "combat"), "fights");
    }

    private static JsonArray slots(JsonObject object, String field) {
        Set<Integer> unique = new LinkedHashSet<>();
        for (JsonElement value : array(object, field)) {
            try {
                int slot = value.getAsInt();
                if (slot >= 0 && slot < 10) unique.add(slot);
            } catch (RuntimeException ignored) {
                // Invalid slots are omitted from drafts and surfaced by the normalized result.
            }
        }
        JsonArray result = new JsonArray();
        unique.stream().sorted().forEach(result::add);
        return result;
    }

    private static JsonArray tags(JsonObject object) {
        JsonArray result = new JsonArray();
        Set<String> unique = new LinkedHashSet<>();
        for (JsonElement value : array(object, "tags")) {
            String tag = value.getAsString();
            if (TAGS.contains(tag)) unique.add(tag);
        }
        unique.forEach(result::add);
        return result;
    }

    private static long rangedTime(JsonObject object, String field, long fallback, long max) {
        long value = longValue(object, field, fallback);
        if (value < -180_000 || value > Math.max(max, 120_000)) {
            throw new IllegalArgumentException("Time out of range: " + field);
        }
        return value;
    }

    private static void copy(JsonObject from, JsonObject to, String... fields) {
        for (String field : fields) if (from.has(field)) to.add(field, from.get(field).deepCopy());
    }

    private static void increment(JsonObject counts, String key) {
        counts.addProperty(key, counts.has(key) ? counts.get(key).getAsInt() + 1 : 1);
    }

    static JsonObject object(JsonObject parent, String field) {
        JsonElement value = parent == null ? null : parent.get(field);
        return value != null && value.isJsonObject() ? value.getAsJsonObject() : new JsonObject();
    }

    static JsonArray array(JsonObject parent, String field) {
        JsonElement value = parent == null ? null : parent.get(field);
        return value != null && value.isJsonArray() ? value.getAsJsonArray() : new JsonArray();
    }

    static String string(JsonObject object, String field, String fallback) {
        JsonElement value = object == null ? null : object.get(field);
        try {
            return value == null || value.isJsonNull() ? fallback : value.getAsString();
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    static long longValue(JsonObject object, String field, long fallback) {
        JsonElement value = object == null ? null : object.get(field);
        try {
            return value == null || value.isJsonNull() ? fallback : value.getAsLong();
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static int integer(JsonObject object, String field, int fallback) {
        return (int) longValue(object, field, fallback);
    }

    private static boolean bool(JsonObject object, String field, boolean fallback) {
        JsonElement value = object == null ? null : object.get(field);
        try {
            return value == null || value.isJsonNull() ? fallback : value.getAsBoolean();
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static Float nullableFloat(JsonObject object, String field) {
        JsonElement value = object == null ? null : object.get(field);
        try {
            return value == null || value.isJsonNull() ? null : value.getAsFloat();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static Long positiveLong(String value) {
        try {
            long parsed = Long.parseLong(value);
            return parsed > 0 ? parsed : null;
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static String limited(String value, int limit) {
        return value.length() <= limit ? value : value.substring(0, limit);
    }

    private static float round(float value) {
        return Math.round(value * 100.0f) / 100.0f;
    }
}
