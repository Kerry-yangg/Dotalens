package opendota;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

final class OpenDotaClient {
    private static final String DEFAULT_API_BASE = "https://api.opendota.com/api";
    private static final String USER_AGENT = "DotaLens/0.4.1 (+local replay analysis; github.com/Kerry-yangg/Dotalens)";
    private static final String[] MATCH_LIST_FIELDS = {
            "player_slot", "radiant_win", "duration", "game_mode", "lobby_type", "hero_id",
            "start_time", "version", "kills", "deaths", "assists", "skill", "leaver_status",
            "party_size", "last_hits", "denies", "gold_per_min", "xp_per_min"
    };

    private final HttpClient client;
    private final String apiBase;
    private final String apiKey;
    private volatile Map<Long, String> patchNames;

    OpenDotaClient() {
        this(DEFAULT_API_BASE, System.getenv("OPENDOTA_API_KEY"));
    }

    OpenDotaClient(String apiBase, String apiKey) {
        this.apiBase = apiBase.replaceAll("/+$", "");
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(20))
                .followRedirects(HttpClient.Redirect.ALWAYS)
                .build();
    }

    JsonElement getRecentMatches(long accountId) throws IOException, InterruptedException {
        return requestJson("GET", recentMatchesPath(accountId));
    }

    static String recentMatchesPath(long accountId) {
        StringBuilder path = new StringBuilder("/players/")
                .append(accountId)
                .append("/matches?limit=20");
        for (String field : MATCH_LIST_FIELDS) {
            path.append("&project=").append(field);
        }
        return path.toString();
    }

    JsonObject getMatch(long matchId) throws IOException, InterruptedException {
        JsonElement result = requestJson("GET", "/matches/" + matchId);
        if (!result.isJsonObject()) {
            throw new IOException("OpenDota match response is not an object");
        }
        return result.getAsJsonObject();
    }

    JsonElement requestParse(long matchId) throws IOException, InterruptedException {
        return requestJson("POST", "/request/" + matchId);
    }

    String patchName(long patchId) throws IOException, InterruptedException {
        Map<Long, String> current = patchNames;
        if (current == null) {
            synchronized (this) {
                current = patchNames;
                if (current == null) {
                    current = new HashMap<>();
                    JsonElement response = requestJson("GET", "/constants/patch");
                    if (response.isJsonArray()) {
                        for (JsonElement item : response.getAsJsonArray()) {
                            if (!item.isJsonObject()) {
                                continue;
                            }
                            JsonObject patch = item.getAsJsonObject();
                            Long id = longValue(patch, "id");
                            String name = stringValue(patch, "name");
                            if (id != null && name != null) {
                                current.put(id, name);
                            }
                        }
                    }
                    patchNames = current;
                }
            }
        }
        return current.get(patchId);
    }

    HttpResponse<InputStream> download(URI replayUrl) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(replayUrl)
                .timeout(Duration.ofMinutes(10))
                .header("User-Agent", USER_AGENT)
                .GET()
                .build();
        HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            response.body().close();
            throw new ReplayDownloadException(response.statusCode());
        }
        return response;
    }

    static boolean isRetryableReplayStatus(int statusCode) {
        return statusCode == 408 || statusCode == 425 || statusCode == 429 || statusCode >= 500;
    }

    static final class ReplayDownloadException extends IOException {
        private final int statusCode;

        ReplayDownloadException(int statusCode) {
            super("Replay server returned HTTP " + statusCode);
            this.statusCode = statusCode;
        }

        int statusCode() {
            return statusCode;
        }

        boolean retryable() {
            return isRetryableReplayStatus(statusCode);
        }
    }

    static URI replayUrl(JsonObject match) {
        String direct = stringValue(match, "replay_url");
        if (direct != null && !direct.isBlank()) {
            return URI.create(direct);
        }
        Long matchId = longValue(match, "match_id");
        Long cluster = longValue(match, "cluster");
        Long replaySalt = longValue(match, "replay_salt");
        if (matchId == null || cluster == null || replaySalt == null || replaySalt == 0) {
            return null;
        }
        return URI.create("http://replay" + cluster + ".valve.net/570/"
                + matchId + "_" + replaySalt + ".dem.bz2");
    }

    private JsonElement requestJson(String method, String path) throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(apiUri(path))
                .timeout(Duration.ofSeconds(45))
                .header("Accept", "application/json")
                .header("User-Agent", USER_AGENT);
        if (method.equals("POST")) {
            builder.POST(HttpRequest.BodyPublishers.noBody());
        } else {
            builder.GET();
        }
        HttpResponse<String> response = client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            String body = response.body() == null ? "" : response.body();
            if (body.length() > 240) {
                body = body.substring(0, 240);
            }
            throw new IOException("OpenDota returned HTTP " + response.statusCode() + ": " + body);
        }
        try {
            return JsonParser.parseString(response.body());
        } catch (RuntimeException error) {
            throw new IOException("OpenDota returned invalid JSON", error);
        }
    }

    private URI apiUri(String path) {
        String separator = path.contains("?") ? "&" : "?";
        String keyQuery = apiKey.isBlank()
                ? ""
                : separator + "api_key=" + URLEncoder.encode(apiKey, StandardCharsets.UTF_8);
        return URI.create(apiBase + path + keyQuery);
    }

    private static String stringValue(JsonObject object, String key) {
        JsonElement value = object.get(key);
        return value == null || value.isJsonNull() ? null : value.getAsString();
    }

    private static Long longValue(JsonObject object, String key) {
        JsonElement value = object.get(key);
        if (value == null || value.isJsonNull()) {
            return null;
        }
        try {
            return value.getAsLong();
        } catch (RuntimeException ignored) {
            return null;
        }
    }
}
