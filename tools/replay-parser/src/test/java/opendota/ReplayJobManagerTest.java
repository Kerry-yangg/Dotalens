package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.google.gson.JsonObject;

import com.sun.net.httpserver.HttpServer;

class ReplayJobManagerTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void detectsRecoverableReplayFilesButIgnoresPartialDownloads() throws Exception {
        Path replayDirectory = temporaryDirectory.resolve("replays");
        Files.createDirectories(replayDirectory);
        Files.write(replayDirectory.resolve("101.dem.bz2"), new byte[] { 1, 2, 3 });
        Files.write(replayDirectory.resolve("102.dem.part"), new byte[] { 1, 2, 3 });
        Files.write(replayDirectory.resolve("103.dem"), new byte[0]);

        try (ReplayJobManager manager = new ReplayJobManager(temporaryDirectory,
                new OpenDotaClient("http://127.0.0.1:1", ""))) {
            assertTrue(manager.hasReplayCache(101L));
            assertFalse(manager.hasReplayCache(102L));
            assertFalse(manager.hasReplayCache(103L));
            assertFalse(manager.hasReplayCache(104L));
        }
    }

    @Test
    void retainsOnlyTheCurrentAndMostRecentDecompressedReplayCaches() throws Exception {
        Path replayDirectory = temporaryDirectory.resolve("replays");
        Files.createDirectories(replayDirectory);
        for (long matchId : new long[] { 201L, 202L, 203L }) {
            Path dem = replayDirectory.resolve(matchId + ".dem");
            Files.write(dem, new byte[] { 1, 2, 3 });
            Files.write(replayDirectory.resolve(matchId + ".dem.bz2"), new byte[] { 4, 5, 6 });
            Files.setLastModifiedTime(dem, FileTime.fromMillis(matchId * 1000L));
        }

        ReplayJobManager.pruneDecompressedReplayCache(replayDirectory, 201L, 2);

        assertTrue(Files.isRegularFile(replayDirectory.resolve("201.dem")));
        assertFalse(Files.exists(replayDirectory.resolve("202.dem")));
        assertTrue(Files.isRegularFile(replayDirectory.resolve("203.dem")));
        assertTrue(Files.isRegularFile(replayDirectory.resolve("202.dem.bz2")));
    }

    @Test
    void cancelsAJobBlockedInAnUpstreamRequest() throws Exception {
        Path existingDirectory = temporaryDirectory.resolve("analyses").resolve("123");
        Files.createDirectories(existingDirectory);
        Path existingSummary = existingDirectory.resolve("summary.json");
        Path existingRaw = existingDirectory.resolve("123.raw.jsonl");
        Files.writeString(existingSummary, "old-summary", StandardCharsets.UTF_8);
        Files.writeString(existingRaw, "old-raw", StandardCharsets.UTF_8);
        CountDownLatch requestStarted = new CountDownLatch(1);
        CountDownLatch releaseResponse = new CountDownLatch(1);
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        ExecutorService serverExecutor = Executors.newCachedThreadPool();
        server.setExecutor(serverExecutor);
        server.createContext("/matches/123", exchange -> {
            requestStarted.countDown();
            exchange.sendResponseHeaders(200, 0);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write("{\"match_id\":123".getBytes(StandardCharsets.UTF_8));
                output.flush();
                try {
                    releaseResponse.await(10, TimeUnit.SECONDS);
                } catch (InterruptedException error) {
                    Thread.currentThread().interrupt();
                }
            }
        });
        server.start();

        String apiBase = "http://127.0.0.1:" + server.getAddress().getPort();
        try (ReplayJobManager manager = new ReplayJobManager(temporaryDirectory,
                new OpenDotaClient(apiBase, ""))) {
            JsonObject started = manager.start(123L, 123456789L, true);
            assertTrue(requestStarted.await(3, TimeUnit.SECONDS));

            JsonObject canceled = manager.cancel(started.get("id").getAsString());

            assertEquals("canceled", canceled.get("status").getAsString());
            assertEquals("canceled", canceled.get("stage").getAsString());
            assertFalse(canceled.get("cancelable").getAsBoolean());
            assertTrue(canceled.get("cancel_requested").getAsBoolean());
            assertEquals(0, manager.activeJobs());
            assertEquals("old-summary", Files.readString(existingSummary, StandardCharsets.UTF_8));
            assertEquals("old-raw", Files.readString(existingRaw, StandardCharsets.UTF_8));
        } finally {
            releaseResponse.countDown();
            server.stop(0);
            serverExecutor.shutdownNow();
        }
    }

    @Test
    void returnsAnOldAnalysisWithoutSynchronouslyRebuildingIt() throws Exception {
        Path analysisDirectory = temporaryDirectory.resolve("analyses").resolve("456");
        Files.createDirectories(analysisDirectory);
        Files.writeString(analysisDirectory.resolve("summary.json"), """
                {"schema":"dota-lens/0.8","generated_at":"2026-07-20T00:00:00Z","modules":{"schema":"product-modules/2.4"}}
                """, StandardCharsets.UTF_8);

        try (ReplayJobManager manager = new ReplayJobManager(temporaryDirectory,
                new OpenDotaClient("http://127.0.0.1:1", ""))) {
            JsonObject analysis = manager.readAnalysis(456L);

            assertEquals("stale", analysis.get("schema_status").getAsString());
            assertTrue(analysis.get("upgrade_required").getAsBoolean());
            assertEquals("dota-lens/0.8", analysis.get("schema").getAsString());
            assertFalse(Files.exists(analysisDirectory.resolve("summary.json.upgrade")));
        }
    }
}
