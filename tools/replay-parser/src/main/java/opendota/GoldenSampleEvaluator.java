package opendota;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

final class GoldenSampleEvaluator {
    private GoldenSampleEvaluator() {}

    static JsonObject evaluate(JsonObject goldDocument, JsonObject summary) {
        List<GoldEvent> gold = goldEvents(goldDocument);
        List<Prediction> predictions = predictions(summary);
        List<Candidate> candidates = new ArrayList<>();
        for (GoldEvent truth : gold) {
            if (truth.label.equals("non_combat")) continue;
            for (Prediction prediction : predictions) {
                long overlap = overlap(truth.startMs, truth.endMs, prediction.startMs, prediction.endMs);
                long startDelta = Math.abs(truth.startMs - prediction.startMs);
                if (overlap <= 0 && startDelta > 8_000) continue;
                double participantJaccard = jaccard(truth.participants, prediction.participants);
                if (!truth.participants.isEmpty() && participantJaccard < 0.30) continue;
                double temporal = temporalScore(truth, prediction, overlap, startDelta);
                double spatial = spatialScore(truth.worldX, truth.worldY, prediction.worldX, prediction.worldY);
                candidates.add(new Candidate(truth.index, prediction.index,
                        temporal * 0.55 + participantJaccard * 0.35 + spatial * 0.10,
                        participantJaccard, distance(truth.worldX, truth.worldY, prediction.worldX, prediction.worldY)));
            }
        }
        candidates.sort(Comparator.comparingDouble(Candidate::score).reversed());

        Map<Integer, Match> goldMatches = new HashMap<>();
        Map<Integer, Match> predictionMatches = new HashMap<>();
        for (Candidate candidate : candidates) {
            if (goldMatches.containsKey(candidate.goldIndex) || predictionMatches.containsKey(candidate.predictionIndex)) {
                continue;
            }
            Match match = new Match(candidate.goldIndex, candidate.predictionIndex, candidate.score,
                    candidate.participantJaccard, candidate.centerDistance);
            goldMatches.put(candidate.goldIndex, match);
            predictionMatches.put(candidate.predictionIndex, match);
        }

        int teamfightTp = 0;
        int teamfightFp = 0;
        int teamfightFn = 0;
        int laneInteractions = 0;
        int laneFalseTeamfights = 0;
        int twoVersusTwo = 0;
        int twoVersusTwoUpgrades = 0;
        int participantTp = 0;
        int participantFp = 0;
        int participantFn = 0;
        List<Double> participantF1 = new ArrayList<>();
        List<Double> centerErrors = new ArrayList<>();
        List<Double> startErrors = new ArrayList<>();
        List<Double> endErrors = new ArrayList<>();
        Map<String, Map<String, Integer>> confusion = new LinkedHashMap<>();
        JsonArray matchedRows = new JsonArray();

        for (Prediction prediction : predictions) {
            Match match = predictionMatches.get(prediction.index);
            boolean correctTeamfight = match != null && gold.get(match.goldIndex).label.equals("teamfight");
            if (prediction.label.equals("teamfight")) {
                if (correctTeamfight) teamfightTp++; else teamfightFp++;
            }
        }

        for (GoldEvent truth : gold) {
            Match match = goldMatches.get(truth.index);
            Prediction prediction = match == null ? null : predictions.get(match.predictionIndex);
            if (truth.label.equals("teamfight") && (prediction == null || !prediction.label.equals("teamfight"))) {
                teamfightFn++;
            }
            boolean laneInteraction = truth.tags.contains("lane")
                    && (truth.label.equals("poke") || truth.label.equals("trade"));
            if (laneInteraction) {
                laneInteractions++;
                if (prediction != null && prediction.label.equals("teamfight")) laneFalseTeamfights++;
            }
            if (isTwoVersusTwo(truth.participants)) {
                twoVersusTwo++;
                if (prediction != null && prediction.label.equals("teamfight")) twoVersusTwoUpgrades++;
            }
            if (prediction == null) continue;

            confusion.computeIfAbsent(truth.label, ignored -> new LinkedHashMap<>())
                    .merge(prediction.label, 1, Integer::sum);
            Set<Integer> intersection = new HashSet<>(truth.participants);
            intersection.retainAll(prediction.participants);
            int truePositive = intersection.size();
            int falsePositive = prediction.participants.size() - truePositive;
            int falseNegative = truth.participants.size() - truePositive;
            participantTp += truePositive;
            participantFp += falsePositive;
            participantFn += falseNegative;
            participantF1.add(f1(truePositive, falsePositive, falseNegative));
            if (truth.worldX != null && prediction.worldX != null) {
                centerErrors.add(distance(truth.worldX, truth.worldY, prediction.worldX, prediction.worldY));
            }
            startErrors.add(Math.abs(truth.startMs - prediction.startMs) / 1000.0);
            endErrors.add(Math.abs(truth.endMs - prediction.endMs) / 1000.0);

            JsonObject row = new JsonObject();
            row.addProperty("gold_id", truth.id);
            row.addProperty("prediction_id", prediction.id);
            row.addProperty("gold_label", truth.label);
            row.addProperty("prediction_label", prediction.label);
            row.addProperty("score", round(match.score));
            row.addProperty("participant_jaccard", round(match.participantJaccard));
            if (Double.isFinite(match.centerDistance)) row.addProperty("center_error_world", round(match.centerDistance));
            matchedRows.add(row);
        }

        double precision = ratio(teamfightTp, teamfightTp + teamfightFp);
        double recall = ratio(teamfightTp, teamfightTp + teamfightFn);
        double laneFalseRate = ratio(laneFalseTeamfights, laneInteractions);
        double participantMacroF1 = participantF1.stream().mapToDouble(Double::doubleValue).average().orElse(0);
        double participantMicroF1 = f1(participantTp, participantFp, participantFn);
        double centerMedian = median(centerErrors);
        double centerP90 = percentile(centerErrors, 0.90);

        JsonObject result = new JsonObject();
        result.addProperty("schema", GoldenSampleStore.EVALUATION_SCHEMA);
        result.addProperty("scope", "match");
        result.addProperty("generated_at", Instant.now().toString());
        result.addProperty("match_id", GoldenSampleStore.longValue(goldDocument, "match_id", 0));
        result.addProperty("annotator", GoldenSampleStore.string(goldDocument, "annotator", "unknown"));
        result.addProperty("annotation_status", GoldenSampleStore.string(goldDocument, "status", "draft"));
        result.addProperty("provisional", GoldenSampleStore.string(goldDocument, "status", "draft").equals("draft"));
        result.addProperty("gold_events", gold.size());
        result.addProperty("predicted_events", predictions.size());
        result.addProperty("matched_events", goldMatches.size());

        JsonObject metrics = new JsonObject();
        metrics.add("teamfight", metricGroup(teamfightTp, teamfightFp, teamfightFn, precision, recall));
        JsonObject lane = new JsonObject();
        lane.addProperty("samples", laneInteractions);
        lane.addProperty("false_teamfights", laneFalseTeamfights);
        lane.addProperty("false_positive_rate", round(laneFalseRate));
        metrics.add("lane_harassment", lane);
        JsonObject twoVTwo = new JsonObject();
        twoVTwo.addProperty("samples", twoVersusTwo);
        twoVTwo.addProperty("teamfight_upgrades", twoVersusTwoUpgrades);
        metrics.add("two_versus_two", twoVTwo);
        JsonObject participants = new JsonObject();
        participants.addProperty("macro_f1", round(participantMacroF1));
        participants.addProperty("micro_f1", round(participantMicroF1));
        participants.addProperty("matched_events", participantF1.size());
        participants.addProperty("true_positive", participantTp);
        participants.addProperty("false_positive", participantFp);
        participants.addProperty("false_negative", participantFn);
        metrics.add("participants", participants);
        JsonObject location = new JsonObject();
        location.addProperty("samples", centerErrors.size());
        location.addProperty("median_error_world", roundOrNull(centerMedian));
        location.addProperty("p90_error_world", roundOrNull(centerP90));
        metrics.add("location", location);
        JsonObject boundaries = new JsonObject();
        boundaries.addProperty("start_median_error_seconds", roundOrNull(median(startErrors)));
        boundaries.addProperty("end_median_error_seconds", roundOrNull(median(endErrors)));
        metrics.add("boundaries", boundaries);
        metrics.add("classification_confusion", confusion(confusion));
        result.add("metrics", metrics);

        JsonObject gates = new JsonObject();
        gates.add("teamfight_precision", gate(precision, 0.95, true, teamfightTp + teamfightFp));
        gates.add("teamfight_recall", gate(recall, 0.85, true, teamfightTp + teamfightFn));
        gates.add("lane_false_positive", gate(laneFalseRate, 0.03, false, laneInteractions));
        gates.add("two_versus_two_upgrades", gate(twoVersusTwoUpgrades, 0, false, twoVersusTwo));
        gates.add("participant_macro_f1", gate(participantMacroF1, 0.92, true, participantF1.size()));
        gates.add("center_median_error", gate(centerMedian, 400, false, centerErrors.size()));
        result.add("gates", gates);
        result.add("matches", matchedRows);
        result.add("unmatched_gold", unmatchedGold(gold, goldMatches));
        result.add("unmatched_predictions", unmatchedPredictions(predictions, predictionMatches));
        return result;
    }

    static JsonObject aggregate(String annotator, List<JsonObject> evaluations) {
        int teamfightTp = 0;
        int teamfightFp = 0;
        int teamfightFn = 0;
        int laneSamples = 0;
        int laneFalseTeamfights = 0;
        int twoVTwoSamples = 0;
        int twoVTwoUpgrades = 0;
        int participantTp = 0;
        int participantFp = 0;
        int participantFn = 0;
        int participantSamples = 0;
        double participantMacroTotal = 0;
        List<Double> centerErrors = new ArrayList<>();
        JsonArray perMatch = new JsonArray();

        for (JsonObject evaluation : evaluations) {
            JsonObject metrics = GoldenSampleStore.object(evaluation, "metrics");
            JsonObject teamfight = GoldenSampleStore.object(metrics, "teamfight");
            teamfightTp += (int) GoldenSampleStore.longValue(teamfight, "true_positive", 0);
            teamfightFp += (int) GoldenSampleStore.longValue(teamfight, "false_positive", 0);
            teamfightFn += (int) GoldenSampleStore.longValue(teamfight, "false_negative", 0);
            JsonObject lane = GoldenSampleStore.object(metrics, "lane_harassment");
            laneSamples += (int) GoldenSampleStore.longValue(lane, "samples", 0);
            laneFalseTeamfights += (int) GoldenSampleStore.longValue(lane, "false_teamfights", 0);
            JsonObject twoVTwo = GoldenSampleStore.object(metrics, "two_versus_two");
            twoVTwoSamples += (int) GoldenSampleStore.longValue(twoVTwo, "samples", 0);
            twoVTwoUpgrades += (int) GoldenSampleStore.longValue(twoVTwo, "teamfight_upgrades", 0);
            JsonObject participants = GoldenSampleStore.object(metrics, "participants");
            int matched = (int) GoldenSampleStore.longValue(participants, "matched_events", 0);
            participantSamples += matched;
            participantMacroTotal += number(participants, "macro_f1", 0) * matched;
            participantTp += (int) GoldenSampleStore.longValue(participants, "true_positive", 0);
            participantFp += (int) GoldenSampleStore.longValue(participants, "false_positive", 0);
            participantFn += (int) GoldenSampleStore.longValue(participants, "false_negative", 0);
            for (JsonElement value : GoldenSampleStore.array(evaluation, "matches")) {
                if (!value.isJsonObject()) continue;
                Double error = nullableDouble(value.getAsJsonObject(), "center_error_world");
                if (error != null && Double.isFinite(error)) centerErrors.add(error);
            }
            JsonObject row = new JsonObject();
            row.addProperty("match_id", GoldenSampleStore.longValue(evaluation, "match_id", 0));
            row.addProperty("gold_events", GoldenSampleStore.longValue(evaluation, "gold_events", 0));
            row.addProperty("predicted_events", GoldenSampleStore.longValue(evaluation, "predicted_events", 0));
            row.addProperty("matched_events", GoldenSampleStore.longValue(evaluation, "matched_events", 0));
            perMatch.add(row);
        }

        double precision = ratio(teamfightTp, teamfightTp + teamfightFp);
        double recall = ratio(teamfightTp, teamfightTp + teamfightFn);
        double laneFalseRate = ratio(laneFalseTeamfights, laneSamples);
        double participantMacroF1 = participantSamples == 0
                ? Double.NaN : participantMacroTotal / participantSamples;
        double participantMicroF1 = participantSamples == 0
                ? Double.NaN : f1(participantTp, participantFp, participantFn);
        double centerMedian = median(centerErrors);

        JsonObject result = new JsonObject();
        result.addProperty("schema", GoldenSampleStore.EVALUATION_SCHEMA);
        result.addProperty("scope", "corpus");
        result.addProperty("generated_at", Instant.now().toString());
        result.addProperty("annotator", annotator);
        result.addProperty("matches_evaluated", evaluations.size());
        result.addProperty("provisional", evaluations.size() < 30);

        JsonObject metrics = new JsonObject();
        metrics.add("teamfight", metricGroup(teamfightTp, teamfightFp, teamfightFn, precision, recall));
        JsonObject lane = new JsonObject();
        lane.addProperty("samples", laneSamples);
        lane.addProperty("false_teamfights", laneFalseTeamfights);
        lane.addProperty("false_positive_rate", round(laneFalseRate));
        metrics.add("lane_harassment", lane);
        JsonObject twoVTwo = new JsonObject();
        twoVTwo.addProperty("samples", twoVTwoSamples);
        twoVTwo.addProperty("teamfight_upgrades", twoVTwoUpgrades);
        metrics.add("two_versus_two", twoVTwo);
        JsonObject participants = new JsonObject();
        participants.addProperty("macro_f1", roundOrNull(participantMacroF1));
        participants.addProperty("micro_f1", roundOrNull(participantMicroF1));
        participants.addProperty("matched_events", participantSamples);
        participants.addProperty("true_positive", participantTp);
        participants.addProperty("false_positive", participantFp);
        participants.addProperty("false_negative", participantFn);
        metrics.add("participants", participants);
        JsonObject location = new JsonObject();
        location.addProperty("samples", centerErrors.size());
        location.addProperty("median_error_world", roundOrNull(centerMedian));
        location.addProperty("p90_error_world", roundOrNull(percentile(centerErrors, 0.90)));
        metrics.add("location", location);
        result.add("metrics", metrics);

        JsonObject gates = new JsonObject();
        gates.add("corpus_size", corpusGate(evaluations.size()));
        gates.add("teamfight_precision", gate(precision, 0.95, true, teamfightTp + teamfightFp));
        gates.add("teamfight_recall", gate(recall, 0.85, true, teamfightTp + teamfightFn));
        gates.add("lane_false_positive", gate(laneFalseRate, 0.03, false, laneSamples));
        gates.add("two_versus_two_upgrades", gate(twoVTwoUpgrades, 0, false, twoVTwoSamples));
        gates.add("participant_macro_f1", gate(participantMacroF1, 0.92, true, participantSamples));
        gates.add("center_median_error", gate(centerMedian, 400, false, centerErrors.size()));
        result.add("gates", gates);
        result.add("per_match", perMatch);
        return result;
    }

    private static List<GoldEvent> goldEvents(JsonObject document) {
        List<GoldEvent> result = new ArrayList<>();
        JsonArray rows = GoldenSampleStore.array(document, "events");
        for (int index = 0; index < rows.size(); index++) {
            if (!rows.get(index).isJsonObject()) continue;
            JsonObject row = rows.get(index).getAsJsonObject();
            JsonObject center = GoldenSampleStore.object(row, "center");
            result.add(new GoldEvent(index,
                    GoldenSampleStore.string(row, "id", "gold-" + (index + 1)),
                    GoldenSampleStore.string(row, "label", "non_combat"),
                    GoldenSampleStore.longValue(row, "contact_start_ms", 0),
                    GoldenSampleStore.longValue(row, "contact_end_ms", 0),
                    slots(row, "participants"), tags(row), nullableDouble(center, "world_x"),
                    nullableDouble(center, "world_y")));
        }
        return result;
    }

    private static List<Prediction> predictions(JsonObject summary) {
        List<Prediction> result = new ArrayList<>();
        JsonArray rows = GoldenSampleStore.predictedFights(summary);
        MapCoordinateService coordinates = new MapCoordinateService(
                GoldenSampleStore.string(GoldenSampleStore.object(summary, "match"), "patch_name", "unknown"));
        for (int index = 0; index < rows.size(); index++) {
            if (!rows.get(index).isJsonObject()) continue;
            JsonObject row = rows.get(index).getAsJsonObject();
            MapCoordinateService.Point point = coordinates.fromPercent(nullableFloat(row, "x"), nullableFloat(row, "y"));
            result.add(new Prediction(index,
                    GoldenSampleStore.string(row, "id", "prediction-" + (index + 1)),
                    normalizePredictionLabel(GoldenSampleStore.string(row, "kind", "unknown")),
                    GoldenSampleStore.longValue(row, "contact_start", GoldenSampleStore.longValue(row, "start", 0)) * 1000,
                    GoldenSampleStore.longValue(row, "contact_end", GoldenSampleStore.longValue(row, "end", 0)) * 1000,
                    slots(row, "participants"), point == null ? null : (double) point.worldX(),
                    point == null ? null : (double) point.worldY()));
        }
        return result;
    }

    private static JsonObject metricGroup(int tp, int fp, int fn, double precision, double recall) {
        JsonObject result = new JsonObject();
        result.addProperty("true_positive", tp);
        result.addProperty("false_positive", fp);
        result.addProperty("false_negative", fn);
        result.addProperty("precision", round(precision));
        result.addProperty("recall", round(recall));
        result.addProperty("f1", round(precision + recall == 0 ? 0 : 2 * precision * recall / (precision + recall)));
        return result;
    }

    private static String normalizePredictionLabel(String label) {
        return switch (label) {
            case "harass" -> "poke";
            case "lane_trade" -> "trade";
            case "small_skirmish" -> "skirmish";
            default -> label;
        };
    }

    private static double number(JsonObject object, String field, double fallback) {
        JsonElement value = object == null ? null : object.get(field);
        try {
            return value == null || value.isJsonNull() ? fallback : value.getAsDouble();
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static JsonObject gate(double actual, double target, boolean higherIsBetter, int samples) {
        JsonObject result = new JsonObject();
        result.addProperty("samples", samples);
        result.addProperty("evaluable", samples > 0 && Double.isFinite(actual));
        result.addProperty("actual", roundOrNull(actual));
        result.addProperty("target", target);
        result.addProperty("operator", higherIsBetter ? ">=" : "<=");
        result.addProperty("passed", samples > 0 && Double.isFinite(actual)
                && (higherIsBetter ? actual >= target : actual <= target));
        return result;
    }

    private static JsonObject corpusGate(int matches) {
        JsonObject result = new JsonObject();
        result.addProperty("samples", matches);
        result.addProperty("evaluable", true);
        result.addProperty("actual", matches);
        result.addProperty("target", 30);
        result.addProperty("operator", ">=");
        result.addProperty("passed", matches >= 30);
        return result;
    }

    private static JsonObject confusion(Map<String, Map<String, Integer>> rows) {
        JsonObject result = new JsonObject();
        rows.forEach((truth, predictions) -> {
            JsonObject row = new JsonObject();
            predictions.forEach(row::addProperty);
            result.add(truth, row);
        });
        return result;
    }

    private static JsonArray unmatchedGold(List<GoldEvent> events, Map<Integer, Match> matches) {
        JsonArray result = new JsonArray();
        for (GoldEvent event : events) {
            if (event.label.equals("non_combat") || matches.containsKey(event.index)) continue;
            JsonObject row = new JsonObject();
            row.addProperty("id", event.id);
            row.addProperty("label", event.label);
            row.addProperty("contact_start_ms", event.startMs);
            result.add(row);
        }
        return result;
    }

    private static JsonArray unmatchedPredictions(List<Prediction> events, Map<Integer, Match> matches) {
        JsonArray result = new JsonArray();
        for (Prediction event : events) {
            if (matches.containsKey(event.index)) continue;
            JsonObject row = new JsonObject();
            row.addProperty("id", event.id);
            row.addProperty("kind", event.label);
            row.addProperty("contact_start_ms", event.startMs);
            result.add(row);
        }
        return result;
    }

    private static long overlap(long aStart, long aEnd, long bStart, long bEnd) {
        return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
    }

    private static double temporalScore(GoldEvent gold, Prediction prediction, long overlap, long startDelta) {
        long union = Math.max(gold.endMs, prediction.endMs) - Math.min(gold.startMs, prediction.startMs);
        if (overlap > 0 && union > 0) return Math.min(1, (double) overlap / union + 0.35);
        return Math.max(0, 1.0 - startDelta / 8_000.0);
    }

    private static double spatialScore(Double ax, Double ay, Double bx, Double by) {
        double distance = distance(ax, ay, bx, by);
        return Double.isFinite(distance) ? Math.max(0, 1.0 - distance / 3200.0) : 0;
    }

    private static double distance(Double ax, Double ay, Double bx, Double by) {
        return ax == null || ay == null || bx == null || by == null
                ? Double.NaN : Math.hypot(ax - bx, ay - by);
    }

    private static double jaccard(Set<Integer> left, Set<Integer> right) {
        if (left.isEmpty() && right.isEmpty()) return 1;
        Set<Integer> union = new HashSet<>(left);
        union.addAll(right);
        Set<Integer> intersection = new HashSet<>(left);
        intersection.retainAll(right);
        return union.isEmpty() ? 0 : (double) intersection.size() / union.size();
    }

    private static boolean isTwoVersusTwo(Set<Integer> participants) {
        int radiant = (int) participants.stream().filter(slot -> slot < 5).count();
        return radiant == 2 && participants.size() - radiant == 2;
    }

    private static double f1(int tp, int fp, int fn) {
        int denominator = 2 * tp + fp + fn;
        return denominator == 0 ? 0 : (double) (2 * tp) / denominator;
    }

    private static double ratio(int numerator, int denominator) {
        return denominator == 0 ? Double.NaN : (double) numerator / denominator;
    }

    private static double median(List<Double> values) {
        return percentile(values, 0.50);
    }

    private static double percentile(List<Double> values, double percentile) {
        if (values.isEmpty()) return Double.NaN;
        List<Double> sorted = values.stream().filter(Double::isFinite).sorted().toList();
        if (sorted.isEmpty()) return Double.NaN;
        int index = (int) Math.ceil(percentile * sorted.size()) - 1;
        return sorted.get(Math.max(0, Math.min(sorted.size() - 1, index)));
    }

    private static Set<Integer> slots(JsonObject row, String field) {
        Set<Integer> result = new HashSet<>();
        for (JsonElement value : GoldenSampleStore.array(row, field)) {
            int slot = value.getAsInt();
            if (slot >= 0 && slot < 10) result.add(slot);
        }
        return result;
    }

    private static Set<String> tags(JsonObject row) {
        Set<String> result = new HashSet<>();
        for (JsonElement value : GoldenSampleStore.array(row, "tags")) result.add(value.getAsString());
        return result;
    }

    private static Float nullableFloat(JsonObject row, String field) {
        JsonElement value = row.get(field);
        try {
            return value == null || value.isJsonNull() ? null : value.getAsFloat();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static Double nullableDouble(JsonObject row, String field) {
        JsonElement value = row.get(field);
        try {
            return value == null || value.isJsonNull() ? null : value.getAsDouble();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static Number roundOrNull(double value) {
        return Double.isFinite(value) ? round(value) : 0;
    }

    private static double round(double value) {
        return Double.isFinite(value) ? Math.round(value * 10_000.0) / 10_000.0 : 0;
    }

    private record GoldEvent(int index, String id, String label, long startMs, long endMs,
            Set<Integer> participants, Set<String> tags, Double worldX, Double worldY) {}
    private record Prediction(int index, String id, String label, long startMs, long endMs,
            Set<Integer> participants, Double worldX, Double worldY) {}
    private record Candidate(int goldIndex, int predictionIndex, double score,
            double participantJaccard, double centerDistance) {}
    private record Match(int goldIndex, int predictionIndex, double score,
            double participantJaccard, double centerDistance) {}
}
