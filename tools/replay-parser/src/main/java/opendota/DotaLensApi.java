package opendota;

import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.util.zip.GZIPOutputStream;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

final class DotaLensApi {
    private static final Gson GSON = new Gson();
    private static final String API_VERSION = "1.5.2";

    private final OpenDotaClient openDota;
    private final ReplayJobManager jobs;
    private final Runnable shutdownAction;
    private final Instant startedAt = Instant.now();

    DotaLensApi() throws IOException {
        this(new OpenDotaClient(), defaultDataDirectory(), () -> System.exit(0));
    }

    DotaLensApi(OpenDotaClient openDota, Path dataDirectory) throws IOException {
        this(openDota, dataDirectory, () -> {});
    }

    DotaLensApi(OpenDotaClient openDota, Path dataDirectory, Runnable shutdownAction) throws IOException {
        this.openDota = openDota;
        this.jobs = new ReplayJobManager(dataDirectory, openDota);
        this.shutdownAction = shutdownAction;
    }

    void register(HttpServer server) {
        server.createContext("/api/status", this::handleStatus);
        server.createContext("/api/shutdown", this::handleShutdown);
        server.createContext("/api/players", this::handlePlayers);
        server.createContext("/api/matches", this::handleMatches);
        server.createContext("/api/jobs", this::handleJobs);
        server.createContext("/api/", this::handleApiNotFound);
    }

    private void handleStatus(HttpExchange exchange) throws IOException {
        if (preflight(exchange)) {
            return;
        }
        if (!exchange.getRequestMethod().equals("GET")) {
            sendError(exchange, 405, "method_not_allowed", "Use GET for parser status");
            return;
        }
        JsonObject status = new JsonObject();
        status.addProperty("status", "ready");
        status.addProperty("version", API_VERSION);
        status.addProperty("parser", "odota/parser+a03b9e5");
        status.addProperty("active_jobs", jobs.activeJobs());
        status.addProperty("pid", ProcessHandle.current().pid());
        status.addProperty("started_at", startedAt.toString());
        status.addProperty("graceful_restart", true);
        status.addProperty("checked_at", Instant.now().toString());
        sendJson(exchange, 200, status);
    }

    private void handleShutdown(HttpExchange exchange) throws IOException {
        if (preflight(exchange)) {
            return;
        }
        if (!exchange.getRequestMethod().equals("POST")) {
            sendError(exchange, 405, "method_not_allowed", "Use POST to stop the local parser");
            return;
        }
        if (jobs.activeJobs() > 0) {
            sendError(exchange, 409, "parser_busy", "Wait for the active Replay task before restarting");
            return;
        }
        JsonObject response = new JsonObject();
        response.addProperty("status", "stopping");
        response.addProperty("version", API_VERSION);
        sendJson(exchange, 202, response);
        Thread.ofPlatform().daemon().name("dota-lens-parser-shutdown").start(() -> {
            try {
                Thread.sleep(100);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            }
            jobs.close();
            shutdownAction.run();
        });
    }

    private void handleApiNotFound(HttpExchange exchange) throws IOException {
        if (preflight(exchange)) {
            return;
        }
        sendError(exchange, 404, "not_found", "Unknown Dota Lens API path");
    }

    private void handlePlayers(HttpExchange exchange) throws IOException {
        if (preflight(exchange)) {
            return;
        }
        if (!exchange.getRequestMethod().equals("GET")) {
            sendError(exchange, 405, "method_not_allowed", "Use GET for player matches");
            return;
        }
        String[] parts = pathParts(exchange.getRequestURI());
        if (parts.length != 5 || !parts[4].equals("matches")) {
            sendError(exchange, 404, "not_found", "Expected /api/players/{account_id}/matches");
            return;
        }
        Long accountId = positiveLong(parts[3]);
        if (accountId == null) {
            sendError(exchange, 400, "invalid_account_id", "account_id must be a positive number");
            return;
        }
        try {
            JsonElement result = openDota.getRecentMatches(accountId);
            if (!result.isJsonArray()) {
                throw new IOException("OpenDota recent matches response is not an array");
            }
            JsonArray matches = result.getAsJsonArray();
            for (JsonElement item : matches) {
                if (!item.isJsonObject()) {
                    continue;
                }
                JsonObject match = item.getAsJsonObject();
                Long matchId = jsonLong(match, "match_id");
                if (matchId == null) {
                    continue;
                }
                JsonObject currentJob = jobs.currentForMatch(matchId);
                boolean hasAnalysis = jobs.hasAnalysis(matchId);
                boolean hasReplayCache = jobs.hasReplayCache(matchId);
                boolean activeJob = currentJob != null && (currentJob.get("status").getAsString().equals("queued")
                        || currentJob.get("status").getAsString().equals("running"));
                String localStatus = activeJob ? "processing"
                        : hasAnalysis ? "full"
                        : hasReplayCache ? "available"
                        : localStatus(match, currentJob);
                match.addProperty("local_status", localStatus);
                match.addProperty("local_analysis", hasAnalysis);
                match.addProperty("local_replay_cache", hasReplayCache);
                if (hasAnalysis) {
                    match.addProperty("analysis_url", "/api/matches/" + matchId + "/analysis");
                }
                if (currentJob != null && (localStatus.equals("processing") || localStatus.equals("failed")
                        || localStatus.equals("canceled"))) {
                    match.add("local_job", currentJob);
                }
            }
            JsonObject payload = new JsonObject();
            payload.addProperty("account_id", accountId);
            payload.addProperty("fetched_at", Instant.now().toString());
            payload.add("matches", matches);
            sendJson(exchange, 200, payload);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            sendError(exchange, 503, "upstream_interrupted", "OpenDota request was interrupted");
        } catch (Exception error) {
            sendUpstreamError(exchange, error);
        }
    }

    private void handleMatches(HttpExchange exchange) throws IOException {
        if (preflight(exchange)) {
            return;
        }
        String[] parts = pathParts(exchange.getRequestURI());
        if (parts.length != 5 && parts.length != 7) {
            sendError(exchange, 404, "not_found", "Unknown match API path");
            return;
        }
        Long matchId = positiveLong(parts[3]);
        if (matchId == null) {
            sendError(exchange, 400, "invalid_match_id", "match_id must be a positive number");
            return;
        }

        if (parts.length == 5 && parts[4].equals("parse") && exchange.getRequestMethod().equals("POST")) {
            JsonObject body = readJsonBody(exchange);
            Long accountId = body == null ? null : jsonLong(body, "account_id");
            boolean force = body != null && jsonBoolean(body, "force");
            JsonObject job = jobs.start(matchId, accountId == null ? 0 : accountId, force);
            sendJson(exchange, job.get("status").getAsString().equals("completed") ? 200 : 202, job);
            return;
        }

        if (parts.length == 5 && parts[4].equals("analysis") && exchange.getRequestMethod().equals("GET")) {
            JsonObject analysis = jobs.readAnalysis(matchId);
            if (analysis == null) {
                sendError(exchange, 404, "analysis_not_found", "This match has not been parsed locally");
                return;
            }
            sendJson(exchange, 200, analysis);
            return;
        }

        if (parts.length == 7 && parts[4].equals("analysis") && parts[5].equals("modules")
                && exchange.getRequestMethod().equals("GET")) {
            String moduleName = parts[6];
            if (!AnalysisStorage.moduleNames().contains(moduleName)) {
                sendError(exchange, 404, "analysis_module_not_found", "Unknown analysis module: " + moduleName);
                return;
            }
            JsonElement module = jobs.readAnalysisModule(matchId, moduleName);
            if (module == null) {
                sendError(exchange, 404, "analysis_module_not_found",
                        "This module is not available for the local analysis");
                return;
            }
            sendJson(exchange, 200, module);
            return;
        }

        sendError(exchange, 405, "method_not_allowed", "Use POST /parse or GET /analysis");
    }

    private void handleJobs(HttpExchange exchange) throws IOException {
        if (preflight(exchange)) {
            return;
        }
        String[] parts = pathParts(exchange.getRequestURI());
        if (parts.length != 4 || parts[3].isBlank()) {
            sendError(exchange, 404, "not_found", "Expected /api/jobs/{job_id}");
            return;
        }
        if (exchange.getRequestMethod().equals("DELETE")) {
            JsonObject canceled = jobs.cancel(parts[3]);
            if (canceled == null) {
                sendError(exchange, 404, "job_not_found", "Unknown local parse job");
                return;
            }
            sendJson(exchange, 200, canceled);
            return;
        }
        if (!exchange.getRequestMethod().equals("GET")) {
            sendError(exchange, 405, "method_not_allowed", "Use GET or DELETE for jobs");
            return;
        }
        JsonObject job = jobs.get(parts[3]);
        if (job == null) {
            sendError(exchange, 404, "job_not_found", "Unknown local parse job");
            return;
        }
        sendJson(exchange, 200, job);
    }

    private static String localStatus(JsonObject match, JsonObject currentJob) {
        if (currentJob != null) {
            String status = currentJob.get("status").getAsString();
            if (status.equals("queued") || status.equals("running")) {
                return "processing";
            }
            if (status.equals("failed")) {
                return "failed";
            }
            if (status.equals("canceled")) {
                return "canceled";
            }
        }
        if (currentJob != null && currentJob.get("status").getAsString().equals("completed")) {
            return "full";
        }
        JsonElement version = match.get("version");
        return version != null && !version.isJsonNull() ? "available" : "basic";
    }

    private static boolean preflight(HttpExchange exchange) throws IOException {
        addCors(exchange);
        if (!exchange.getRequestMethod().equals("OPTIONS")) {
            return false;
        }
        exchange.sendResponseHeaders(204, -1);
        exchange.close();
        return true;
    }

    private static void sendJson(HttpExchange exchange, int status, JsonElement value) throws IOException {
        addCors(exchange);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.getResponseHeaders().set("Vary", "Accept-Encoding");
        boolean gzip = exchange.getRequestHeaders().getFirst("Accept-Encoding") != null
                && exchange.getRequestHeaders().getFirst("Accept-Encoding").toLowerCase().contains("gzip");
        if (gzip) exchange.getResponseHeaders().set("Content-Encoding", "gzip");
        exchange.sendResponseHeaders(status, 0);
        try (OutputStream response = exchange.getResponseBody();
                OutputStream encoded = gzip ? new GZIPOutputStream(response, 64 * 1024) : response;
                OutputStreamWriter writer = new OutputStreamWriter(encoded, StandardCharsets.UTF_8)) {
            GSON.toJson(value, writer);
        } finally {
            exchange.close();
        }
    }

    private static void sendError(HttpExchange exchange, int status, String code, String message) throws IOException {
        JsonObject error = new JsonObject();
        error.addProperty("error", code);
        error.addProperty("message", message);
        sendJson(exchange, status, error);
    }

    private static void sendUpstreamError(HttpExchange exchange, Exception error) throws IOException {
        String message = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
        int status = message.contains("HTTP 429") ? 429 : 502;
        String code = status == 429 ? "opendota_rate_limited" : "opendota_unavailable";
        sendError(exchange, status, code, message.length() > 300 ? message.substring(0, 300) : message);
    }

    private static void addCors(HttpExchange exchange) {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
        exchange.getResponseHeaders().set("Access-Control-Max-Age", "86400");
    }

    private static JsonObject readJsonBody(HttpExchange exchange) throws IOException {
        byte[] bytes = exchange.getRequestBody().readAllBytes();
        if (bytes.length == 0) {
            return new JsonObject();
        }
        try {
            JsonElement parsed = JsonParser.parseString(new String(bytes, StandardCharsets.UTF_8));
            return parsed.isJsonObject() ? parsed.getAsJsonObject() : new JsonObject();
        } catch (RuntimeException error) {
            return new JsonObject();
        }
    }

    private static String[] pathParts(URI uri) {
        return uri.getPath().split("/");
    }

    private static Long positiveLong(String value) {
        try {
            long parsed = Long.parseLong(value);
            return parsed > 0 ? parsed : null;
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static Long jsonLong(JsonObject object, String field) {
        JsonElement value = object.get(field);
        if (value == null || value.isJsonNull()) {
            return null;
        }
        try {
            return value.getAsLong();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static boolean jsonBoolean(JsonObject object, String field) {
        JsonElement value = object.get(field);
        return value != null && !value.isJsonNull() && value.getAsBoolean();
    }

    private static Path defaultDataDirectory() {
        String configured = System.getenv("DOTA_LENS_DATA_DIR");
        if (configured != null && !configured.isBlank()) {
            return Path.of(configured);
        }
        return Path.of(System.getProperty("user.home"), ".dota-lens");
    }
}
