package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

class AnalysisStorageTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void writesColumnarSnapshotsAndLoadsSplitModules() throws Exception {
        Path analysisDirectory = temporaryDirectory.resolve("analyses").resolve("42");
        Files.createDirectories(analysisDirectory);
        JsonObject analysis = analysis();
        Path summaryPart = analysisDirectory.resolve("summary.json.part");

        JsonObject stored = AnalysisStorage.write(analysisDirectory, summaryPart, analysis);
        Files.move(summaryPart, analysisDirectory.resolve("summary.json"));

        JsonObject modules = stored.getAsJsonObject("modules");
        assertFalse(modules.has("snapshots"));
        assertFalse(modules.has("players"));
        assertFalse(modules.has("combat"));
        assertFalse(modules.has("farm"));
        assertEquals("exact", modules.getAsJsonObject("ability_metadata")
                .get("match").getAsString());
        assertEquals("split-gzip-modules",
                stored.getAsJsonObject("analysis_storage").get("layout").getAsString());
        assertEquals("player-report/4.0", stored.getAsJsonObject("analysis_storage")
                .getAsJsonObject("module_schemas").get("players").getAsString());
        assertTrue(AnalysisSummary.isCurrent(stored));

        JsonElement combat = AnalysisStorage.readModule(analysisDirectory, stored, "combat");
        assertNotNull(combat);
        assertEquals(1, combat.getAsJsonObject().getAsJsonArray("fights").size());
        JsonObject snapshots = AnalysisStorage.readModule(analysisDirectory, stored, "snapshots").getAsJsonObject();
        assertEquals(AnalysisStorage.SNAPSHOT_SCHEMA, snapshots.get("schema").getAsString());
        assertEquals(2, snapshots.getAsJsonObject("by_slot").getAsJsonArray("0").size());
        assertEquals(AnalysisStorage.SNAPSHOT_FIELDS.size(), snapshots.getAsJsonObject("by_slot")
                .getAsJsonArray("0").get(0)
                .getAsJsonArray().size());
        assertEquals(2, snapshots.getAsJsonArray("omitted_repeated_fields").size());
        assertNotNull(AnalysisStorage.moduleFile(analysisDirectory, stored, "snapshots"));
        JsonObject storedPlayers = AnalysisStorage.readModule(analysisDirectory, stored, "players")
                .getAsJsonObject();
        assertNotNull(storedPlayers);
        assertEquals("player-report/4.0", storedPlayers.get("schema").getAsString());
        JsonObject storedReport = storedPlayers.getAsJsonObject("by_slot")
                .getAsJsonObject("0").getAsJsonObject("report");
        assertEquals("player-report-score-audit/1.0", storedReport.getAsJsonObject("score_card")
                .getAsJsonObject("audit").get("model").getAsString());
        assertTrue(storedReport.getAsJsonObject("score_card").getAsJsonObject("audit")
                .get("recomputation_valid").getAsBoolean());
        String moduleBase = stored.getAsJsonObject("analysis_storage").get("module_base").getAsString();
        assertTrue(Files.size(analysisDirectory.resolve(moduleBase).resolve("combat.json.gz")) > 0);
    }

    @Test
    void stripsPreviouslyEmbeddedLazyModulesWhenReadingSplitSummary() throws Exception {
        Path analysisDirectory = temporaryDirectory.resolve("existing-split");
        Files.createDirectories(analysisDirectory);
        JsonObject analysis = analysis();
        Path summaryPart = analysisDirectory.resolve("summary.json.part");
        JsonObject stored = AnalysisStorage.write(analysisDirectory, summaryPart, analysis);
        JsonElement snapshots = AnalysisStorage.readModule(analysisDirectory, stored, "snapshots");
        stored.getAsJsonObject("modules").add("snapshots", snapshots);
        Files.writeString(analysisDirectory.resolve("summary.json"), stored.toString(), StandardCharsets.UTF_8);

        JsonObject loaded = AnalysisStorage.readSummary(analysisDirectory);

        assertFalse(loaded.getAsJsonObject("modules").has("snapshots"));
        assertNotNull(AnalysisStorage.readModule(analysisDirectory, loaded, "snapshots"));
        JsonObject persisted = com.google.gson.JsonParser.parseString(
                Files.readString(analysisDirectory.resolve("summary.json"), StandardCharsets.UTF_8))
                .getAsJsonObject();
        assertFalse(persisted.getAsJsonObject("modules").has("snapshots"));
    }

    @Test
    void readsEmbeddedModulesFromLegacySummaries() throws Exception {
        Path analysisDirectory = temporaryDirectory.resolve("legacy");
        Files.createDirectories(analysisDirectory);
        JsonObject summary = new JsonObject();
        JsonObject modules = new JsonObject();
        JsonObject combat = new JsonObject();
        combat.add("fights", new JsonArray());
        modules.add("combat", combat);
        summary.add("modules", modules);
        Files.writeString(analysisDirectory.resolve("summary.json"), summary.toString(), StandardCharsets.UTF_8);

        JsonObject loaded = AnalysisStorage.readSummary(analysisDirectory);
        JsonElement loadedCombat = AnalysisStorage.readModule(analysisDirectory, loaded, "combat");

        assertNotNull(loadedCombat);
        assertTrue(loadedCombat.getAsJsonObject().getAsJsonArray("fights").isEmpty());
    }

    private static JsonObject analysis() {
        JsonObject analysis = new JsonObject();
        analysis.addProperty("schema", "dota-lens/1.0");
        analysis.addProperty("generated_at", "2026-07-20T00:00:00Z");
        analysis.addProperty("valid_json_objects", 10);
        analysis.addProperty("raw_bytes", 1000);

        JsonObject modules = new JsonObject();
        modules.addProperty("schema", ProductAnalysis.CURRENT_SCHEMA);
        modules.add("time_contract", new JsonObject());
        JsonObject snapshots = new JsonObject();
        JsonArray rows = new JsonArray();
        rows.add(snapshot(0, 600, "radiant_base"));
        rows.add(snapshot(1, 645, "bottom_lane"));
        snapshots.add("0", rows);
        modules.add("snapshots", snapshots);
        modules.add("development", new JsonObject());
        modules.add("laning", new JsonObject());
        modules.add("objectives", new JsonObject());
        modules.add("map", new JsonObject());
        JsonObject players = new JsonObject();
        players.addProperty("schema", PlayerReportAnalysis.SCHEMA);
        JsonObject bySlot = new JsonObject();
        JsonObject player = new JsonObject();
        JsonObject report = new JsonObject();
        report.addProperty("model", PlayerReportAnalysis.SCHEMA);
        JsonObject scoreCard = new JsonObject();
        JsonObject audit = new JsonObject();
        audit.addProperty("model", PlayerReportScoringV4.AUDIT_MODEL);
        audit.addProperty("recomputation_valid", true);
        scoreCard.add("audit", audit);
        report.add("score_card", scoreCard);
        player.add("report", report);
        bySlot.add("0", player);
        players.add("by_slot", bySlot);
        modules.add("players", players);
        modules.add("module_evidence", new JsonObject());
        modules.add("coordinate_system", new JsonObject());
        JsonObject abilityMetadata = new JsonObject();
        abilityMetadata.addProperty("match", "exact");
        modules.add("ability_metadata", abilityMetadata);
        modules.add("farm", new JsonObject());
        JsonObject combat = new JsonObject();
        JsonArray fights = new JsonArray();
        JsonObject fight = new JsonObject();
        fight.addProperty("id", "fight-1");
        fights.add(fight);
        combat.add("fights", fights);
        modules.add("combat", combat);
        analysis.add("modules", modules);
        return analysis;
    }

    private static JsonObject snapshot(int second, int networth, String region) {
        JsonObject row = new JsonObject();
        row.addProperty("second", second);
        row.addProperty("gold", networth - 100);
        row.addProperty("networth", networth);
        row.addProperty("xp", second * 20);
        row.addProperty("lh", second);
        row.addProperty("x", 25 + second);
        row.addProperty("y", 75 - second);
        row.addProperty("region", region);
        row.addProperty("life_state", 0);
        row.addProperty("hp", 700);
        row.addProperty("max_hp", 700);
        row.addProperty("mana", 300);
        row.addProperty("max_mana", 300);
        row.addProperty("level", 1);
        row.add("hero_abilities", new JsonArray());
        row.add("hero_inventory", new JsonArray());
        return row;
    }
}
