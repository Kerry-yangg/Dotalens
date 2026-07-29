package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.AccessDeniedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.google.gson.JsonObject;

import com.sun.net.httpserver.HttpServer;

class ReplayJobManagerTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void retriesTransientWindowsFileLocksWhenReplacingAnalysisArtifacts() throws Exception {
        Path source = temporaryDirectory.resolve("summary.json.part");
        Path target = temporaryDirectory.resolve("summary.json");
        Files.writeString(source, "new", StandardCharsets.UTF_8);
        Files.writeString(target, "old", StandardCharsets.UTF_8);
        AtomicInteger calls = new AtomicInteger();

        ReplayJobManager.moveReplacing(source, target, (from, to, options) -> {
            if (calls.getAndIncrement() < 2) {
                throw new AccessDeniedException(from.toString(), to.toString(), "fixture lock");
            }
            Files.move(from, to, options);
        }, 4, 0);

        assertEquals(3, calls.get());
        assertEquals("new", Files.readString(target, StandardCharsets.UTF_8));
        assertFalse(Files.exists(source));
    }

    @Test
    void doesNotRetryNonFilesystemMoveFailures() throws Exception {
        Path source = temporaryDirectory.resolve("summary.json.part");
        Path target = temporaryDirectory.resolve("summary.json");
        Files.writeString(source, "new", StandardCharsets.UTF_8);
        AtomicInteger calls = new AtomicInteger();

        IOException error = assertThrows(IOException.class,
                () -> ReplayJobManager.moveReplacing(source, target, (from, to, options) -> {
                    calls.incrementAndGet();
                    throw new IOException("fixture permanent failure");
                }, 6, 0));

        assertEquals("fixture permanent failure", error.getMessage());
        assertEquals(1, calls.get());
        assertTrue(Files.exists(source));
    }

    @Test
    void importsParticipantReplayIntoTheLocalCache() throws Exception {
        byte[] replay = "PBDEMS2-local-participant-replay".getBytes(StandardCharsets.US_ASCII);

        try (ReplayJobManager manager = new ReplayJobManager(temporaryDirectory,
                new OpenDotaClient("http://127.0.0.1:1", ""))) {
            Path imported = manager.importReplay(9973575401L, new ByteArrayInputStream(replay), false);

            assertEquals("9973575401.dem", imported.getFileName().toString());
            assertTrue(manager.hasReplayCache(9973575401L));
            assertEquals(replay.length, Files.size(imported));
        }
    }

    @Test
    void compressedImportInvalidatesAnOlderDecompressedReplay() throws Exception {
        Path replayDirectory = temporaryDirectory.resolve("replays");
        Files.createDirectories(replayDirectory);
        Files.writeString(replayDirectory.resolve("9973575402.dem"), "PBDEMS2-old",
                StandardCharsets.US_ASCII);
        byte[] compressed = "BZh-new-participant-replay".getBytes(StandardCharsets.US_ASCII);

        try (ReplayJobManager manager = new ReplayJobManager(temporaryDirectory,
                new OpenDotaClient("http://127.0.0.1:1", ""))) {
            Path imported = manager.importReplay(9973575402L,
                    new ByteArrayInputStream(compressed), true);

            assertEquals("9973575402.dem.bz2", imported.getFileName().toString());
            assertFalse(Files.exists(replayDirectory.resolve("9973575402.dem")));
        }
    }

    @Test
    void compressedImportAcceptsValveZstandardReplayPayloads() throws Exception {
        byte[] compressed = new byte[] {
                (byte) 0x28, (byte) 0xB5, (byte) 0x2F, (byte) 0xFD, 0, 1, 2, 3
        };

        try (ReplayJobManager manager = new ReplayJobManager(temporaryDirectory,
                new OpenDotaClient("http://127.0.0.1:1", ""))) {
            Path imported = manager.importReplay(9973575403L,
                    new ByteArrayInputStream(compressed), true);

            assertEquals("9973575403.dem.bz2", imported.getFileName().toString());
            assertTrue(manager.hasReplayCache(9973575403L));
        }
    }

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
    void incompleteSummaryDoesNotChangeAnExistingManualSubject() throws Exception {
        JsonObject originalMatch = new JsonObject();
        originalMatch.add("players", com.google.gson.JsonParser.parseString("""
                [
                  {"player_slot":0,"account_id":111,"hero_id":1},
                  {"player_slot":128,"account_id":222,"hero_id":2}
                ]
                """).getAsJsonArray());
        MatchSubjectStore store = new MatchSubjectStore(temporaryDirectory);
        store.select(600L, originalMatch, 128);

        JsonObject incomplete = new JsonObject();
        incomplete.addProperty("complete", false);
        incomplete.addProperty("account_id", 222);
        JsonObject changedMatch = new JsonObject();
        changedMatch.add("players", com.google.gson.JsonParser.parseString("""
                [
                  {"player_slot":0,"account_id":111,"hero_id":1},
                  {"player_slot":128,"account_id":333,"hero_id":3}
                ]
                """).getAsJsonArray());
        incomplete.add("match", changedMatch);

        try (ReplayJobManager manager = new ReplayJobManager(temporaryDirectory,
                new OpenDotaClient("http://127.0.0.1:1", ""))) {
            assertThrows(IOException.class,
                    () -> manager.applySubjectToCompletedSummary(600L, incomplete));
        }

        JsonObject persisted = new MatchSubjectStore(temporaryDirectory).read(600L);
        assertEquals("manual_selected", persisted.get("status").getAsString());
        assertEquals(128, persisted.get("selected_player_slot").getAsInt());
        assertEquals(222, persisted.get("selected_account_id").getAsLong());
    }

    @Test
    void concurrentForcedStartsReuseTheSameActiveMatchJob() throws Exception {
        CountDownLatch upstreamStarted = new CountDownLatch(1);
        CountDownLatch releaseUpstream = new CountDownLatch(1);
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/matches/999", exchange -> {
            upstreamStarted.countDown();
            try {
                releaseUpstream.await(10, TimeUnit.SECONDS);
                byte[] body = "{\"match_id\":999}".getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(200, body.length);
                try (OutputStream output = exchange.getResponseBody()) {
                    output.write(body);
                }
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            }
        });
        server.start();

        ExecutorService callers = Executors.newFixedThreadPool(12);
        CountDownLatch callersReady = new CountDownLatch(12);
        CountDownLatch startTogether = new CountDownLatch(1);
        try (ReplayJobManager manager = new ReplayJobManager(temporaryDirectory,
                new OpenDotaClient("http://127.0.0.1:" + server.getAddress().getPort(), ""))) {
            List<Future<JsonObject>> futures = new ArrayList<>();
            for (int index = 0; index < 12; index++) {
                futures.add(callers.submit(() -> {
                    callersReady.countDown();
                    startTogether.await(3, TimeUnit.SECONDS);
                    return manager.start(999L, 123456789L, true);
                }));
            }
            assertTrue(callersReady.await(3, TimeUnit.SECONDS));
            startTogether.countDown();
            Set<String> ids = new HashSet<>();
            for (Future<JsonObject> future : futures) {
                ids.add(future.get(3, TimeUnit.SECONDS).get("id").getAsString());
            }

            assertEquals(1, ids.size());
            assertTrue(upstreamStarted.await(3, TimeUnit.SECONDS));
        } finally {
            releaseUpstream.countDown();
            callers.shutdownNow();
            server.stop(0);
        }
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

    @Test
    void overlaysAnAccountMatchedSubjectWhenReadingLegacyAnalysis() throws Exception {
        Path analysisDirectory = temporaryDirectory.resolve("analyses").resolve("457");
        Files.createDirectories(analysisDirectory);
        Files.writeString(analysisDirectory.resolve("summary.json"), """
                {
                  "schema":"dota-lens/0.8",
                  "account_id":222,
                  "match":{
                    "match_id":457,
                    "players":[
                      {"player_slot":0,"account_id":111,"hero_id":1},
                      {"player_slot":128,"account_id":222,"hero_id":2}
                    ]
                  },
                  "modules":{"schema":"product-modules/2.4"}
                }
                """, StandardCharsets.UTF_8);

        try (ReplayJobManager manager = new ReplayJobManager(temporaryDirectory,
                new OpenDotaClient("http://127.0.0.1:1", ""))) {
            JsonObject analysis = manager.readAnalysis(457L);
            JsonObject match = analysis.getAsJsonObject("match");
            JsonObject subject = match.getAsJsonObject("subject");

            assertEquals("matched", subject.get("status").getAsString());
            assertEquals(128, subject.get("selected_player_slot").getAsInt());
            assertEquals(128, match.get("selected_player_slot").getAsInt());
        }
    }

    @Test
    void persistsManualSubjectSelectionWithoutRewritingTheAnalysis() throws Exception {
        Path analysisDirectory = temporaryDirectory.resolve("analyses").resolve("458");
        Files.createDirectories(analysisDirectory);
        Path summary = analysisDirectory.resolve("summary.json");
        Files.writeString(summary, """
                {
                  "schema":"dota-lens/0.8",
                  "account_id":999,
                  "match":{
                    "match_id":458,
                    "players":[
                      {"player_slot":0,"account_id":111,"hero_id":1},
                      {"player_slot":128,"account_id":222,"hero_id":2}
                    ]
                  },
                  "modules":{"schema":"product-modules/2.4"}
                }
                """, StandardCharsets.UTF_8);
        String originalSummary = Files.readString(summary, StandardCharsets.UTF_8);

        try (ReplayJobManager manager = new ReplayJobManager(temporaryDirectory,
                new OpenDotaClient("http://127.0.0.1:1", ""))) {
            JsonObject unresolved = manager.readAnalysis(458L);
            assertEquals("manual_required", unresolved.getAsJsonObject("match")
                    .getAsJsonObject("subject").get("status").getAsString());

            JsonObject selected = manager.selectSubject(458L, 128);
            assertEquals("manual_selected", selected.get("status").getAsString());
            assertEquals(originalSummary, Files.readString(summary, StandardCharsets.UTF_8));
        }

        try (ReplayJobManager restarted = new ReplayJobManager(temporaryDirectory,
                new OpenDotaClient("http://127.0.0.1:1", ""))) {
            JsonObject analysis = restarted.readAnalysis(458L);
            JsonObject match = analysis.getAsJsonObject("match");
            assertEquals(128, match.get("selected_player_slot").getAsInt());
            assertEquals("manual_selected",
                    match.getAsJsonObject("subject").get("status").getAsString());
        }
    }

    @Test
    void mapsReplayIdentityMismatchToStructuredErrorContext() {
        ReplayIdentityException error = new ReplayIdentityException(9001L, 9002L);

        assertEquals("replay_match_id_mismatch", ReplayJobManager.errorCode(error));
        JsonObject context = ReplayJobManager.errorContext(error);
        assertEquals(9001L, context.get("declared_match_id").getAsLong());
        assertEquals(9002L, context.get("internal_match_id").getAsLong());
    }

    @Test
    void distinguishesParserNetworkPermissionFromGenericParseFailure() {
        assertEquals("network_access_denied",
                ReplayJobManager.errorCode(new IOException("Permission denied: getsockopt")));
        assertEquals("network_unavailable",
                ReplayJobManager.errorCode(new ConnectException("Connection refused")));
        assertEquals("parse_failed",
                ReplayJobManager.errorCode(new IOException("Unrelated parser failure")));
    }

    @Test
    void removesOnlyDeclaredParserReplayCacheCopiesAfterIdentityMismatch() throws Exception {
        Path replayDirectory = temporaryDirectory.resolve("replays");
        Path userDirectory = temporaryDirectory.resolve("user-files");
        Files.createDirectories(replayDirectory);
        Files.createDirectories(userDirectory);
        Files.writeString(replayDirectory.resolve("9001.dem"), "PBDEMS2-wrong");
        Files.writeString(replayDirectory.resolve("9001.dem.bz2"), "BZh-wrong");
        Files.writeString(replayDirectory.resolve("9002.dem"), "PBDEMS2-other");
        Path original = userDirectory.resolve("original.dem");
        Files.writeString(original, "PBDEMS2-user-source");

        ReplayJobManager.cleanupReplayIdentityMismatch(temporaryDirectory, 9001L);

        assertFalse(Files.exists(replayDirectory.resolve("9001.dem")));
        assertFalse(Files.exists(replayDirectory.resolve("9001.dem.bz2")));
        assertTrue(Files.exists(replayDirectory.resolve("9002.dem")));
        assertTrue(Files.exists(original));
    }
}
