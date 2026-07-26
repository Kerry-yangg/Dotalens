package opendota;

import java.util.HashSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonNull;

final class PlayerReportBaseComponents {
    static final String MODEL = "player-report-base-components/1.0";
    static final double SCORE_TOLERANCE = 0.05;
    static final double WEIGHT_TOLERANCE = 0.01;

    record ComponentInput(
            String key,
            String label,
            boolean available,
            Double normalizedScore,
            double localWeight,
            int confidence,
            JsonObject comparison,
            JsonObject rawMetrics,
            List<String> evidenceRefs,
            String missingReason,
            String suppressionReason) {
    }

    record ComponentResult(
            ComponentInput input,
            double effectiveLocalWeight,
            Double weightedContribution) {
    }

    record Calculation(
            boolean available,
            Double score,
            List<ComponentResult> components) {
    }

    static ComponentInput available(String key, String label, double score,
            double weight, int confidence, JsonObject comparison,
            JsonObject rawMetrics, List<String> evidenceRefs) {
        return new ComponentInput(key, label, true, score, weight, confidence,
                Objects.requireNonNull(comparison), Objects.requireNonNull(rawMetrics),
                List.copyOf(evidenceRefs), null, null);
    }

    static ComponentInput missing(String key, String label, double weight,
            int confidence, String reason, List<String> evidenceRefs) {
        return new ComponentInput(key, label, false, null, weight, confidence,
                new JsonObject(), new JsonObject(), List.copyOf(evidenceRefs),
                Objects.requireNonNull(reason), null);
    }

    static ComponentInput suppressed(String key, String label, double weight,
            int confidence, String reason, List<String> evidenceRefs) {
        return new ComponentInput(key, label, false, null, weight, confidence,
                new JsonObject(), new JsonObject(), List.copyOf(evidenceRefs),
                null, Objects.requireNonNull(reason));
    }

    static Calculation calculate(List<ComponentInput> inputs) {
        validateInputs(inputs);
        double denominator = inputs.stream()
                .filter(ComponentInput::available)
                .mapToDouble(ComponentInput::localWeight)
                .sum();
        if (denominator <= 0) {
            return new Calculation(false, null, inputs.stream()
                    .map(input -> new ComponentResult(input, 0, null))
                    .toList());
        }

        List<ComponentResult> results = new ArrayList<>();
        double exactScore = 0;
        double roundedWeightTotal = 0;
        double roundedContributionTotal = 0;
        int lastAvailable = -1;
        for (int index = 0; index < inputs.size(); index++) {
            ComponentInput input = inputs.get(index);
            if (!input.available()) {
                results.add(new ComponentResult(input, 0, null));
                continue;
            }
            double effectiveWeight = input.localWeight() * 100.0 / denominator;
            double exactContribution = clampScore(input.normalizedScore())
                    * effectiveWeight / 100.0;
            double roundedWeight = round4(effectiveWeight);
            double roundedContribution = round4(exactContribution);
            results.add(new ComponentResult(input, roundedWeight, roundedContribution));
            roundedWeightTotal += roundedWeight;
            roundedContributionTotal += roundedContribution;
            exactScore += exactContribution;
            lastAvailable = index;
        }
        ComponentResult last = results.get(lastAvailable);
        results.set(lastAvailable, new ComponentResult(last.input(),
                round4(last.effectiveLocalWeight() + 100.0 - roundedWeightTotal),
                round4(last.weightedContribution() + round4(exactScore) - roundedContributionTotal)));
        return new Calculation(true, round2(clampScore(exactScore)), List.copyOf(results));
    }

    static JsonArray toJson(Calculation calculation) {
        Objects.requireNonNull(calculation);
        JsonArray result = new JsonArray();
        for (ComponentResult component : calculation.components()) {
            ComponentInput input = component.input();
            JsonObject json = new JsonObject();
            json.addProperty("key", input.key());
            json.addProperty("label", input.label());
            json.addProperty("available", input.available());
            if (input.normalizedScore() == null) {
                json.add("normalized_score", JsonNull.INSTANCE);
            } else {
                json.addProperty("normalized_score", clampScore(input.normalizedScore()));
            }
            json.addProperty("local_weight", input.localWeight());
            json.addProperty("effective_local_weight", component.effectiveLocalWeight());
            if (component.weightedContribution() == null) {
                json.add("weighted_contribution", JsonNull.INSTANCE);
            } else {
                json.addProperty("weighted_contribution", clampScore(component.weightedContribution()));
            }
            json.addProperty("confidence", input.confidence());
            json.add("comparison", input.comparison().deepCopy());
            json.add("raw_metrics", input.rawMetrics().deepCopy());
            JsonArray refs = new JsonArray();
            input.evidenceRefs().forEach(refs::add);
            json.add("evidence_refs", refs);
            addNullable(json, "missing_reason", input.missingReason());
            addNullable(json, "suppression_reason", input.suppressionReason());
            result.add(json);
        }
        return result;
    }

    static Calculation fromJson(JsonArray json) {
        Objects.requireNonNull(json);
        List<ComponentInput> inputs = new java.util.ArrayList<>();
        for (JsonElement element : json) {
            inputs.add(inputFromJson(element.getAsJsonObject()));
        }
        return calculate(inputs);
    }

    private static ComponentInput inputFromJson(JsonObject json) {
        boolean available = json.get("available").getAsBoolean();
        Double score = nullableDouble(json, "normalized_score");
        List<String> refs = new java.util.ArrayList<>();
        for (JsonElement ref : json.getAsJsonArray("evidence_refs")) {
            refs.add(ref.getAsString());
        }
        return new ComponentInput(json.get("key").getAsString(),
                json.get("label").getAsString(), available, score,
                json.get("local_weight").getAsDouble(), json.get("confidence").getAsInt(),
                json.getAsJsonObject("comparison"), json.getAsJsonObject("raw_metrics"),
                refs, nullableString(json, "missing_reason"),
                nullableString(json, "suppression_reason"));
    }

    private static void validateInputs(List<ComponentInput> inputs) {
        Objects.requireNonNull(inputs);
        Set<String> keys = new HashSet<>();
        for (ComponentInput input : inputs) {
            if (input == null || input.key() == null || input.key().isBlank()
                    || !keys.add(input.key()) || !Double.isFinite(input.localWeight())
                    || input.localWeight() <= 0
                    || (input.available() && (input.normalizedScore() == null
                            || !Double.isFinite(input.normalizedScore())))) {
                throw new IllegalArgumentException("Invalid component input");
            }
        }
    }

    private static double clampScore(double score) {
        return Math.max(0, Math.min(100, score));
    }

    private static double clampScore(Double score) {
        return clampScore(score.doubleValue());
    }

    private static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private static double round4(double value) {
        return Math.round(value * 10000.0) / 10000.0;
    }

    private static void addNullable(JsonObject json, String key, String value) {
        json.add(key, value == null ? JsonNull.INSTANCE : new com.google.gson.JsonPrimitive(value));
    }

    private static Double nullableDouble(JsonObject json, String key) {
        JsonElement value = json.get(key);
        return value == null || value.isJsonNull() ? null : value.getAsDouble();
    }

    private static String nullableString(JsonObject json, String key) {
        JsonElement value = json.get(key);
        return value == null || value.isJsonNull() ? null : value.getAsString();
    }
}
