package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

class AnalysisSummaryTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void buildsCompactProductSummaryFromRawJsonl() throws Exception {
        Path raw = temporaryDirectory.resolve("42.raw.jsonl");
        Files.writeString(raw, String.join("\n",
                "{\"type\":\"interval\",\"slot\":0,\"time\":0,\"demo_tick\":1,\"raw_game_time_ms\":0,\"game_time_ms\":0,\"event_seq\":1,\"networth\":600,\"gold\":100,\"xp\":0,\"lh\":0,\"x\":-1000,\"y\":2000,\"hero_inventory\":[{\"id\":\"item_boots\"}],\"abilities\":[{\"id\":\"ability\"}]}",
                "{\"type\":\"actions\",\"slot\":0,\"demo_tick\":2,\"raw_game_time_ms\":33,\"game_time_ms\":33,\"event_seq\":2,\"visible_radiant\":true}",
                "{\"type\":\"epilogue\",\"demo_tick\":3,\"raw_game_time_ms\":66,\"game_time_ms\":66,\"event_seq\":3}",
                ""), StandardCharsets.UTF_8);

        JsonObject match = new JsonObject();
        match.addProperty("match_id", 42);
        JsonObject player = new JsonObject();
        player.addProperty("account_id", 123456789);
        player.addProperty("player_slot", 0);
        player.addProperty("hero_id", 21);
        JsonArray players = new JsonArray();
        players.add(player);
        match.add("players", players);

        JsonObject summary = AnalysisSummary.build(raw, match, 123456789);

        assertFalse(summary.get("complete").getAsBoolean());
        assertEquals(3, summary.get("valid_json_objects").getAsLong());
        assertEquals(0, summary.get("invalid_lines").getAsLong());
        assertTrue(summary.getAsJsonObject("clock").get("strictly_contiguous").getAsBoolean());
        assertEquals(1, summary.getAsJsonObject("timeline").get("inventory_snapshots").getAsLong());
        assertEquals(0, summary.getAsJsonObject("match").get("selected_player_slot").getAsInt());
        assertEquals(6, summary.getAsJsonArray("coverage").size());
        assertEquals(1, summary.getAsJsonArray("coverage").get(5).getAsJsonObject().get("records").getAsLong());
        assertEquals("partial", summary.getAsJsonArray("coverage").get(0).getAsJsonObject().get("status").getAsString());
        assertEquals("invalid", summary.getAsJsonObject("integrity").get("status").getAsString());

        assertEquals("dota-lens/1.0", summary.get("schema").getAsString());
        JsonObject modules = summary.getAsJsonObject("modules");
        assertEquals("product-modules/2.10", modules.get("schema").getAsString());
        for (String module : new String[] { "snapshots", "development", "build", "farm", "laning", "vision",
                "combat", "map", "timeline", "players", "time_contract" }) {
            assertTrue(modules.has(module), "missing product module: " + module);
        }
        assertTrue(modules.has("coordinate_system"));
        assertTrue(modules.getAsJsonObject("coordinate_system").getAsJsonObject("diagnostics")
                .get("invalid_total").getAsLong() > 0);
        assertTrue(AnalysisSummary.isCurrent(summary));
        JsonObject oldSummary = summary.deepCopy();
        oldSummary.addProperty("schema", "dota-lens/0.3");
        assertFalse(AnalysisSummary.isCurrent(oldSummary));
        JsonObject oldPlayerReport = summary.deepCopy();
        oldPlayerReport.getAsJsonObject("modules").getAsJsonObject("players")
                .addProperty("schema", "player-report/1.1");
        assertFalse(AnalysisSummary.isCurrent(oldPlayerReport));
        assertEquals(1, modules.getAsJsonObject("snapshots").getAsJsonObject("by_slot")
                .getAsJsonArray("0").size());
        assertEquals(1, modules.getAsJsonObject("build").getAsJsonObject("by_slot")
                .getAsJsonObject("0").getAsJsonArray("inventory").size());
        JsonObject playerModule = modules.getAsJsonObject("players");
        assertEquals("player-report/4.0", playerModule.get("schema").getAsString());
        assertEquals(60.0, playerModule.getAsJsonObject("by_slot").getAsJsonObject("0")
                .get("actions_per_min").getAsDouble());
        JsonObject report = playerModule.getAsJsonObject("by_slot").getAsJsonObject("0")
                .getAsJsonObject("report");
        assertEquals("player-report/4.0", report.get("model").getAsString());
        assertTrue(report.get("overall_score").getAsInt() >= 0);
        assertTrue(report.get("overall_score").getAsInt() <= 100);
        assertTrue(report.has("base_score"));
        assertTrue(report.has("behavior_modifier"));
        assertEquals(report.get("final_score").getAsDouble(),
                report.get("overall_score").getAsDouble(), 0.05);
        assertEquals(10, report.getAsJsonArray("dimensions").size());
        assertTrue(report.getAsJsonArray("phase_scores").size() > 0);
        assertTrue(report.getAsJsonArray("dimensions").get(0).getAsJsonObject()
                .getAsJsonArray("evidence").size() > 0);
        assertEquals(10, report.getAsJsonObject("score_card").getAsJsonArray("dimensions").size());
        assertEquals(10, report.getAsJsonObject("score_card").get("dimension_target").getAsInt());
        assertTrue(report.getAsJsonObject("score_card").getAsJsonObject("audit")
                .get("recomputation_valid").getAsBoolean());
        assertFalse(report.getAsJsonObject("score_card").getAsJsonObject("root_cause_summary")
                .get("attribution_only").getAsBoolean());
        assertEquals(5, report.getAsJsonObject("brief").getAsJsonArray("domain_scores").size());
        assertEquals(3, report.getAsJsonArray("story_nodes").size());
        assertTrue(report.getAsJsonArray("training_plan").size() > 0);
        assertTrue(report.getAsJsonObject("evidence_index").size() > 0);
        assertEquals(20, playerModule.getAsJsonObject("role_profiles").getAsJsonObject("1")
                .getAsJsonArray("dimensions").get(1).getAsJsonObject().get("weight").getAsInt());
        assertEquals(23, playerModule.getAsJsonObject("role_profiles").getAsJsonObject("5")
                .getAsJsonArray("dimensions").get(8).getAsJsonObject().get("weight").getAsInt());
        for (int position = 1; position <= 5; position++) {
            JsonArray profile = playerModule.getAsJsonObject("role_profiles")
                    .getAsJsonObject(Integer.toString(position)).getAsJsonArray("dimensions");
            assertEquals(10, profile.size());
            int totalWeight = 0;
            for (var element : profile) {
                totalWeight += element.getAsJsonObject().get("weight").getAsInt();
            }
            assertEquals(100, totalWeight);
        }
        for (var element : report.getAsJsonArray("dimensions")) {
            JsonObject dimension = element.getAsJsonObject();
            if (!dimension.get("available").getAsBoolean()) {
                assertFalse(dimension.has("score"));
                assertFalse(dimension.has("score_impact"));
            }
        }
    }

    @Test
    void resolvesReplayPatchBeforeConstructingPatchScopedAnalysis() throws Exception {
        Path raw = temporaryDirectory.resolve("9001.raw.jsonl");
        String epilogue = """
                {"gameInfo_":{"dota_":{"matchId_":9001,"endTime_":1782864000}}}
                """.replace("\n", "");
        Files.writeString(raw, String.join("\n",
                "{\"type\":\"interval\",\"slot\":0,\"time\":0,\"event_seq\":1}",
                "{\"type\":\"epilogue\",\"event_seq\":2,\"key\":"
                        + new com.google.gson.Gson().toJson(epilogue) + "}",
                ""), StandardCharsets.UTF_8);
        JsonObject match = new JsonObject();
        match.addProperty("match_id", 9001L);

        JsonObject summary = AnalysisSummary.build(raw, match, 0L);

        JsonObject resolvedMatch = summary.getAsJsonObject("match");
        assertEquals("7.41d", resolvedMatch.get("patch_name").getAsString());
        assertEquals("inferred", resolvedMatch.getAsJsonObject("patch_resolution")
                .get("status").getAsString());
        assertEquals("exact", summary.getAsJsonObject("modules")
                .getAsJsonObject("ability_metadata").get("match").getAsString());
    }

    @Test
    void rejectsAReplayWhoseInternalMatchIdDisagreesWithTheDeclaredId() throws Exception {
        Path raw = temporaryDirectory.resolve("9001-mismatch.raw.jsonl");
        String epilogue = """
                {"gameInfo_":{"dota_":{"matchId_":9002,"endTime_":1782864000}}}
                """.replace("\n", "");
        Files.writeString(raw,
                "{\"type\":\"epilogue\",\"key\":"
                        + new com.google.gson.Gson().toJson(epilogue) + "}\n",
                StandardCharsets.UTF_8);
        JsonObject match = new JsonObject();
        match.addProperty("match_id", 9001L);

        ReplayIdentityException error = assertThrows(ReplayIdentityException.class,
                () -> AnalysisSummary.build(raw, match, 0L));

        assertEquals(9001L, error.declaredMatchId());
        assertEquals(9002L, error.internalMatchId());
    }
}
