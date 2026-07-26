package opendota;

import static opendota.PlayerReportAtomicTestFixture.completeModulesForPosition;
import static opendota.PlayerReportAtomicTestFixture.blockEveryFightDutyGate;
import static opendota.PlayerReportAtomicTestFixture.player;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

class PlayerReportAnalysisAtomicComponentsTest {
    @Test
    void emitsCoreLaneEconomyAndResourceAtomicComponents() {
        JsonObject modules = completeModulesForPosition(1);
        PlayerReportAnalysis.enrich(modules, null, 1800);

        JsonObject report = report(modules, 0);
        assertEquals(PlayerReportBaseComponents.MODEL,
                report.get("base_component_model").getAsString());
        assertComponentKeys(report, "lane_execution",
                "lane_model_score", "core_lane_opportunity_conversion");
        assertComponentKeys(report, "farm_efficiency",
                "relative_gpm", "relative_xpm", "relative_net_worth");
        assertComponentKeys(report, "resource_decision",
                "secured_lane_opportunity_ratio",
                "hard_gated_route_match",
                "confirmed_lane_jungle_cycles");
        assertEquals(75.0, component(dimension(report, "lane_execution"), "lane_model_score")
                .get("local_weight").getAsDouble(), 0.01);
        assertEquals(25.0, component(dimension(report, "lane_execution"),
                "core_lane_opportunity_conversion").get("local_weight").getAsDouble(), 0.01);
        assertEquals(33.3333, component(dimension(report, "farm_efficiency"), "relative_gpm")
                .get("local_weight").getAsDouble(), 0.0001);
        assertEquals(33.3333, component(dimension(report, "farm_efficiency"), "relative_xpm")
                .get("local_weight").getAsDouble(), 0.0001);
        assertEquals(33.3334, component(dimension(report, "farm_efficiency"), "relative_net_worth")
                .get("local_weight").getAsDouble(), 0.0001);
        assertEquals(35.0, component(dimension(report, "resource_decision"),
                "secured_lane_opportunity_ratio").get("local_weight").getAsDouble(), 0.01);
        assertEquals(50.0, component(dimension(report, "resource_decision"), "hard_gated_route_match")
                .get("local_weight").getAsDouble(), 0.01);
        assertEquals(15.0, component(dimension(report, "resource_decision"),
                "confirmed_lane_jungle_cycles").get("local_weight").getAsDouble(), 0.01);
        JsonObject routeMetrics = component(dimension(report, "resource_decision"),
                "hard_gated_route_match").getAsJsonObject("raw_metrics");
        assertEquals(2, routeMetrics.get("enabled_windows").getAsInt());
        assertEquals(1, routeMetrics.get("matched_windows").getAsInt());
        assertEquals(1, routeMetrics.get("missed_windows").getAsInt());
        assertEquals(240, routeMetrics.get("estimated_loss").getAsInt());
        assertEquals(2, routeMetrics.get("confirmed_cycles").getAsInt());
        assertDimensionRecomputes(report, "lane_execution");
        assertDimensionRecomputes(report, "farm_efficiency");
        assertDimensionRecomputes(report, "resource_decision");
    }

    @Test
    void usesSupportComponentsWithoutCoreResourceClaims() {
        JsonObject modules = completeModulesForPosition(5);
        PlayerReportAnalysis.enrich(modules, null, 1800);

        JsonObject report = report(modules, 0);
        assertComponentKeys(report, "lane_execution",
                "lane_model_score", "support_route_outcome");
        assertComponentKeys(report, "resource_decision",
                "support_route_outcome", "stack_team_value");
        assertEquals(65.0, component(dimension(report, "lane_execution"), "lane_model_score")
                .get("local_weight").getAsDouble(), 0.01);
        assertEquals(35.0, component(dimension(report, "lane_execution"), "support_route_outcome")
                .get("local_weight").getAsDouble(), 0.01);
        assertEquals(65.0, component(dimension(report, "resource_decision"), "support_route_outcome")
                .get("local_weight").getAsDouble(), 0.01);
        assertEquals(35.0, component(dimension(report, "resource_decision"), "stack_team_value")
                .get("local_weight").getAsDouble(), 0.01);
        assertNoComponent(report, "resource_decision",
                "secured_lane_opportunity_ratio");
    }

    @Test
    void missingXpmIsExcludedInsteadOfScoredAsZero() {
        JsonObject modules = completeModulesForPosition(1);
        player(modules, 0).remove("xpm");
        PlayerReportAnalysis.enrich(modules, null, 1800);

        JsonObject economy = dimension(report(modules, 0), "farm_efficiency");
        JsonObject xpm = component(economy, "relative_xpm");
        assertFalse(xpm.get("available").getAsBoolean());
        assertEquals("counterpart_or_subject_xpm_missing",
                xpm.get("missing_reason").getAsString());
        assertEquals(50.0, component(economy, "relative_gpm")
                .get("effective_local_weight").getAsDouble(), 0.01);
        assertEquals(50.0, component(economy, "relative_net_worth")
                .get("effective_local_weight").getAsDouble(), 0.01);
    }

    @Test
    void emitsCombatDutyAndVisionComponentsWithRoleTargets() {
        JsonObject modules = completeModulesForPosition(4);
        PlayerReportAnalysis.enrich(modules, null, 1800);

        JsonObject report = report(modules, 0);
        assertComponentKeys(report, "combat_output",
                "team_damage_share_vs_role_target",
                "fight_damage_share_vs_role_target",
                "kill_conversion");
        assertComponentKeys(report, "combat_duty",
                "hard_gated_duty_average",
                "team_utility_share_vs_role_target");
        assertComponentKeys(report, "vision_team",
                "team_vision_share_vs_role_target",
                "own_ward_average_score");

        JsonObject damage = component(dimension(report, "combat_output"),
                "team_damage_share_vs_role_target");
        assertEquals(55.0, damage.get("local_weight").getAsDouble(), 0.01);
        assertEquals(0.14, damage.getAsJsonObject("raw_metrics")
                .get("role_target_share").getAsDouble(), 0.0001);
        assertTrue(damage.getAsJsonObject("comparison").has("subject"));
        JsonObject fightDamage = component(dimension(report, "combat_output"),
                "fight_damage_share_vs_role_target");
        assertHasEvidenceRef(fightDamage, "combat:fights");
        assertHasEvidenceRef(fightDamage, "combat:fights:slot:0");

        assertEquals(25.0, fightDamage.get("local_weight").getAsDouble(), 0.01);
        assertEquals(20.0, component(dimension(report, "combat_output"),
                "kill_conversion").get("local_weight").getAsDouble(), 0.01);
        assertEquals(75.0, component(dimension(report, "combat_duty"),
                "hard_gated_duty_average").get("local_weight").getAsDouble(), 0.01);
        assertEquals(25.0, component(dimension(report, "combat_duty"),
                "team_utility_share_vs_role_target").get("local_weight").getAsDouble(), 0.01);
        assertEquals(65.0, component(dimension(report, "vision_team"),
                "team_vision_share_vs_role_target").get("local_weight").getAsDouble(), 0.01);
        assertEquals(35.0, component(dimension(report, "vision_team"),
                "own_ward_average_score").get("local_weight").getAsDouble(), 0.01);
        assertDimensionRecomputes(report, "combat_output");
        assertDimensionRecomputes(report, "combat_duty");
        assertDimensionRecomputes(report, "vision_team");
    }

    @Test
    void excludesCombatDutyWhenNoFightPassesResponsibilityGate() {
        JsonObject modules = completeModulesForPosition(4);
        blockEveryFightDutyGate(modules);
        PlayerReportAnalysis.enrich(modules, null, 1800);

        JsonObject duty = dimension(report(modules, 0), "combat_duty");
        assertFalse(duty.get("available").getAsBoolean());
        assertFalse(duty.has("score"));
        assertFalse(duty.has("base_score"));
        assertFalse(duty.has("final_score"));
        assertEquals(0.0, duty.get("effective_weight").getAsDouble(), 0.01);
        assertEquals("no_passed_responsibility_gate_fights",
                component(duty, "hard_gated_duty_average")
                        .get("missing_reason").getAsString());
        assertFalse(component(duty, "team_utility_share_vs_role_target")
                .get("available").getAsBoolean());
        assertEquals("responsibility_gate_not_passed",
                component(duty, "team_utility_share_vs_role_target")
                        .get("suppression_reason").getAsString());
        var calculation = PlayerReportBaseComponents.fromJson(
                duty.getAsJsonArray("base_components"));
        assertFalse(calculation.available());
        assertNull(calculation.score());
        assertUnavailableDimensionCannotContribute(report(modules, 0), duty);
    }

    @Test
    void emitsSurvivalObjectiveTempoAndExecutionComponents() {
        JsonObject modules = completeModulesForPosition(2);
        PlayerReportAnalysis.enrich(modules, null, 1800);

        JsonObject report = report(modules, 0);
        assertComponentKeys(report, "survival_risk",
                "deaths_vs_same_position", "dead_time_percentage_score");
        assertComponentKeys(report, "objective_conversion",
                "team_tower_damage_share_vs_role_target",
                "tower_roshan_finish_contribution");
        assertComponentKeys(report, "map_tempo",
                "team_tempo_share_vs_role_target",
                "tp_rune_activation_relative_score", "fight_presence_vs_role_target");
        assertComponentKeys(report, "observable_execution",
                "action_continuity_apm", "observable_uses_per_minute_vs_opponent");

        assertEquals(65.0, component(dimension(report, "survival_risk"),
                "deaths_vs_same_position").get("local_weight").getAsDouble(), 0.01);
        assertEquals(35.0, component(dimension(report, "survival_risk"),
                "dead_time_percentage_score").get("local_weight").getAsDouble(), 0.01);
        assertEquals(75.0, component(dimension(report, "objective_conversion"),
                "team_tower_damage_share_vs_role_target").get("local_weight").getAsDouble(), 0.01);
        assertEquals(25.0, component(dimension(report, "objective_conversion"),
                "tower_roshan_finish_contribution").get("local_weight").getAsDouble(), 0.01);
        assertEquals(45.0, component(dimension(report, "map_tempo"),
                "team_tempo_share_vs_role_target").get("local_weight").getAsDouble(), 0.01);
        assertEquals(25.0, component(dimension(report, "map_tempo"),
                "tp_rune_activation_relative_score").get("local_weight").getAsDouble(), 0.01);
        assertEquals(30.0, component(dimension(report, "map_tempo"),
                "fight_presence_vs_role_target").get("local_weight").getAsDouble(), 0.01);
        assertEquals(60.0, component(dimension(report, "observable_execution"),
                "action_continuity_apm").get("local_weight").getAsDouble(), 0.01);
        assertEquals(40.0, component(dimension(report, "observable_execution"),
                "observable_uses_per_minute_vs_opponent").get("local_weight").getAsDouble(), 0.01);

        JsonObject activation = component(dimension(report, "map_tempo"),
                "tp_rune_activation_relative_score");
        JsonObject activationMetrics = activation.getAsJsonObject("raw_metrics");
        assertTrue(activation.getAsJsonObject("comparison").has("subject"));
        assertTrue(activationMetrics.has("tp_subject"));
        assertTrue(activationMetrics.has("tp_reference"));
        assertTrue(activationMetrics.has("tp_score"));
        assertTrue(activationMetrics.has("rune_subject"));
        assertTrue(activationMetrics.has("rune_reference"));
        assertTrue(activationMetrics.has("rune_score"));
        assertHasEvidenceRef(activation, "players:slot:0:teleport_uses");
        assertHasEvidenceRef(activation, "players:slot:5:teleport_uses");

        assertDimensionRecomputes(report, "survival_risk");
        assertDimensionRecomputes(report, "objective_conversion");
        assertDimensionRecomputes(report, "map_tempo");
        assertDimensionRecomputes(report, "observable_execution");
        assertAllAvailableDimensionsRecompute(report);
    }

    @Test
    void doesNotTurnActionContinuityIntoPerfectScoreWhenOpponentUsesAreMissing() {
        JsonObject modules = completeModulesForPosition(2);
        JsonObject counterpart = player(modules, 5);
        counterpart.remove("ability_casts");
        counterpart.remove("item_uses");
        PlayerReportAnalysis.enrich(modules, null, 1800);

        JsonObject execution = dimension(report(modules, 0), "observable_execution");
        JsonObject continuity = component(execution, "action_continuity_apm");
        JsonObject relativeUses = component(execution,
                "observable_uses_per_minute_vs_opponent");
        assertFalse(relativeUses.get("available").getAsBoolean());
        assertEquals(100.0,
                continuity.get("effective_local_weight").getAsDouble(), 0.01);
        assertTrue(continuity.get("normalized_score").getAsDouble() < 100);
        assertDimensionRecomputes(report(modules, 0), "observable_execution");
    }

    @Test
    void keepsUnavailableTpSubmetricsNullInsteadOfZero() {
        JsonObject modules = completeModulesForPosition(2);
        player(modules, 5).remove("teleport_uses");
        PlayerReportAnalysis.enrich(modules, null, 1800);

        JsonObject activationMetrics = component(dimension(report(modules, 0), "map_tempo"),
                "tp_rune_activation_relative_score").getAsJsonObject("raw_metrics");
        assertFalse(activationMetrics.get("tp_available").getAsBoolean());
        assertTrue(activationMetrics.get("tp_subject").isJsonNull());
        assertTrue(activationMetrics.get("tp_reference").isJsonNull());
        assertTrue(activationMetrics.get("tp_score").isJsonNull());
        assertTrue(activationMetrics.get("rune_score").isJsonPrimitive());
    }

    private static JsonObject report(JsonObject modules, int slot) {
        return PlayerReportAtomicTestFixture.player(modules, slot)
                .getAsJsonObject("report");
    }

    private static JsonObject dimension(JsonObject report, String key) {
        for (JsonElement element : report.getAsJsonArray("dimensions")) {
            JsonObject row = element.getAsJsonObject();
            if (key.equals(row.get("key").getAsString())) return row;
        }
        throw new AssertionError("Missing dimension " + key);
    }

    private static JsonObject component(JsonObject dimension, String key) {
        for (JsonElement element : dimension.getAsJsonArray("base_components")) {
            JsonObject row = element.getAsJsonObject();
            if (key.equals(row.get("key").getAsString())) return row;
        }
        throw new AssertionError("Missing component " + key);
    }

    private static void assertComponentKeys(JsonObject report, String dimensionKey,
            String... expectedKeys) {
        JsonArray rows = dimension(report, dimensionKey)
                .getAsJsonArray("base_components");
        List<String> actual = new ArrayList<>();
        for (JsonElement element : rows) {
            actual.add(element.getAsJsonObject().get("key").getAsString());
        }
        assertEquals(List.of(expectedKeys), actual);
    }

    private static void assertNoComponent(JsonObject report, String dimensionKey,
            String componentKey) {
        assertThrows(AssertionError.class,
                () -> component(dimension(report, dimensionKey), componentKey));
    }

    private static void assertHasEvidenceRef(JsonObject component, String expected) {
        for (JsonElement element : component.getAsJsonArray("evidence_refs")) {
            if (expected.equals(element.getAsString())) return;
        }
        throw new AssertionError("Missing evidence reference " + expected);
    }

    private static void assertUnavailableDimensionCannotContribute(JsonObject report,
            JsonObject unavailableDimension) {
        assertFalse(unavailableDimension.get("available").getAsBoolean());
        int availableWeight = 0;
        for (JsonElement element : report.getAsJsonArray("dimensions")) {
            JsonObject dimension = element.getAsJsonObject();
            if (dimension.get("available").getAsBoolean()) {
                availableWeight += dimension.get("weight").getAsInt();
            }
        }
        assertEquals(availableWeight, report.get("available_weight").getAsInt());
    }

    private static void assertAllAvailableDimensionsRecompute(JsonObject report) {
        for (JsonElement element : report.getAsJsonArray("dimensions")) {
            JsonObject row = element.getAsJsonObject();
            if (!row.get("available").getAsBoolean()) continue;
            assertTrue(row.getAsJsonArray("base_components").size() > 0);
            assertDimensionRecomputes(report, row.get("key").getAsString());
        }
    }

    private static void assertDimensionRecomputes(JsonObject report,
            String dimensionKey) {
        JsonObject row = dimension(report, dimensionKey);
        var calculation = PlayerReportBaseComponents.fromJson(
                row.getAsJsonArray("base_components"));
        assertTrue(calculation.available());
        assertEquals(row.get("score").getAsDouble(),
                calculation.score(), 0.05);
    }
}
