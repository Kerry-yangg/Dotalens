package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

class ReplayTimeNormalizerTest {
    @Test
    void correctsDelayedCombatEventsWithTheExactDemoTickAnchor() {
        ReplayTimeNormalizer normalizer = new ReplayTimeNormalizer();
        normalizer.observe(json("""
                {"type":"CHAT_MESSAGE_ROSHAN_KILL","demo_tick":60250,"game_time_ms":1743167}
                """));
        JsonObject combat = json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":1768,"demo_tick":60250,"game_time_ms":1767867}
                """);

        normalizer.normalize(combat);

        assertEquals(1743167L, combat.get("game_time_ms").getAsLong());
        assertEquals(1743, combat.get("time").getAsInt());
        assertEquals(24700L, normalizer.diagnostics().get("max_correction_ms").getAsLong());
    }

    @Test
    void interpolatesBetweenNearbyPauseAdjustedIntervalAnchors() {
        ReplayTimeNormalizer normalizer = new ReplayTimeNormalizer();
        normalizer.observe(json("""
                {"type":"interval","demo_tick":100,"game_time_ms":100000}
                """));
        normalizer.observe(json("""
                {"type":"interval","demo_tick":130,"game_time_ms":101000}
                """));
        JsonObject combat = json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":120,"demo_tick":115,"game_time_ms":120000}
                """);

        normalizer.normalize(combat);

        assertEquals(100500L, combat.get("game_time_ms").getAsLong());
    }

    private static JsonObject json(String value) {
        return JsonParser.parseString(value).getAsJsonObject();
    }
}
