package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

class PlayerReportBaseComponentsTest {
    @Test
    void renormalizesOnlyAvailableComponents() {
        var calculation = PlayerReportBaseComponents.calculate(List.of(
                PlayerReportBaseComponents.available(
                        "relative_gpm", "每分钟经济相对表现", 80, 60, 90,
                        new JsonObject(), new JsonObject(), List.of("player.slot.0.gpm")),
                PlayerReportBaseComponents.missing(
                        "relative_xpm", "每分钟经验相对表现", 40, 80,
                        "counterpart_xpm_missing", List.of())));

        assertTrue(calculation.available());
        assertEquals(80.0, calculation.score(), 0.05);
        assertEquals(100.0,
                calculation.components().get(0).effectiveLocalWeight(), 0.01);
        assertNull(calculation.components().get(1).weightedContribution());
    }

    @Test
    void rejectsDuplicateKeysAndNonFiniteScores() {
        var duplicate = List.of(
                PlayerReportBaseComponents.available(
                        "same", "A", 60, 50, 80,
                        new JsonObject(), new JsonObject(), List.of()),
                PlayerReportBaseComponents.available(
                        "same", "B", 70, 50, 80,
                        new JsonObject(), new JsonObject(), List.of()));

        assertThrows(IllegalArgumentException.class,
                () -> PlayerReportBaseComponents.calculate(duplicate));
        assertThrows(IllegalArgumentException.class,
                () -> PlayerReportBaseComponents.calculate(List.of(
                        PlayerReportBaseComponents.available(
                                "nan", "NaN", Double.NaN, 1, 80,
                                new JsonObject(), new JsonObject(), List.of()))));
    }

    @Test
    void excludesDimensionWhenEveryComponentIsUnavailable() {
        var calculation = PlayerReportBaseComponents.calculate(List.of(
                PlayerReportBaseComponents.missing(
                        "relative_gpm", "每分钟经济相对表现", 100, 40,
                        "gpm_missing", List.of())));

        assertFalse(calculation.available());
        assertNull(calculation.score());
    }

    @Test
    void serializesComponentsInOrderAndRecalculatesStoredWeights() {
        var source = PlayerReportBaseComponents.calculate(List.of(
                PlayerReportBaseComponents.available(
                        "first", "第一项", 80, 1, 90,
                        new JsonObject(), new JsonObject(), List.of("e1")),
                PlayerReportBaseComponents.suppressed(
                        "second", "第二项", 3, 70,
                        "role_gate", List.of("e2"))));

        JsonArray json = PlayerReportBaseComponents.toJson(source);
        json.get(0).getAsJsonObject().addProperty("effective_local_weight", 1.0);
        json.get(0).getAsJsonObject().addProperty("weighted_contribution", 1.0);

        var restored = PlayerReportBaseComponents.fromJson(json);

        assertEquals("first", json.get(0).getAsJsonObject().get("key").getAsString());
        assertEquals("second", json.get(1).getAsJsonObject().get("key").getAsString());
        assertEquals(100.0, restored.components().get(0).effectiveLocalWeight(), 0.01);
        assertEquals(80.0, restored.components().get(0).weightedContribution(), 0.01);
        assertNull(restored.components().get(1).weightedContribution());
    }

    @Test
    void reconcilesRoundedEffectiveWeightsAtAggregateBoundary() {
        var inputs = new ArrayList<PlayerReportBaseComponents.ComponentInput>();
        for (int index = 0; index < 206; index++) {
            inputs.add(PlayerReportBaseComponents.available(
                    "small_" + index, "Small " + index, 50, 0.480051, 80,
                    new JsonObject(), new JsonObject(), List.of()));
        }
        inputs.add(PlayerReportBaseComponents.available(
                "large", "Large", 50, 1.109494, 80,
                new JsonObject(), new JsonObject(), List.of()));

        var calculation = PlayerReportBaseComponents.calculate(inputs);
        double totalEffectiveWeight = calculation.components().stream()
                .filter(component -> component.input().available())
                .mapToDouble(PlayerReportBaseComponents.ComponentResult::effectiveLocalWeight)
                .sum();

        assertEquals(100.0, totalEffectiveWeight, 0.01);
    }

    @Test
    void reconcilesRoundedContributionsAtLargeComponentBoundary() {
        var inputs = new ArrayList<PlayerReportBaseComponents.ComponentInput>();
        for (int index = 0; index < 3000; index++) {
            inputs.add(PlayerReportBaseComponents.available(
                    "tiny_" + index, "Tiny " + index, 50, 0.033251, 80,
                    new JsonObject(), new JsonObject(), List.of()));
        }
        inputs.add(PlayerReportBaseComponents.available(
                "remainder", "Remainder", 50, 0.247, 80,
                new JsonObject(), new JsonObject(), List.of()));

        var calculation = PlayerReportBaseComponents.calculate(inputs);

        assertEquals(50.0, calculation.score(), 0.05);
    }

    @Test
    void normalizesFiniteWeightsWhenTheirSumOverflows() {
        var calculation = PlayerReportBaseComponents.calculate(List.of(
                PlayerReportBaseComponents.available(
                        "max_a", "Max A", 50, Double.MAX_VALUE, 80,
                        new JsonObject(), new JsonObject(), List.of()),
                PlayerReportBaseComponents.available(
                        "max_b", "Max B", 50, Double.MAX_VALUE, 80,
                        new JsonObject(), new JsonObject(), List.of())));

        assertEquals(50.0, calculation.score(), 0.05);
        assertEquals(50.0, calculation.components().get(0).effectiveLocalWeight(), 0.01);
        assertEquals(50.0, calculation.components().get(1).effectiveLocalWeight(), 0.01);
    }
}
