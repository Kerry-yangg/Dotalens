package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

class LocalReplayOfflineE2eTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void parsesARealParticipantReplayWithoutOpenDotaMetadata() throws Exception {
        String fixtureValue = System.getProperty("dotaLens.replayFixture", "");
        Path fixture = fixtureValue.isBlank() ? null : Path.of(fixtureValue);
        Assumptions.assumeTrue(fixture != null && Files.isRegularFile(fixture),
                "Set -DdotaLens.replayFixture to run the real Replay check");
        String accountValue = System.getProperty("dotaLens.replayAccountId", "");
        Assumptions.assumeTrue(!accountValue.isBlank(),
                "Set -DdotaLens.replayAccountId to an account contained in the Replay");
        long requestedAccountId = Long.parseLong(accountValue);
        String fileName = fixture.getFileName().toString();
        long matchId = Long.parseLong(fileName.substring(0, fileName.indexOf('.')));
        Path replayDirectory = temporaryDirectory.resolve("replays");
        Files.createDirectories(replayDirectory);
        Files.copy(fixture, replayDirectory.resolve(matchId + ".dem"));

        try (ReplayJobManager manager = new ReplayJobManager(temporaryDirectory,
                new OpenDotaClient("http://127.0.0.1:1", ""))) {
            JsonObject started = manager.start(matchId, requestedAccountId, true);
            String jobId = started.get("id").getAsString();
            JsonObject job = started;
            Instant deadline = Instant.now().plus(Duration.ofMinutes(8));
            while (Instant.now().isBefore(deadline)) {
                job = manager.get(jobId);
                String status = job.get("status").getAsString();
                if (status.equals("completed") || status.equals("failed") || status.equals("canceled")) break;
                Thread.sleep(500);
            }

            assertEquals("completed", job.get("status").getAsString(), job.toString());
            JsonObject analysis = manager.readAnalysis(matchId);
            assertNotNull(analysis);
            JsonObject match = analysis.getAsJsonObject("match");
            assertEquals(matchId, match.get("match_id").getAsLong());
            assertEquals("local_replay", match.get("metadata_source").getAsString());
            assertTrue(match.get("duration").getAsInt() > 600);
            JsonArray players = match.getAsJsonArray("players");
            assertEquals(10, players.size());
            boolean selectedPlayerFound = false;
            for (var element : players) {
                JsonObject player = element.getAsJsonObject();
                selectedPlayerFound |= player.has("account_id")
                        && player.get("account_id").getAsLong() == requestedAccountId
                        && player.has("hero_id")
                        && player.has("denies");
            }
            assertTrue(selectedPlayerFound);
            assertTrue(match.has("selected_player_slot"));
            JsonObject subject = match.getAsJsonObject("subject");
            assertNotNull(subject);
            assertEquals("matched", subject.get("status").getAsString());
            assertEquals(requestedAccountId, subject.get("requested_account_id").getAsLong());
            assertEquals(requestedAccountId, subject.get("selected_account_id").getAsLong());
            assertEquals(subject.get("selected_player_slot").getAsInt(),
                    match.get("selected_player_slot").getAsInt());
        }
    }
}
