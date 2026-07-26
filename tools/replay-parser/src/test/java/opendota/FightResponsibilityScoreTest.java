package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

class FightResponsibilityScoreTest {
    @Test
    void positionOneExposesEveryPointSourceAndMatchesRoundedTotal() {
        FightResponsibilityScore.Result result = FightResponsibilityScore.calculate(
                new FightResponsibilityScore.Input(
                        1, 0.278, 0.488, 0.414, 10, 6, 2.6, 300,
                        0, 0, 85, 34, 2));

        assertEquals(67, result.score());
        JsonObject components = result.toJson(false);
        assertEquals(24.0, points(components, "base"), 0.001);
        assertEquals(27.8, points(components, "damage_share"), 0.001);
        assertEquals(6.832, points(components, "kill_conversion"), 0.001);
        assertEquals(10.0, points(components, "ability_casts"), 0.001);
        assertEquals(11.9, points(components, "presence"), 0.001);
        assertEquals(-14.0, points(components, "death_penalty"), 0.001);
    }

    @Test
    void positionTwoScoresTempoControlAndArrival() {
        FightResponsibilityScore.Result result = FightResponsibilityScore.calculate(
                new FightResponsibilityScore.Input(
                        2, 0.20, 0.0, 0.10, 3, 0, 2.0, 0,
                        0, 0, 80, 2, 1));

        assertEquals(67, result.score());
        JsonObject components = result.toJson(false);
        assertEquals(20.0, points(components, "damage_share"), 0.001);
        assertEquals(9.0, points(components, "ability_casts"), 0.001);
        assertEquals(4.0, points(components, "control"), 0.001);
        assertEquals(6.0, points(components, "arrival"), 0.001);
        assertEquals(-6.0, points(components, "death_penalty"), 0.001);
    }

    @Test
    void positionThreeCapsFrontlineAndControlComponents() {
        FightResponsibilityScore.Result result = FightResponsibilityScore.calculate(
                new FightResponsibilityScore.Input(
                        3, 0.50, 0.0, 0.60, 20, 2, 20.0, 0,
                        0, 0, 100, 0, 0));

        assertEquals(100, result.score());
        JsonObject components = result.toJson(false);
        assertEquals(24.0, points(components, "damage_share"), 0.001);
        assertEquals(18.0, points(components, "damage_taken_share"), 0.001);
        assertEquals(18.0, points(components, "control"), 0.001);
        assertEquals(8.0, points(components, "ability_casts"), 0.001);
    }

    @Test
    void positionFourScoresControlHealingItemsAndVisionSetup() {
        FightResponsibilityScore.Result result = FightResponsibilityScore.calculate(
                new FightResponsibilityScore.Input(
                        4, 0.05, 0.0, 0.10, 3, 3, 2.0, 440,
                        1, 1, 70, 0, 1));

        assertEquals(64, result.score());
        JsonObject components = result.toJson(false);
        assertEquals(12.0, points(components, "ability_casts"), 0.001);
        assertEquals(6.0, points(components, "control"), 0.001);
        assertEquals(2.0, points(components, "healing"), 0.001);
        assertEquals(10.0, points(components, "vision_setup"), 0.001);
        assertEquals(6.0, points(components, "item_uses"), 0.001);
    }

    @Test
    void positionFiveUsesTheStricterSupportCaps() {
        FightResponsibilityScore.Result result = FightResponsibilityScore.calculate(
                new FightResponsibilityScore.Input(
                        5, 0.05, 0.0, 0.10, 3, 3, 2.0, 360,
                        1, 1, 70, 0, 1));

        assertEquals(66, result.score());
        JsonObject components = result.toJson(false);
        assertEquals(12.0, points(components, "ability_casts"), 0.001);
        assertEquals(6.0, points(components, "control"), 0.001);
        assertEquals(2.0, points(components, "healing"), 0.001);
        assertEquals(12.0, points(components, "vision_setup"), 0.001);
        assertEquals(6.0, points(components, "item_uses"), 0.001);
    }

    @Test
    void suppressedResultMarksComponentsWithoutChangingHistoricalScore() {
        FightResponsibilityScore.Result result = FightResponsibilityScore.calculate(
                new FightResponsibilityScore.Input(
                        5, 0.0, 0.0, 0.0, 0, 0, 0.0, 0,
                        0, 0, 70, 4, 1));

        assertEquals(28, result.score());
        JsonObject components = result.toJson(true);
        assertTrue(components.getAsJsonObject("ability_casts")
                .get("judgment_suppressed").getAsBoolean());
        assertTrue(components.getAsJsonObject("control")
                .get("judgment_suppressed").getAsBoolean());
    }

    private static double points(JsonObject components, String key) {
        return components.getAsJsonObject(key).get("points").getAsDouble();
    }
}
