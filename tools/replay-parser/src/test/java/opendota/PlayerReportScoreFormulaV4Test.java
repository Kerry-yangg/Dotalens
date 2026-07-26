package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

class PlayerReportScoreFormulaV4Test {
    private static final double EPSILON = 0.05;

    @Test
    void exposesThreeScorePathsAndRecomputableDimensionAndOverallScores() {
        JsonObject report = report(
                dimension("lane_execution", "lane", 60, 60, true),
                dimension("combat_duty", "utility", 40, 70, true));
        report.getAsJsonArray("root_causes").add(root(
                "lane-result", "lane_execution", "improvement", 100,
                impacts("lane_execution", -8), "lane:600"));
        report.getAsJsonArray("root_causes").add(root(
                "timing-window", "combat_timing", "improvement", 80,
                impacts("combat_duty", -10), "combat:fight-7:0"));
        report.getAsJsonArray("root_causes").add(root(
                "team-context", "unknown_team_context", "improvement", 100,
                impacts("team", -12), "timeline:objective:900"));

        PlayerReportScoringV4.apply(report);

        assertEquals("player-report/4.0", report.get("model").getAsString());
        JsonObject scoreCard = report.getAsJsonObject("score_card");
        assertEquals(64.0, scoreCard.get("base_score").getAsDouble(), EPSILON);
        assertEquals(-3.2, scoreCard.get("behavior_modifier").getAsDouble(), EPSILON);
        assertEquals(60.8, scoreCard.get("final_score").getAsDouble(), EPSILON);
        assertEquals(scoreCard.get("final_score").getAsDouble(),
                scoreCard.get("overall_score").getAsDouble(), EPSILON);

        JsonObject lane = findDimension(report, "lane_execution");
        assertDimensionScores(lane, 60, 0, 60);
        JsonObject combat = findDimension(report, "combat_duty");
        assertDimensionScores(combat, 70, -8, 62);

        assertEquals("embedded", onlyImpact(findRoot(report, "lane-result")).get("score_path").getAsString());
        assertEquals(0, onlyImpact(findRoot(report, "lane-result")).get("applied_delta").getAsDouble(), EPSILON);
        assertEquals("modifier", onlyImpact(findRoot(report, "timing-window")).get("score_path").getAsString());
        assertEquals(-8, onlyImpact(findRoot(report, "timing-window")).get("applied_delta").getAsDouble(), EPSILON);
        assertEquals("context_only", onlyImpact(findRoot(report, "team-context")).get("score_path").getAsString());
        assertEquals(0, onlyImpact(findRoot(report, "team-context")).get("applied_delta").getAsDouble(), EPSILON);

        assertRecomputable(scoreCard);
        JsonObject audit = scoreCard.getAsJsonObject("audit");
        assertTrue(audit.get("recomputation_valid").getAsBoolean());
        assertEquals(1, audit.getAsJsonObject("score_path_counts").get("embedded").getAsInt());
        assertEquals(1, audit.getAsJsonObject("score_path_counts").get("modifier").getAsInt());
        assertEquals(1, audit.getAsJsonObject("score_path_counts").get("context_only").getAsInt());
    }

    @Test
    void suppressesTheSameResultAcrossMultipleRoots() {
        JsonObject report = report(dimension("combat_duty", "utility", 100, 70, true));
        report.getAsJsonArray("root_causes").add(root(
                "timing-a", "combat_timing", "improvement", 90,
                impacts("combat_duty", -10), "combat:fight-shared:0"));
        report.getAsJsonArray("root_causes").add(root(
                "timing-b", "combat_timing", "improvement", 80,
                impacts("combat_duty", -10), "combat:fight-shared:0"));

        PlayerReportScoringV4.apply(report);

        JsonObject dimension = findDimension(report, "combat_duty");
        assertEquals(-6.0, dimension.get("behavior_modifier").getAsDouble(), EPSILON);
        JsonArray components = dimension.getAsJsonArray("scoring_components");
        assertEquals(2, components.size());
        long applied = objects(components).stream()
                .filter(item -> Math.abs(item.get("applied_delta").getAsDouble()) > 0.001)
                .count();
        assertEquals(1, applied);
        JsonObject suppressed = objects(components).stream()
                .filter(item -> "suppressed_duplicate".equals(item.get("dedupe_status").getAsString()))
                .findFirst().orElseThrow();
        assertEquals(0, suppressed.get("applied_delta").getAsDouble(), EPSILON);
        assertEquals("duplicate_effect", suppressed.get("suppression_reason").getAsString());
        assertTrue(Math.abs(onlyImpact(findRoot(report, "timing-a"))
                .get("applied_delta").getAsDouble()) > 0.001);
        assertEquals(0, onlyImpact(findRoot(report, "timing-b"))
                .get("applied_delta").getAsDouble(), EPSILON);

        Set<String> appliedKeys = new HashSet<>();
        for (JsonObject component : objects(components)) {
            if (Math.abs(component.get("applied_delta").getAsDouble()) <= 0.001) continue;
            assertTrue(appliedKeys.add(component.get("dedupe_key").getAsString()));
        }
    }

    @Test
    void capsOneRootCauseAtSixWeightedOverallPoints() {
        JsonObject report = report(
                dimension("combat_duty", "utility", 50, 80, true),
                dimension("survival_risk", "survival", 50, 80, true));
        report.getAsJsonArray("root_causes").add(root(
                "one-root", "combat_timing", "improvement", 100,
                impacts("combat_duty", -25, "survival_risk", -25),
                "combat:fight-root:0"));

        PlayerReportScoringV4.apply(report);

        JsonObject root = findRoot(report, "one-root");
        JsonObject summary = root.getAsJsonObject("scoring_summary");
        assertEquals(25.0, summary.get("candidate_negative_overall").getAsDouble(), EPSILON);
        assertEquals(6.0, summary.get("applied_negative_overall").getAsDouble(), EPSILON);
        assertTrue(summary.get("root_cap_applied").getAsBoolean());
        assertTrue(summary.get("root_cap_factor").getAsDouble() < 1);

        double weightedPenalty = objects(root.getAsJsonArray("scoring_impacts")).stream()
                .mapToDouble(item -> {
                    JsonObject dimension = findDimension(report, item.get("dimension").getAsString());
                    double applied = item.get("applied_delta").getAsDouble();
                    return applied < 0 ? -applied * dimension.get("effective_weight").getAsDouble() / 100.0 : 0;
                })
                .sum();
        assertTrue(weightedPenalty <= 6.0 + EPSILON);
    }

    @Test
    void capsPerDimensionThenCapsFullMatchBehaviorAdjustment() {
        JsonObject report = report(dimension("combat_duty", "utility", 100, 80, true));
        for (int index = 0; index < 3; index++) {
            report.getAsJsonArray("root_causes").add(root(
                    "root-" + index, "combat_timing", "improvement", 100,
                    impacts("combat_duty", -25), "combat:fight-" + index + ":0"));
        }

        PlayerReportScoringV4.apply(report);

        JsonObject dimension = findDimension(report, "combat_duty");
        JsonObject cap = dimension.getAsJsonObject("modifier_cap");
        assertEquals(-18.0, cap.get("before_dimension_cap").getAsDouble(), EPSILON);
        assertEquals(-15.0, cap.get("after_dimension_cap").getAsDouble(), EPSILON);
        assertEquals(-12.0, dimension.get("behavior_modifier").getAsDouble(), EPSILON);
        assertEquals(-12.0, report.getAsJsonObject("score_card")
                .get("behavior_modifier").getAsDouble(), EPSILON);
        assertTrue(report.getAsJsonObject("score_card").getAsJsonObject("audit")
                .getAsJsonObject("overall_cap").get("applied").getAsBoolean());
    }

    @Test
    void excludesMissingDimensionsFromWeightsAndDoesNotInventScores() {
        JsonObject report = report(
                dimension("lane_execution", "lane", 60, 80, true),
                dimension("combat_duty", "utility", 40, 0, false));

        PlayerReportScoringV4.apply(report);

        JsonObject scoreCard = report.getAsJsonObject("score_card");
        assertEquals(80.0, scoreCard.get("base_score").getAsDouble(), EPSILON);
        assertEquals(80.0, scoreCard.get("final_score").getAsDouble(), EPSILON);
        JsonObject lane = findDimension(report, "lane_execution");
        assertEquals(100.0, lane.get("effective_weight").getAsDouble(), EPSILON);
        JsonObject missing = findDimension(report, "combat_duty");
        assertFalse(missing.has("base_score"));
        assertFalse(missing.has("final_score"));
        assertFalse(missing.has("score"));
        assertEquals(0.0, missing.get("effective_weight").getAsDouble(), EPSILON);
    }

    @Test
    void explainsLowScoreWithoutInventingPersonalCriticism() {
        JsonObject report = report(dimension("lane_execution", "lane", 100, 42, true));

        PlayerReportScoringV4.apply(report);

        JsonObject attribution = report.getAsJsonObject("score_card")
                .getAsJsonObject("attribution_summary");
        assertTrue(attribution.get("low_score_without_determinate_criticism").getAsBoolean());
        assertEquals(0, attribution.get("applied_negative_root_count").getAsInt());
        assertFalse(attribution.get("explanation").getAsString().isBlank());
    }

    @Test
    void preservesAtomicBaseComponentsAndRecomputesBaseScore() {
        JsonObject lane = dimension("lane_execution", "lane", 100, 70, true);
        lane.add("base_components", components(
                component("lane_model_score", 80, 75),
                component("core_lane_opportunity_conversion", 40, 25)));
        JsonObject report = report(lane);
        report.addProperty("base_component_model", PlayerReportBaseComponents.MODEL);

        PlayerReportScoringV4.apply(report);

        JsonObject scored = findDimension(report, "lane_execution");
        assertEquals(2, scored.getAsJsonArray("base_components").size());
        assertEquals(70.0, scored.get("base_score").getAsDouble(), EPSILON);
        assertTrue(scored.getAsJsonObject("recomputation")
                .get("base_component_valid").getAsBoolean());
        assertEquals(PlayerReportBaseComponents.MODEL,
                scored.getAsJsonObject("recomputation")
                        .get("base_component_model").getAsString());
        assertEquals(70.0, scored.getAsJsonObject("recomputation")
                .get("base_component_recomputed_score").getAsDouble(), EPSILON);
        assertEquals(100.0, scored.getAsJsonObject("recomputation")
                .get("base_component_weight_sum").getAsDouble(), EPSILON);
        JsonObject audit = report.getAsJsonObject("score_card").getAsJsonObject("audit");
        assertEquals(PlayerReportBaseComponents.MODEL,
                audit.get("base_component_model").getAsString());
        assertEquals(1, audit.get("atomic_dimension_count").getAsInt());
        assertEquals(0, audit.get("aggregate_fallback_count").getAsInt());
    }

    @Test
    void marksCurrentAtomicModelInvalidWhenStoredBaseDoesNotRecompute() {
        JsonObject lane = dimension("lane_execution", "lane", 100, 99, true);
        lane.add("base_components", components(
                component("lane_model_score", 80, 75),
                component("core_lane_opportunity_conversion", 40, 25)));
        JsonObject report = report(lane);
        report.addProperty("base_component_model", PlayerReportBaseComponents.MODEL);

        PlayerReportScoringV4.apply(report);

        assertFalse(report.getAsJsonObject("score_card")
                .getAsJsonObject("audit")
                .get("recomputation_valid").getAsBoolean());
    }

    @Test
    void retainsAggregateFallbackOnlyForLegacyInput() {
        JsonObject report = report(
                dimension("lane_execution", "lane", 100, 70, true));
        PlayerReportScoringV4.apply(report);

        assertEquals("existing_dimension_model",
                findDimension(report, "lane_execution")
                        .getAsJsonArray("base_components")
                        .get(0).getAsJsonObject().get("key").getAsString());
    }

    @Test
    void acceptsAtomicComponentsWhenDimensionIsUnavailableByGate() {
        JsonObject lane = dimension("lane_execution", "lane", 100, 0, false);
        lane.add("base_components", components(
                component("lane_model_score", 80, 75),
                component("core_lane_opportunity_conversion", 40, 25)));
        JsonObject report = report(lane);
        report.addProperty("base_component_model", PlayerReportBaseComponents.MODEL);

        PlayerReportScoringV4.apply(report);

        assertTrue(report.getAsJsonObject("score_card").getAsJsonObject("audit")
                .get("recomputation_valid").getAsBoolean());
        assertTrue(findDimension(report, "lane_execution").getAsJsonObject("recomputation")
                .get("base_component_valid").getAsBoolean());
    }

    @Test
    void doesNotCountUnavailableLegacyDimensionsAsAggregateFallbacks() {
        JsonObject report = report(
                dimension("lane_execution", "lane", 100, 0, false));

        PlayerReportScoringV4.apply(report);

        assertEquals(0, report.getAsJsonObject("score_card").getAsJsonObject("audit")
                .get("aggregate_fallback_count").getAsInt());
    }

    private static JsonObject report(JsonObject... dimensions) {
        JsonObject report = new JsonObject();
        report.addProperty("model", "player-report/3.0");
        report.addProperty("role_confidence", 90);
        report.addProperty("confidence", 90);
        report.addProperty("grade", "C");
        JsonArray dimensionRows = new JsonArray();
        int availableWeight = 0;
        for (JsonObject dimension : dimensions) {
            dimensionRows.add(dimension);
            if (dimension.get("available").getAsBoolean()) {
                availableWeight += dimension.get("weight").getAsInt();
            }
        }
        report.addProperty("available_weight", availableWeight);
        report.add("dimensions", dimensionRows);
        report.add("root_causes", new JsonArray());
        report.add("insights", new JsonArray());
        JsonObject scoreCard = new JsonObject();
        scoreCard.addProperty("overall_score", 0);
        scoreCard.addProperty("confidence", 90);
        scoreCard.addProperty("available_weight", availableWeight);
        scoreCard.add("dimensions", dimensionRows.deepCopy());
        report.add("score_card", scoreCard);
        return report;
    }

    private static JsonObject dimension(String key, String source, int weight, double score,
            boolean available) {
        JsonObject row = new JsonObject();
        row.addProperty("key", key);
        row.addProperty("source", source);
        row.addProperty("weight", weight);
        row.addProperty("effective_weight", available ? weight : 0);
        row.addProperty("available", available);
        row.addProperty("confidence", available ? 90 : 0);
        row.addProperty("status", available ? "stable" : "missing");
        if (available) row.addProperty("score", score);
        row.add("evidence", new JsonArray());
        row.add("missing", new JsonArray());
        return row;
    }

    private static JsonObject component(String key, double score, double weight) {
        JsonObject row = new JsonObject();
        row.addProperty("key", key);
        row.addProperty("label", key);
        row.addProperty("available", true);
        row.addProperty("normalized_score", score);
        row.addProperty("local_weight", weight);
        row.addProperty("effective_local_weight", weight);
        row.addProperty("weighted_contribution", score * weight / 100.0);
        row.addProperty("confidence", 90);
        row.add("comparison", new JsonObject());
        row.add("raw_metrics", new JsonObject());
        row.add("evidence_refs", new JsonArray());
        return row;
    }

    private static JsonArray components(JsonObject... rows) {
        JsonArray result = new JsonArray();
        for (JsonObject row : rows) result.add(row);
        return result;
    }

    private static JsonObject root(String id, String category, String kind, int confidence,
            JsonObject impacts, String... evidenceRefs) {
        JsonObject root = new JsonObject();
        root.addProperty("id", id);
        root.addProperty("category", category);
        root.addProperty("kind", kind);
        root.addProperty("confidence", confidence);
        root.add("dimension_impacts", impacts);
        root.add("raw_dimension_impacts", impacts.deepCopy());
        JsonArray refs = new JsonArray();
        for (String ref : evidenceRefs) refs.add(ref);
        root.add("evidence_refs", refs);
        root.add("source_insight_ids", new JsonArray());
        root.add("consequences", new JsonArray());
        root.addProperty("consequence_count", 0);
        return root;
    }

    private static JsonObject impacts(Object... values) {
        JsonObject result = new JsonObject();
        for (int index = 0; index + 1 < values.length; index += 2) {
            result.addProperty(String.valueOf(values[index]), ((Number) values[index + 1]).doubleValue());
        }
        return result;
    }

    private static JsonObject findDimension(JsonObject report, String key) {
        for (JsonElement element : report.getAsJsonArray("dimensions")) {
            JsonObject dimension = element.getAsJsonObject();
            if (key.equals(dimension.get("key").getAsString())) return dimension;
        }
        throw new AssertionError("Missing dimension " + key);
    }

    private static JsonObject findRoot(JsonObject report, String id) {
        for (JsonElement element : report.getAsJsonArray("root_causes")) {
            JsonObject root = element.getAsJsonObject();
            if (id.equals(root.get("id").getAsString())) return root;
        }
        throw new AssertionError("Missing root " + id);
    }

    private static JsonObject onlyImpact(JsonObject root) {
        JsonArray impacts = root.getAsJsonArray("scoring_impacts");
        assertNotNull(impacts);
        assertEquals(1, impacts.size());
        return impacts.get(0).getAsJsonObject();
    }

    private static java.util.List<JsonObject> objects(JsonArray values) {
        java.util.List<JsonObject> result = new java.util.ArrayList<>();
        for (JsonElement value : values) {
            if (value.isJsonObject()) result.add(value.getAsJsonObject());
        }
        return result;
    }

    private static void assertDimensionScores(JsonObject dimension, double base,
            double modifier, double result) {
        assertEquals(base, dimension.get("base_score").getAsDouble(), EPSILON);
        assertEquals(modifier, dimension.get("behavior_modifier").getAsDouble(), EPSILON);
        assertEquals(result, dimension.get("final_score").getAsDouble(), EPSILON);
        double componentSum = objects(dimension.getAsJsonArray("scoring_components")).stream()
                .mapToDouble(item -> item.get("applied_delta").getAsDouble()).sum();
        assertEquals(modifier, componentSum, EPSILON);
        assertEquals(result, base + componentSum, EPSILON);
    }

    private static void assertRecomputable(JsonObject scoreCard) {
        JsonArray dimensions = scoreCard.getAsJsonArray("dimensions");
        double weight = 0;
        double base = 0;
        double result = 0;
        for (JsonObject dimension : objects(dimensions)) {
            if (!dimension.get("available").getAsBoolean()) continue;
            double effectiveWeight = dimension.get("effective_weight").getAsDouble();
            weight += effectiveWeight;
            base += dimension.get("base_score").getAsDouble() * effectiveWeight;
            result += dimension.get("final_score").getAsDouble() * effectiveWeight;
        }
        assertTrue(weight > 0);
        base /= weight;
        result /= weight;
        assertEquals(base, scoreCard.get("base_score").getAsDouble(), EPSILON);
        assertEquals(result, scoreCard.get("final_score").getAsDouble(), EPSILON);
        assertEquals(result - base, scoreCard.get("behavior_modifier").getAsDouble(), EPSILON);
    }
}
