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

import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

final class GoldenSampleStoreTest {
    @TempDir
    Path temporary;

    @Test
    void savesCanonicalCoordinatesAndListsLocalMatch() throws Exception {
        writeSummary(123L, new JsonArray());
        GoldenSampleStore store = new GoldenSampleStore(temporary);
        JsonObject payload = document("complete", event("teamfight", slots(0, 1, 2, 5, 6), 50, 50));

        JsonObject saved = store.save(123L, "primary", payload);

        JsonObject center = saved.getAsJsonArray("events").get(0).getAsJsonObject().getAsJsonObject("center");
        assertEquals(0.0, center.get("world_x").getAsDouble());
        assertEquals(0.0, center.get("world_y").getAsDouble());
        assertEquals("dota-map-coordinates/2.0", center.get("coordinate_version").getAsString());
        JsonObject listed = store.list("primary").getAsJsonArray("matches").get(0).getAsJsonObject();
        assertEquals(10, listed.get("players").getAsInt());
        assertEquals("complete", listed.getAsJsonObject("annotation").get("status").getAsString());
    }

    @Test
    void completeTwoVersusTwoCannotBeTeamfight() throws Exception {
        writeSummary(124L, new JsonArray());
        GoldenSampleStore store = new GoldenSampleStore(temporary);
        JsonObject payload = document("complete", event("teamfight", slots(0, 1, 5, 6), 40, 60));

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> store.save(124L, "primary", payload));

        assertTrue(error.getMessage().contains("2v2"));
    }

    @Test
    void completedCombatCannotTraceBackMoreThanTenSeconds() throws Exception {
        writeSummary(126L, new JsonArray());
        GoldenSampleStore store = new GoldenSampleStore(temporary);
        JsonObject combat = event("skirmish", slots(0, 1, 5), 40, 60);
        combat.addProperty("review_start_ms", -1_000);
        combat.addProperty("contact_start_ms", 10_000);

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> store.save(126L, "primary", document("complete", combat)));

        assertTrue(error.getMessage().contains("10 seconds"));
    }

    @Test
    void benchmarkUsesOnlyFrozenAdjudicatedDocuments() throws Exception {
        JsonArray predictions = new JsonArray();
        predictions.add(prediction("fight-1", "teamfight", 10, 20, slots(0, 1, 2, 5, 6), 50, 50));
        writeSummary(127L, predictions);
        writeSummary(128L, predictions);
        GoldenSampleStore store = new GoldenSampleStore(temporary);
        store.save(127L, "adjudicated", document("adjudicated",
                event("teamfight", slots(0, 1, 2, 5, 6), 50, 50)));
        store.save(128L, "adjudicated", document("draft",
                event("teamfight", slots(0, 1, 2, 5, 6), 50, 50)));

        JsonObject benchmark = store.benchmark("adjudicated");

        assertEquals("corpus", benchmark.get("scope").getAsString());
        assertEquals(1, benchmark.get("matches_evaluated").getAsInt());
        assertEquals(2, benchmark.getAsJsonObject("coverage").get("documents").getAsInt());
        assertEquals(1, benchmark.getAsJsonObject("coverage").get("incomplete_documents").getAsInt());
        assertEquals(1.0, benchmark.getAsJsonObject("metrics").getAsJsonObject("teamfight")
                .get("precision").getAsDouble());
        assertTrue(benchmark.getAsJsonObject("gates").getAsJsonObject("corpus_size")
                .get("evaluable").getAsBoolean());
    }

    @Test
    void frozenLabelClassifiesSimilarFightInAnotherMatchButExcludesItself() throws Exception {
        JsonArray trainingFights = new JsonArray();
        trainingFights.add(prediction("fight-train", "skirmish", 10, 20,
                slots(0, 1, 2, 5, 6), 50, 50));
        JsonArray targetFights = trainingFights.deepCopy();
        writeSummary(201L, trainingFights);
        writeSummary(202L, targetFights);
        GoldenSampleStore store = new GoldenSampleStore(temporary);
        store.save(201L, "primary", document("complete",
                event("teamfight", slots(0, 1, 2, 5, 6), 50, 50)));

        JsonObject learned = store.applyLearning(202L, summary(202L, targetFights.deepCopy()));
        JsonObject learnedFight = learned.getAsJsonObject("modules").getAsJsonObject("combat")
                .getAsJsonArray("fights").get(0).getAsJsonObject();
        JsonObject classification = learnedFight.getAsJsonObject("classification");

        assertEquals("teamfight", learnedFight.get("kind").getAsString());
        assertTrue(classification.get("learning_applied").getAsBoolean());
        assertEquals(201L, classification.getAsJsonArray("similar_samples").get(0)
                .getAsJsonObject().get("match_id").getAsLong());

        JsonObject own = store.applyLearning(201L, summary(201L, trainingFights.deepCopy()));
        JsonObject ownClassification = own.getAsJsonObject("modules").getAsJsonObject("combat")
                .getAsJsonArray("fights").get(0).getAsJsonObject().getAsJsonObject("classification");
        assertFalse(ownClassification.get("learning_applied").getAsBoolean());
    }

    @Test
    void frozenNonCombatLabelSuppressesSimilarCandidateInAnotherMatch() throws Exception {
        JsonArray trainingFights = new JsonArray();
        trainingFights.add(prediction("fight-noise", "teamfight", 10, 20,
                slots(0, 1, 2, 5, 6), 50, 50));
        writeSummary(301L, trainingFights);
        writeSummary(302L, trainingFights.deepCopy());
        GoldenSampleStore store = new GoldenSampleStore(temporary);
        store.save(301L, "primary", document("complete",
                event("non_combat", slots(0, 1, 2, 5, 6), 50, 50)));

        JsonObject learned = store.applyLearning(302L, summary(302L, trainingFights.deepCopy()));
        JsonObject combat = learned.getAsJsonObject("modules").getAsJsonObject("combat");

        assertEquals(0, combat.getAsJsonArray("fights").size());
        assertEquals(1, combat.getAsJsonArray("suppressed_fights").size());
        assertEquals(1, combat.getAsJsonObject("learning").get("suppressed_candidates").getAsInt());
    }

    @Test
    void evaluatorReportsPerfectMatchAndTwoVersusTwoViolation() {
        JsonArray predictions = new JsonArray();
        predictions.add(prediction("fight-1", "teamfight", 10, 20, slots(0, 1, 2, 5, 6), 50, 50));
        predictions.add(prediction("fight-2", "lane_trade", 30, 36, slots(0, 5), 60, 60));
        predictions.add(prediction("fight-3", "teamfight", 50, 58, slots(0, 1, 5, 6), 45, 45));
        JsonObject summary = summary(125L, predictions);
        JsonArray events = new JsonArray();
        events.add(event("teamfight", slots(0, 1, 2, 5, 6), 50, 50));
        JsonObject lane = event("trade", slots(0, 5), 60, 60);
        lane.addProperty("contact_start_ms", 30_000);
        lane.addProperty("contact_end_ms", 36_000);
        lane.addProperty("peak_ms", 33_000);
        JsonArray laneTags = new JsonArray();
        laneTags.add("lane");
        lane.add("tags", laneTags);
        events.add(lane);
        JsonObject twoVTwo = event("skirmish", slots(0, 1, 5, 6), 45, 45);
        twoVTwo.addProperty("contact_start_ms", 50_000);
        twoVTwo.addProperty("contact_end_ms", 58_000);
        twoVTwo.addProperty("peak_ms", 54_000);
        events.add(twoVTwo);
        JsonObject gold = document("adjudicated", events);
        gold.addProperty("match_id", 125L);
        gold.addProperty("annotator", "adjudicated");

        JsonObject evaluation = GoldenSampleEvaluator.evaluate(gold, summary);
        JsonObject metrics = evaluation.getAsJsonObject("metrics");

        assertEquals(0.5, metrics.getAsJsonObject("teamfight").get("precision").getAsDouble());
        assertEquals(1.0, metrics.getAsJsonObject("teamfight").get("recall").getAsDouble());
        assertEquals(1.0, metrics.getAsJsonObject("participants").get("macro_f1").getAsDouble());
        assertEquals(0.0, metrics.getAsJsonObject("location").get("median_error_world").getAsDouble());
        assertEquals(1, metrics.getAsJsonObject("two_versus_two").get("teamfight_upgrades").getAsInt());
        assertEquals(1, metrics.getAsJsonObject("classification_confusion")
                .getAsJsonObject("trade").get("trade").getAsInt());
    }

    private void writeSummary(long matchId, JsonArray predictions) throws Exception {
        Path directory = temporary.resolve("analyses").resolve(Long.toString(matchId));
        Files.createDirectories(directory);
        Files.writeString(directory.resolve("summary.json"),
                new GsonBuilder().setPrettyPrinting().create().toJson(summary(matchId, predictions)),
                StandardCharsets.UTF_8);
    }

    private static JsonObject summary(long matchId, JsonArray predictions) {
        JsonObject summary = new JsonObject();
        summary.addProperty("schema", "dota-lens/0.6");
        JsonObject match = new JsonObject();
        match.addProperty("match_id", matchId);
        match.addProperty("duration", 120);
        match.addProperty("patch_name", "7.41");
        JsonArray players = new JsonArray();
        for (int slot = 0; slot < 10; slot++) {
            JsonObject player = new JsonObject();
            player.addProperty("player_slot", slot);
            player.addProperty("hero_id", slot + 1);
            players.add(player);
        }
        match.add("players", players);
        summary.add("match", match);
        JsonObject combat = new JsonObject();
        combat.add("fights", predictions);
        JsonObject modules = new JsonObject();
        modules.add("combat", combat);
        summary.add("modules", modules);
        return summary;
    }

    private static JsonObject document(String status, JsonObject event) {
        JsonArray events = new JsonArray();
        events.add(event);
        return document(status, events);
    }

    private static JsonObject document(String status, JsonArray events) {
        JsonObject result = new JsonObject();
        result.addProperty("status", status);
        result.addProperty("blind_mode", true);
        result.add("events", events);
        return result;
    }

    private static JsonObject event(String label, JsonArray participants, double x, double y) {
        JsonObject result = new JsonObject();
        result.addProperty("id", "gold-" + label + "-" + x);
        result.addProperty("label", label);
        result.addProperty("review_start_ms", 0);
        result.addProperty("contact_start_ms", 10_000);
        result.addProperty("contact_end_ms", 20_000);
        result.addProperty("peak_ms", 15_000);
        result.add("participants", participants);
        result.add("nearby_slots", new JsonArray());
        result.add("tags", new JsonArray());
        result.addProperty("confidence", "high");
        JsonObject center = new JsonObject();
        center.addProperty("map_x", x);
        center.addProperty("map_y", y);
        result.add("center", center);
        result.addProperty("radius_world", 700);
        return result;
    }

    private static JsonObject prediction(String id, String kind, int start, int end,
            JsonArray participants, double x, double y) {
        JsonObject result = new JsonObject();
        result.addProperty("id", id);
        result.addProperty("kind", kind);
        result.addProperty("contact_start", start);
        result.addProperty("contact_end", end);
        result.add("participants", participants);
        result.addProperty("x", x);
        result.addProperty("y", y);
        return result;
    }

    private static JsonArray slots(int... values) {
        JsonArray result = new JsonArray();
        for (int value : values) result.add(value);
        return result;
    }
}
