package opendota;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.EOFException;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.URI;
import java.net.SocketException;
import java.net.http.HttpTimeoutException;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

final class ReplayJobManager implements AutoCloseable {
    private static final Gson PRETTY_GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final int DEFAULT_REPLAY_WAIT_SECONDS = 180;
    private static final int DEFAULT_REPLAY_DOWNLOAD_WAIT_SECONDS = 600;
    private static final int DEFAULT_DECOMPRESSED_CACHE_COUNT = 2;

    private final Path dataDirectory;
    private final OpenDotaClient openDota;
    private final ExecutorService executor;
    private final ConcurrentHashMap<String, JobState> jobs = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Long, String> matchJobs = new ConcurrentHashMap<>();

    ReplayJobManager(Path dataDirectory, OpenDotaClient openDota) throws IOException {
        this.dataDirectory = dataDirectory.toAbsolutePath().normalize();
        this.openDota = openDota;
        this.executor = Executors.newSingleThreadExecutor(runnable -> {
            Thread thread = new Thread(runnable, "dota-lens-replay-worker");
            thread.setDaemon(true);
            thread.setPriority(Math.min(Thread.MAX_PRIORITY, Thread.NORM_PRIORITY + 1));
            return thread;
        });
        Files.createDirectories(this.dataDirectory.resolve("replays"));
        Files.createDirectories(this.dataDirectory.resolve("analyses"));
    }

    JsonObject start(long matchId, long accountId, boolean force) {
        if (!force) {
            String existingId = matchJobs.get(matchId);
            if (existingId != null) {
                JobState existing = jobs.get(existingId);
                if (existing != null && existing.shouldReuse()) {
                    return existing.snapshot();
                }
            }
            if (Files.isRegularFile(summaryPath(matchId))) {
                JobState completed = JobState.completed(matchId, accountId);
                jobs.put(completed.id, completed);
                matchJobs.put(matchId, completed.id);
                return completed.snapshot();
            }
        }

        JobState job = new JobState(matchId, accountId);
        jobs.put(job.id, job);
        matchJobs.put(matchId, job.id);
        Future<?> task = executor.submit(() -> {
            try {
                run(job, force);
            } finally {
                reclaimTransientHeap(job.matchId);
            }
        });
        job.attachTask(task);
        return job.snapshot();
    }

    JsonObject get(String jobId) {
        JobState job = jobs.get(jobId);
        return job == null ? null : job.snapshot();
    }

    JsonObject cancel(String jobId) {
        JobState job = jobs.get(jobId);
        if (job == null) return null;
        if (job.cancel("Canceled by user")) cleanupPartialFiles(job.matchId);
        return job.snapshot();
    }

    JsonObject currentForMatch(long matchId) {
        String jobId = matchJobs.get(matchId);
        return jobId == null ? null : get(jobId);
    }

    synchronized JsonObject readAnalysis(long matchId) throws IOException {
        JsonObject analysis = AnalysisStorage.readSummary(analysisDirectory(matchId));
        if (analysis == null) return null;
        if (AnalysisSummary.isCurrent(analysis)) {
            analysis.addProperty("schema_status", "current");
            analysis.addProperty("upgrade_required", false);
            return analysis;
        }

        analysis.addProperty("schema_status", "stale");
        analysis.addProperty("upgrade_required", true);
        analysis.addProperty("upgrade_warning",
                "This analysis uses an older index schema. It was opened without blocking; reparse to upgrade.");
        return analysis;
    }

    synchronized JsonElement readAnalysisModule(long matchId, String moduleName) throws IOException {
        JsonObject analysis = AnalysisStorage.readSummary(analysisDirectory(matchId));
        return analysis == null ? null
                : AnalysisStorage.readModule(analysisDirectory(matchId), analysis, moduleName);
    }

    boolean hasAnalysis(long matchId) {
        return Files.isRegularFile(summaryPath(matchId));
    }

    boolean hasReplayCache(long matchId) {
        Path replayDirectory = dataDirectory.resolve("replays");
        return nonEmptyFile(replayDirectory.resolve(matchId + ".dem"))
                || nonEmptyFile(replayDirectory.resolve(matchId + ".dem.bz2"));
    }

    int activeJobs() {
        return (int) jobs.values().stream().filter(JobState::isActive).count();
    }

    Path dataDirectory() {
        return dataDirectory;
    }

    @Override
    public void close() {
        jobs.values().forEach(job -> job.cancel("Parser service is shutting down"));
        executor.shutdownNow();
    }

    private void run(JobState job, boolean force) {
        Path analysisDirectory = analysisDirectory(job.matchId);
        Path rawFile = analysisDirectory.resolve(job.matchId + ".raw.jsonl");
        Path rawPart = analysisDirectory.resolve(job.matchId + ".raw.jsonl.part");
        Path rawArchive = analysisDirectory.resolve(job.matchId + ".raw.jsonl.gz");
        Path rawArchivePart = analysisDirectory.resolve(job.matchId + ".raw.jsonl.gz.part");
        Path summaryPart = analysisDirectory.resolve("summary.json.part");
        long phaseStarted = System.nanoTime();
        try {
            job.throwIfCanceled();
            Files.createDirectories(analysisDirectory);
            job.update("resolving", 8, "Resolving match and Replay metadata");
            JsonObject matchDetail = resolveMatch(job);
            job.throwIfCanceled();
            addPatchName(matchDetail);
            Files.writeString(analysisDirectory.resolve("match.json"), PRETTY_GSON.toJson(matchDetail),
                    StandardCharsets.UTF_8);
            job.recordPhase("resolving", phaseStarted);

            URI replayUrl = OpenDotaClient.replayUrl(matchDetail);
            if (replayUrl == null) {
                throw new IOException("Replay URL is unavailable after OpenDota parse request");
            }
            phaseStarted = System.nanoTime();
            Path downloadedReplay = acquireReplay(job, replayUrl);
            job.throwIfCanceled();
            job.recordPhase("acquiring_replay", phaseStarted);
            phaseStarted = System.nanoTime();
            Path replayFile = prepareReplay(job, downloadedReplay, replayUrl);
            job.recordPhase("decompressing", phaseStarted);

            job.update("parsing", 56, "Parsing Replay events");
            Files.deleteIfExists(rawPart);
            Files.deleteIfExists(rawArchivePart);
            Files.deleteIfExists(summaryPart);
            phaseStarted = System.nanoTime();
            parseReplay(job, replayFile, rawPart);
            job.throwIfCanceled();
            job.recordPhase("parsing", phaseStarted);

            job.update("summarizing", 92, "Building analysis summary and coverage report");
            phaseStarted = System.nanoTime();
            JsonObject summary = AnalysisSummary.build(rawPart, matchDetail, job.accountId);
            job.throwIfCanceled();
            job.recordPhase("summarizing", phaseStarted);
            if (!summary.get("complete").getAsBoolean()) {
                throw new IOException("Parsed JSONL did not pass completeness checks");
            }
            job.update("archiving", 95, "Compressing raw Replay event archive");
            phaseStarted = System.nanoTime();
            gzipRawArchive(job, rawPart, rawArchivePart);
            job.throwIfCanceled();
            job.recordPhase("archiving", phaseStarted);
            summary.addProperty("raw_file", rawArchive.getFileName().toString());
            summary.addProperty("raw_encoding", "gzip");
            summary.addProperty("raw_archive_bytes", Files.size(rawArchivePart));
            summary.addProperty("replay_file", downloadedReplay.getFileName().toString());
            summary.addProperty("replay_bytes", Files.size(downloadedReplay));

            job.update("indexing", 97, "Writing compact analysis modules");
            phaseStarted = System.nanoTime();
            JsonObject storedSummary = AnalysisStorage.write(analysisDirectory, summaryPart, summary);
            job.throwIfCanceled();
            moveReplacing(rawArchivePart, rawArchive);
            moveReplacing(summaryPart, summaryPath(job.matchId));
            Files.deleteIfExists(rawPart);
            Files.deleteIfExists(rawFile);
            AnalysisStorage.cleanupInactiveGenerations(analysisDirectory, storedSummary);
            compactReplayCache(job.matchId);
            job.recordPhase("indexing", phaseStarted);
            job.complete(storedSummary);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            if (job.cancelRequested()) job.markCanceled("Canceled by user");
            else job.fail("interrupted", "Replay task was interrupted", error);
        } catch (Exception error) {
            if (job.cancelRequested()) job.markCanceled("Canceled by user");
            else {
                logFailure(job, error);
                job.fail(errorCode(error), safeMessage(error), error);
            }
        } finally {
            job.clearCancellationResource(null);
            try {
                Files.deleteIfExists(rawPart);
                Files.deleteIfExists(rawArchivePart);
                Files.deleteIfExists(summaryPart);
            } catch (IOException ignored) {
                // A stale partial file is harmless and will be replaced on the next run.
            }
        }
    }

    private static void logFailure(JobState job, Exception error) {
        System.err.printf("Replay parse failed: match=%d stage=%s error=%s message=%s%n",
                job.matchId, job.stage, error.getClass().getName(), safeMessage(error));
        error.printStackTrace(System.err);
    }

    private static void reclaimTransientHeap(long matchId) {
        Runtime runtime = Runtime.getRuntime();
        long before = runtime.totalMemory() - runtime.freeMemory();
        long started = System.nanoTime();
        System.gc();
        long after = runtime.totalMemory() - runtime.freeMemory();
        long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
        System.err.printf("Replay heap cleanup: match=%d elapsed_ms=%d before_mb=%d after_mb=%d%n",
                matchId, elapsed, before / (1024 * 1024), after / (1024 * 1024));
    }

    private void cleanupPartialFiles(long matchId) {
        Path replayDirectory = dataDirectory.resolve("replays");
        Path analysisDirectory = analysisDirectory(matchId);
        for (Path path : new Path[] {
                replayDirectory.resolve(matchId + ".dem.part"),
                replayDirectory.resolve(matchId + ".dem.bz2.part"),
                analysisDirectory.resolve(matchId + ".raw.jsonl.part"),
                analysisDirectory.resolve(matchId + ".raw.jsonl.gz.part"),
                analysisDirectory.resolve("summary.json.part") }) {
            try {
                Files.deleteIfExists(path);
            } catch (IOException ignored) {
                // The worker also removes partial files after the stream is closed.
            }
        }
    }

    private JsonObject resolveMatch(JobState job) throws IOException, InterruptedException {
        JsonObject cachedMatch = readCachedMatch(job.matchId);
        Path cachedReplay = dataDirectory.resolve("replays").resolve(job.matchId + ".dem");
        if (cachedMatch != null && OpenDotaClient.replayUrl(cachedMatch) != null && hasReplayCache(job.matchId)) {
            job.update("resolving", 10, "Using cached match metadata and Replay");
            return cachedMatch;
        }
        JsonObject match;
        try {
            match = openDota.getMatch(job.matchId);
        } catch (IOException error) {
            if (cachedMatch != null && OpenDotaClient.replayUrl(cachedMatch) != null) {
                job.update("resolving", 10, "Using cached match metadata after OpenDota timeout");
                return cachedMatch;
            }
            throw error;
        }
        if (OpenDotaClient.replayUrl(match) != null) {
            return match;
        }
        if (cachedMatch != null && OpenDotaClient.replayUrl(cachedMatch) != null) {
            job.update("resolving", 10, "Using cached Replay metadata");
            return cachedMatch;
        }

        job.update("requesting_replay", 14, "Requesting Replay metadata from OpenDota");
        openDota.requestParse(job.matchId);
        int waitSeconds = intEnvironment("DOTA_LENS_REPLAY_WAIT_SECONDS", DEFAULT_REPLAY_WAIT_SECONDS);
        int attempts = Math.max(1, waitSeconds / 5);
        for (int attempt = 0; attempt < attempts; attempt++) {
            int progress = Math.min(24, 15 + (attempt * 9 / attempts));
            job.update("waiting_replay", progress, "Waiting for Replay metadata from OpenDota");
            Thread.sleep(5000);
            match = openDota.getMatch(job.matchId);
            if (OpenDotaClient.replayUrl(match) != null) {
                return match;
            }
        }
        return match;
    }

    private JsonObject readCachedMatch(long matchId) {
        Path path = analysisDirectory(matchId).resolve("match.json");
        if (!Files.isRegularFile(path)) {
            return null;
        }
        try {
            JsonElement parsed = JsonParser.parseString(Files.readString(path, StandardCharsets.UTF_8));
            return parsed.isJsonObject() ? parsed.getAsJsonObject() : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private void addPatchName(JsonObject match) {
        JsonElement existingName = match.get("patch_name");
        if (existingName != null && !existingName.isJsonNull()
                && !existingName.getAsString().isBlank()) {
            return;
        }
        JsonElement patch = match.get("patch");
        if (patch == null || patch.isJsonNull()) {
            return;
        }
        try {
            String name = openDota.patchName(patch.getAsLong());
            if (name != null && !name.isBlank()) {
                match.addProperty("patch_name", name);
            }
        } catch (Exception ignored) {
            // Patch labels are presentation metadata and must not block Replay parsing.
        }
    }

    private Path acquireReplay(JobState job, URI replayUrl)
            throws IOException, InterruptedException {
        Path replayDirectory = dataDirectory.resolve("replays");
        boolean compressed = replayUrl.getPath().endsWith(".bz2");
        Path replayFile = replayDirectory.resolve(job.matchId + (compressed ? ".dem.bz2" : ".dem"));
        if (Files.isRegularFile(replayFile) && Files.size(replayFile) > 0) {
            job.update("downloaded", 48, "Using cached Replay file");
            return replayFile;
        }

        Path part = replayFile.resolveSibling(replayFile.getFileName() + ".part");
        int retryWindow = Math.max(0, intEnvironment(
                "DOTA_LENS_REPLAY_DOWNLOAD_WAIT_SECONDS", DEFAULT_REPLAY_DOWNLOAD_WAIT_SECONDS));
        Instant deadline = Instant.now().plusSeconds(retryWindow);
        int attempt = 0;
        while (true) {
            attempt++;
            Files.deleteIfExists(part);
            job.beginReplayDownload(attempt);
            try {
                HttpResponse<InputStream> response = openDota.download(replayUrl);
                long contentLength = response.headers().firstValueAsLong("Content-Length").orElse(-1);
                long copied = copyReplay(job, response, part);
                if (copied == 0) {
                    throw new EOFException("Replay download was empty");
                }
                moveReplacing(part, replayFile);
                job.updateTransfer("downloaded", 48, "Replay download complete", copied, contentLength);
                return replayFile;
            } catch (IOException error) {
                Files.deleteIfExists(part);
                int delaySeconds = retryDelaySeconds(attempt);
                boolean retryable = isRetryableReplayError(error);
                if (!retryable || retryWindow == 0
                        || Instant.now().plusSeconds(delaySeconds).isAfter(deadline)) {
                    throw error;
                }
                job.waitForReplay(attempt, delaySeconds, replayHttpStatus(error), safeMessage(error));
                Thread.sleep(delaySeconds * 1000L);
            }
        }
    }

    private long copyReplay(JobState job, HttpResponse<InputStream> response, Path part)
            throws IOException, InterruptedException {
        long contentLength = response.headers().firstValueAsLong("Content-Length").orElse(-1);
        long copied = 0;
        long lastReported = 0;
        InputStream input = new BufferedInputStream(response.body());
        job.attachCancellationResource(input);
        try (input;
                OutputStream output = new BufferedOutputStream(Files.newOutputStream(part))) {
            byte[] buffer = new byte[1024 * 256];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                job.throwIfCanceled();
                if (read == 0) continue;
                output.write(buffer, 0, read);
                copied += read;
                if (copied - lastReported >= 1024 * 1024) {
                    int progress = contentLength > 0
                            ? 25 + (int) Math.min(22, copied * 22 / contentLength)
                            : Math.min(47, 25 + (int) (copied / (8L * 1024 * 1024)));
                    job.updateTransfer("downloading", progress, "Downloading Replay from Valve", copied,
                            contentLength);
                    lastReported = copied;
                }
            }
        } finally {
            job.clearCancellationResource(input);
        }
        return copied;
    }

    private static int retryDelaySeconds(int attempt) {
        int[] delays = { 5, 10, 20, 30, 60 };
        return delays[Math.min(delays.length - 1, Math.max(0, attempt - 1))];
    }

    private static boolean isRetryableReplayError(IOException error) {
        if (error instanceof OpenDotaClient.ReplayDownloadException downloadError) {
            return downloadError.retryable();
        }
        if (error instanceof HttpTimeoutException || error instanceof ConnectException
                || error instanceof SocketException || error instanceof EOFException) {
            return true;
        }
        String message = safeMessage(error).toLowerCase();
        return message.contains("timed out") || message.contains("timeout")
                || message.contains("connection reset") || message.contains("premature")
                || message.contains("header parser received no bytes");
    }

    private static Integer replayHttpStatus(Exception error) {
        return error instanceof OpenDotaClient.ReplayDownloadException downloadError
                ? downloadError.statusCode() : null;
    }

    private Path prepareReplay(JobState job, Path downloadedReplay, URI replayUrl)
            throws IOException, InterruptedException {
        if (!replayUrl.getPath().endsWith(".bz2")) {
            return downloadedReplay;
        }
        Path demFile = downloadedReplay.resolveSibling(job.matchId + ".dem");
        if (validDem(demFile)) {
            job.update("decompressed", 54, "Using cached decompressed Replay");
            return demFile;
        }

        Path part = demFile.resolveSibling(demFile.getFileName() + ".part");
        Files.deleteIfExists(part);
        job.update("decompressing", 49, "Decompressing Replay");
        if (!decompressWithConfiguredPython(job, downloadedReplay, part)) {
            job.throwIfCanceled();
            decompressWithJava(job, downloadedReplay, part);
        }
        if (!validDem(part)) {
            Files.deleteIfExists(part);
            throw new IOException("Decompressed Replay does not have a valid PBDEMS header");
        }
        moveReplacing(part, demFile);
        job.update("decompressed", 54, "Replay decompression complete");
        return demFile;
    }

    private boolean decompressWithConfiguredPython(JobState job, Path source, Path target)
            throws InterruptedException {
        String python = Optional.ofNullable(System.getenv("DOTA_LENS_PYTHON"))
                .filter(value -> !value.isBlank())
                .orElse(null);
        if (python == null) return false;
        String script = "import bz2, shutil, sys\n"
                + "with bz2.open(sys.argv[1], 'rb') as source, open(sys.argv[2], 'wb') as target:\n"
                + "    shutil.copyfileobj(source, target, 1024 * 1024)\n";
        try {
            Process process = new ProcessBuilder(python, "-c", script, source.toString(), target.toString())
                    .redirectErrorStream(true)
                    .start();
            AutoCloseable cancellation = process::destroyForcibly;
            job.attachCancellationResource(cancellation);
            try {
                boolean finished = process.waitFor(120, TimeUnit.SECONDS);
                if (!finished) {
                    process.destroyForcibly();
                    Files.deleteIfExists(target);
                    return false;
                }
                process.getInputStream().readAllBytes();
                if (process.exitValue() != 0) {
                    Files.deleteIfExists(target);
                    return false;
                }
                return true;
            } finally {
                job.clearCancellationResource(cancellation);
            }
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw error;
        } catch (Exception ignored) {
            try {
                Files.deleteIfExists(target);
            } catch (IOException ignoredDelete) {
                // Java decompression will replace the partial file.
            }
            return false;
        }
    }

    private void decompressWithJava(JobState job, Path source, Path target)
            throws IOException, InterruptedException {
        long inputSize = Files.size(source);
        InputStream fileInput = Files.newInputStream(source);
        job.attachCancellationResource(fileInput);
        try (fileInput;
                ProgressInputStream progressInput = new ProgressInputStream(fileInput, inputSize,
                        consumed -> job.updateTransfer("decompressing",
                                49 + (int) Math.min(5, consumed * 5 / inputSize),
                                "Decompressing Replay with Java fallback", consumed, inputSize));
                InputStream compressed = new BufferedInputStream(progressInput);
                InputStream decompressed = new BZip2CompressorInputStream(compressed, true);
                OutputStream output = new BufferedOutputStream(Files.newOutputStream(target), 1024 * 1024)) {
            decompressed.transferTo(output);
        } finally {
            job.clearCancellationResource(fileInput);
        }
    }

    private static boolean validDem(Path path) throws IOException {
        if (!Files.isRegularFile(path) || Files.size(path) < 8) {
            return false;
        }
        byte[] header = new byte[7];
        try (InputStream input = Files.newInputStream(path)) {
            if (input.read(header) != header.length) {
                return false;
            }
        }
        return new String(header, StandardCharsets.US_ASCII).equals("PBDEMS2");
    }

    private void parseReplay(JobState job, Path replayFile, Path outputFile)
            throws IOException, InterruptedException {
        long inputSize = Files.size(replayFile);
        InputStream fileInput = Files.newInputStream(replayFile);
        job.attachCancellationResource(fileInput);
        try (fileInput;
                ProgressInputStream progressInput = new ProgressInputStream(fileInput, inputSize,
                        consumed -> job.updateTransfer("parsing", 56 + (int) Math.min(32, consumed * 32 / inputSize),
                                "Parsing Replay events", consumed, inputSize));
                InputStream bufferedInput = new BufferedInputStream(progressInput);
                OutputStream output = new BufferedOutputStream(Files.newOutputStream(outputFile), 1024 * 1024)) {
            new Parse(bufferedInput, output, false);
        } finally {
            job.clearCancellationResource(fileInput);
        }
    }

    private void gzipRawArchive(JobState job, Path source, Path target)
            throws IOException, InterruptedException {
        long total = Files.size(source);
        long copied = 0;
        InputStream input = new BufferedInputStream(Files.newInputStream(source), 1024 * 1024);
        job.attachCancellationResource(input);
        try (input;
                TunedGzipOutputStream output = new TunedGzipOutputStream(
                        new BufferedOutputStream(Files.newOutputStream(target), 1024 * 1024), 1024 * 256)) {
            byte[] buffer = new byte[1024 * 1024];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                job.throwIfCanceled();
                if (read == 0) continue;
                output.write(buffer, 0, read);
                copied += read;
                if (copied % (16L * 1024 * 1024) < read) {
                    job.updateTransfer("archiving", 95, "Compressing raw Replay event archive", copied, total);
                }
            }
        } finally {
            job.clearCancellationResource(input);
        }
    }

    private void compactReplayCache(long matchId) throws IOException {
        Path replayDirectory = dataDirectory.resolve("replays");
        int cacheCount = Math.max(0, intEnvironment(
                "DOTA_LENS_DECOMPRESSED_CACHE_COUNT", DEFAULT_DECOMPRESSED_CACHE_COUNT));
        pruneDecompressedReplayCache(replayDirectory, matchId, cacheCount);
    }

    static void pruneDecompressedReplayCache(Path replayDirectory, long currentMatchId, int cacheCount)
            throws IOException {
        if (!Files.isDirectory(replayDirectory)) return;
        Path current = replayDirectory.resolve(currentMatchId + ".dem").toAbsolutePath().normalize();
        List<Path> candidates;
        try (var paths = Files.list(replayDirectory)) {
            candidates = paths
                    .filter(path -> path.getFileName().toString().endsWith(".dem"))
                    .filter(path -> nonEmptyFile(path.resolveSibling(path.getFileName() + ".bz2")))
                    .map(path -> path.toAbsolutePath().normalize())
                    .sorted(Comparator.comparingLong((Path path) -> path.equals(current)
                            ? Long.MAX_VALUE : lastModifiedMillis(path)).reversed())
                    .toList();
        }
        for (int index = Math.max(0, cacheCount); index < candidates.size(); index++) {
            Files.deleteIfExists(candidates.get(index));
        }
    }

    private static long lastModifiedMillis(Path path) {
        try {
            return Files.getLastModifiedTime(path).toMillis();
        } catch (IOException ignored) {
            return Long.MIN_VALUE;
        }
    }

    private Path analysisDirectory(long matchId) {
        return dataDirectory.resolve("analyses").resolve(Long.toString(matchId));
    }

    private Path summaryPath(long matchId) {
        return analysisDirectory(matchId).resolve("summary.json");
    }

    private static void moveReplacing(Path source, Path target) throws IOException {
        try {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException ignored) {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private static boolean nonEmptyFile(Path path) {
        try {
            return Files.isRegularFile(path) && Files.size(path) > 0;
        } catch (IOException ignored) {
            return false;
        }
    }

    private static int intEnvironment(String name, int fallback) {
        try {
            return Integer.parseInt(Optional.ofNullable(System.getenv(name)).orElse(""));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static String errorCode(Exception error) {
        if (error instanceof OpenDotaClient.ReplayDownloadException downloadError) {
            if (downloadError.statusCode() == 429) return "rate_limited";
            if (downloadError.statusCode() >= 500) return "replay_server_unavailable";
            return "replay_unavailable";
        }
        String message = safeMessage(error).toLowerCase();
        if (message.contains("replay url")) {
            return "replay_unavailable";
        }
        if (message.contains("http 429")) {
            return "rate_limited";
        }
        if (message.contains("epilogue") || message.contains("completeness")) {
            return "parse_incomplete";
        }
        if (message.contains("bzip") || message.contains("compressed")) {
            return "replay_corrupt";
        }
        return "parse_failed";
    }

    private static String safeMessage(Exception error) {
        String message = error.getMessage();
        if (message == null || message.isBlank()) {
            return error.getClass().getSimpleName();
        }
        return message.length() > 300 ? message.substring(0, 300) : message;
    }

    private static final class ProgressInputStream extends FilterInputStream {
        private final long total;
        private final ProgressListener listener;
        private long consumed;
        private long lastReported;

        ProgressInputStream(InputStream input, long total, ProgressListener listener) {
            super(input);
            this.total = Math.max(1, total);
            this.listener = listener;
        }

        @Override
        public int read() throws IOException {
            int value = super.read();
            if (value >= 0) {
                report(1);
            }
            return value;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            int read = super.read(buffer, offset, length);
            if (read > 0) {
                report(read);
            }
            return read;
        }

        private void report(int bytes) {
            consumed += bytes;
            if (consumed - lastReported >= 1024 * 1024 || consumed >= total) {
                listener.onProgress(consumed);
                lastReported = consumed;
            }
        }
    }

    @FunctionalInterface
    private interface ProgressListener {
        void onProgress(long consumed);
    }

    private static final class JobState {
        final String id = UUID.randomUUID().toString();
        final long matchId;
        final long accountId;
        final String createdAt = Instant.now().toString();
        final long createdNanos = System.nanoTime();
        final Map<String, Long> phaseDurationsMs = new LinkedHashMap<>();
        String updatedAt = createdAt;
        String status = "queued";
        String stage = "queued";
        String message = "Waiting for local parser";
        String errorCode;
        String failedStage;
        String nextRetryAt;
        Integer httpStatus;
        Boolean retryable;
        int retryAttempt;
        int progress = 2;
        long bytesProcessed;
        long bytesTotal = -1;
        JsonObject result;
        volatile boolean cancelRequested;
        volatile Future<?> task;
        volatile AutoCloseable cancellationResource;

        JobState(long matchId, long accountId) {
            this.matchId = matchId;
            this.accountId = accountId;
        }

        static JobState completed(long matchId, long accountId) {
            JobState job = new JobState(matchId, accountId);
            job.status = "completed";
            job.stage = "completed";
            job.message = "Analysis already exists locally";
            job.progress = 100;
            return job;
        }

        synchronized void attachTask(Future<?> nextTask) {
            task = nextTask;
            if (cancelRequested) nextTask.cancel(true);
        }

        synchronized void attachCancellationResource(AutoCloseable resource) throws InterruptedException {
            if (cancelRequested || Thread.currentThread().isInterrupted()) {
                closeQuietly(resource);
                throw new InterruptedException("Replay task canceled");
            }
            cancellationResource = resource;
        }

        synchronized void clearCancellationResource(AutoCloseable resource) {
            if (resource == null || cancellationResource == resource) cancellationResource = null;
        }

        synchronized boolean cancel(String detail) {
            if (!isActive()) return false;
            cancelRequested = true;
            status = "canceled";
            stage = "canceled";
            message = detail;
            nextRetryAt = null;
            updatedAt = Instant.now().toString();
            closeQuietly(cancellationResource);
            cancellationResource = null;
            if (task != null) task.cancel(true);
            return true;
        }

        synchronized void markCanceled(String detail) {
            cancelRequested = true;
            status = "canceled";
            stage = "canceled";
            message = detail;
            nextRetryAt = null;
            updatedAt = Instant.now().toString();
        }

        synchronized boolean cancelRequested() {
            return cancelRequested;
        }

        void throwIfCanceled() throws InterruptedException {
            if (cancelRequested || Thread.currentThread().isInterrupted()) {
                throw new InterruptedException("Replay task canceled");
            }
        }

        synchronized void update(String nextStage, int nextProgress, String nextMessage) {
            if (cancelRequested) return;
            status = "running";
            stage = nextStage;
            progress = Math.max(progress, Math.min(99, nextProgress));
            message = nextMessage;
            if (!nextStage.equals("waiting_replay_file")) nextRetryAt = null;
            updatedAt = Instant.now().toString();
        }

        synchronized void beginReplayDownload(int attempt) {
            update("downloading", 25, attempt > 1
                    ? "Retrying Replay download from Valve" : "Downloading Replay from Valve");
            retryAttempt = Math.max(0, attempt - 1);
            retryable = null;
            httpStatus = null;
        }

        synchronized void waitForReplay(int attempt, int delaySeconds, Integer statusCode, String detail) {
            if (cancelRequested) return;
            status = "running";
            stage = "waiting_replay_file";
            progress = Math.max(progress, 25);
            retryAttempt = attempt;
            retryable = true;
            httpStatus = statusCode;
            nextRetryAt = Instant.now().plusSeconds(delaySeconds).toString();
            message = "Replay download is temporarily unavailable; retrying in " + delaySeconds
                    + " seconds (" + detail + ")";
            updatedAt = Instant.now().toString();
        }

        synchronized void updateTransfer(String nextStage, int nextProgress, String nextMessage,
                long processed, long total) {
            update(nextStage, nextProgress, nextMessage);
            bytesProcessed = processed;
            bytesTotal = total;
        }

        synchronized void complete(JsonObject summary) {
            if (cancelRequested) return;
            status = "completed";
            stage = "completed";
            progress = 100;
            message = "Replay analysis complete";
            result = new JsonObject();
            result.addProperty("analysis_url", "/api/matches/" + matchId + "/analysis");
            result.addProperty("event_count", summary.get("valid_json_objects").getAsLong());
            result.addProperty("raw_bytes", summary.get("raw_bytes").getAsLong());
            if (summary.has("raw_archive_bytes")) {
                result.addProperty("raw_archive_bytes", summary.get("raw_archive_bytes").getAsLong());
            }
            result.add("phase_durations_ms", phaseDurationsJson());
            if (bytesTotal > 0) bytesProcessed = bytesTotal;
            updatedAt = Instant.now().toString();
        }

        synchronized void recordPhase(String name, long startedNanos) {
            long elapsed = Math.max(0L, TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedNanos));
            phaseDurationsMs.merge(name, elapsed, Long::sum);
            System.err.printf("Replay phase: match=%d phase=%s elapsed_ms=%d%n", matchId, name, elapsed);
        }

        synchronized void fail(String code, String detail, Exception error) {
            if (cancelRequested) {
                markCanceled("Canceled by user");
                return;
            }
            failedStage = stage;
            status = "failed";
            stage = "failed";
            message = detail;
            errorCode = code;
            httpStatus = replayHttpStatus(error);
            retryable = error instanceof IOException ioError && isRetryableReplayError(ioError);
            nextRetryAt = null;
            updatedAt = Instant.now().toString();
        }

        synchronized boolean isActive() {
            return status.equals("queued") || status.equals("running");
        }

        synchronized boolean shouldReuse() {
            return isActive() || status.equals("completed");
        }

        synchronized JsonObject snapshot() {
            JsonObject object = new JsonObject();
            object.addProperty("id", id);
            object.addProperty("match_id", matchId);
            object.addProperty("account_id", accountId);
            object.addProperty("status", status);
            object.addProperty("stage", stage);
            object.addProperty("progress", progress);
            object.addProperty("message", message);
            object.addProperty("created_at", createdAt);
            object.addProperty("updated_at", updatedAt);
            object.addProperty("bytes_processed", bytesProcessed);
            object.addProperty("bytes_total", bytesTotal);
            object.addProperty("elapsed_ms",
                    Math.max(0L, TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - createdNanos)));
            object.add("phase_durations_ms", phaseDurationsJson());
            object.addProperty("cancelable", isActive());
            object.addProperty("cancel_requested", cancelRequested);
            if (errorCode != null) {
                object.addProperty("error_code", errorCode);
            }
            if (failedStage != null) object.addProperty("failed_stage", failedStage);
            if (retryAttempt > 0) object.addProperty("retry_attempt", retryAttempt);
            if (nextRetryAt != null) object.addProperty("next_retry_at", nextRetryAt);
            if (httpStatus != null) object.addProperty("http_status", httpStatus);
            if (retryable != null) object.addProperty("retryable", retryable);
            if (result != null) {
                object.add("result", result.deepCopy());
            } else if (status.equals("completed")) {
                JsonObject existing = new JsonObject();
                existing.addProperty("analysis_url", "/api/matches/" + matchId + "/analysis");
                object.add("result", existing);
            }
            return object;
        }

        private JsonObject phaseDurationsJson() {
            JsonObject timings = new JsonObject();
            phaseDurationsMs.forEach(timings::addProperty);
            return timings;
        }

        private static void closeQuietly(AutoCloseable resource) {
            if (resource == null) return;
            try {
                resource.close();
            } catch (Exception ignored) {
                // Cancellation is best effort; worker cleanup handles remaining files.
            }
        }
    }
}
