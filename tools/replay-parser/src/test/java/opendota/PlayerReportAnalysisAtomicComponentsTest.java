package opendota;

import static opendota.PlayerReportAtomicTestFixture.completeModulesForPosition;
import static opendota.PlayerReportAtomicTestFixture.player;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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
