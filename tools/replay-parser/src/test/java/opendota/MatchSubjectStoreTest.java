package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

class MatchSubjectStoreTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void matchesRequestedAccountAndPersistsExternalPlayerSlot() throws Exception {
        MatchSubjectStore store = new MatchSubjectStore(temporaryDirectory);

        JsonObject subject = store.reconcile(42L, match(
                player(0, 111L, 1),
                player(128, 222L, 2)), 222L);

        assertEquals("match-subject/1.0", subject.get("schema").getAsString());
        assertEquals("matched", subject.get("status").getAsString());
        assertEquals("account_id", subject.get("source").getAsString());
        assertEquals(128, subject.get("selected_player_slot").getAsInt());
        assertEquals(222L, subject.get("selected_account_id").getAsLong());

        Path sidecar = temporaryDirectory.resolve("analyses").resolve("42").resolve("subject.json");
        assertTrue(Files.isRegularFile(sidecar));
        JsonObject persisted = JsonParser.parseString(
                Files.readString(sidecar, StandardCharsets.UTF_8)).getAsJsonObject();
        assertEquals(128, persisted.get("selected_player_slot").getAsInt());
    }

    @Test
    void requiresManualSelectionWhenRequestedAccountIsNotInReplay() throws Exception {
        MatchSubjectStore store = new MatchSubjectStore(temporaryDirectory);

        JsonObject subject = store.reconcile(43L, match(
                player(0, 111L, 1),
                player(128, 222L, 2)), 999L);

        assertEquals("manual_required", subject.get("status").getAsString());
        assertEquals("none", subject.get("source").getAsString());
        assertEquals("requested_account_not_in_replay", subject.get("reason").getAsString());
        assertFalse(subject.has("selected_player_slot"));
        assertEquals(999L, subject.get("requested_account_id").getAsLong());
    }

    @Test
    void preservesManualSelectionAcrossAccountChangesAndStoreRestarts() throws Exception {
        JsonObject replayMatch = match(
                player(0, 111L, 1),
                player(128, 222L, 2));
        MatchSubjectStore initial = new MatchSubjectStore(temporaryDirectory);
        initial.reconcile(44L, replayMatch, 999L);
        JsonObject selected = initial.select(44L, replayMatch, 128);
        assertEquals("manual_selected", selected.get("status").getAsString());

        MatchSubjectStore restarted = new MatchSubjectStore(temporaryDirectory);
        JsonObject reconciled = restarted.reconcile(44L, replayMatch, 111L);

        assertEquals("manual_selected", reconciled.get("status").getAsString());
        assertEquals("manual", reconciled.get("source").getAsString());
        assertEquals(128, reconciled.get("selected_player_slot").getAsInt());
        assertEquals(222L, reconciled.get("selected_account_id").getAsLong());
    }

    @Test
    void invalidatesManualSelectionWhenTheSlotNoLongerRepresentsTheSamePlayer() throws Exception {
        MatchSubjectStore store = new MatchSubjectStore(temporaryDirectory);
        JsonObject original = match(
                player(0, 111L, 1),
                player(128, 222L, 2));
        store.select(45L, original, 128);

        JsonObject changed = match(
                player(0, 111L, 1),
                player(128, 333L, 3));
        JsonObject subject = store.reconcile(45L, changed, 999L);

        assertEquals("invalidated", subject.get("status").getAsString());
        assertEquals("manual", subject.get("source").getAsString());
        assertEquals("selected_player_changed", subject.get("reason").getAsString());
        assertFalse(subject.has("selected_player_slot"));
    }

    @Test
    void rejectsAPlayerSlotThatDoesNotExistInTheReplay() {
        MatchSubjectStore store = new MatchSubjectStore(temporaryDirectory);

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> store.select(46L, match(player(0, 111L, 1)), 128));

        assertTrue(error.getMessage().contains("128"));
    }

    @Test
    void retriesWhenWindowsTemporarilyLocksTheExistingSidecar() throws Exception {
        MatchSubjectStore store = new MatchSubjectStore(temporaryDirectory);
        JsonObject replayMatch = match(player(0, 111L, 1));
        store.reconcile(47L, replayMatch, 111L);
        Path sidecar = temporaryDirectory.resolve("analyses").resolve("47").resolve("subject.json");

        FileChannel lockedSidecar = FileChannel.open(sidecar, StandardOpenOption.READ);
        Thread releaser = Thread.ofPlatform().start(() -> {
            try {
                Thread.sleep(150);
                lockedSidecar.close();
            } catch (Exception ignored) {
                // The test's finally block also closes the channel.
            }
        });
        try {
            JsonObject subject = store.reconcile(47L, replayMatch, 111L);
            assertEquals("matched", subject.get("status").getAsString());
        } finally {
            lockedSidecar.close();
            releaser.join();
        }

        assertFalse(Files.exists(sidecar.resolveSibling("subject.json.part")));
    }

    private static JsonObject match(JsonObject... players) {
        JsonArray values = new JsonArray();
        for (JsonObject player : players) values.add(player);
        JsonObject match = new JsonObject();
        match.add("players", values);
        return match;
    }

    private static JsonObject player(int playerSlot, long accountId, int heroId) {
        JsonObject player = new JsonObject();
        player.addProperty("player_slot", playerSlot);
        player.addProperty("account_id", accountId);
        player.addProperty("hero_id", heroId);
        return player;
    }
}
