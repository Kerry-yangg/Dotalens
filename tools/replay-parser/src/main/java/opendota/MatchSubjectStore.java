package opendota;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AccessDeniedException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

final class MatchSubjectStore {
    static final String SCHEMA = "match-subject/1.0";

    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private final Path analysesDirectory;

    MatchSubjectStore(Path dataDirectory) {
        analysesDirectory = dataDirectory.toAbsolutePath().normalize().resolve("analyses");
    }

    synchronized JsonObject reconcile(long matchId, JsonObject match, long requestedAccountId)
            throws IOException {
        JsonObject existing = read(matchId);
        if (isManualDecision(existing)) {
            JsonObject selected = playerBySlot(match, integer(existing, "selected_player_slot", -1));
            if (selected != null && representsSamePlayer(existing, selected)) {
                JsonObject preserved = existing.deepCopy();
                preserved.addProperty("requested_account_id", requestedAccountId);
                persist(matchId, preserved);
                return preserved;
            }
            JsonObject invalidated = base("invalidated", "manual", requestedAccountId);
            invalidated.addProperty("reason", "selected_player_changed");
            persist(matchId, invalidated);
            return invalidated;
        }

        if (requestedAccountId <= 0) {
            JsonObject unresolved = base("manual_required", "none", requestedAccountId);
            unresolved.addProperty("reason", "account_id_not_provided");
            persist(matchId, unresolved);
            return unresolved;
        }

        List<JsonObject> matches = players(match).stream()
                .filter(player -> longValue(player, "account_id", 0L) == requestedAccountId)
                .toList();
        if (matches.size() == 1) {
            JsonObject subject = selectedSubject("matched", "account_id", requestedAccountId,
                    matches.getFirst());
            persist(matchId, subject);
            return subject;
        }

        JsonObject unresolved = base("manual_required", "none", requestedAccountId);
        unresolved.addProperty("reason", matches.isEmpty()
                ? "requested_account_not_in_replay"
                : "requested_account_ambiguous");
        persist(matchId, unresolved);
        return unresolved;
    }

    synchronized JsonObject select(long matchId, JsonObject match, int playerSlot) throws IOException {
        JsonObject player = playerBySlot(match, playerSlot);
        if (player == null) {
            throw new IllegalArgumentException("Replay does not contain player_slot " + playerSlot);
        }
        JsonObject existing = read(matchId);
        long requestedAccountId = longValue(existing, "requested_account_id", 0L);
        JsonObject subject = selectedSubject("manual_selected", "manual", requestedAccountId, player);
        persist(matchId, subject);
        return subject;
    }

    synchronized JsonObject read(long matchId) {
        Path path = path(matchId);
        if (!Files.isRegularFile(path)) return null;
        try {
            JsonElement parsed = JsonParser.parseString(Files.readString(path, StandardCharsets.UTF_8));
            if (!parsed.isJsonObject()) return null;
            JsonObject subject = parsed.getAsJsonObject();
            return SCHEMA.equals(string(subject, "schema")) ? subject : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    synchronized JsonObject overlay(long matchId, JsonObject analysis) throws IOException {
        if (analysis == null) return null;
        JsonObject match = analysis.has("match") && analysis.get("match").isJsonObject()
                ? analysis.getAsJsonObject("match") : new JsonObject();
        if (!analysis.has("match")) analysis.add("match", match);
        long requestedAccountId = longValue(analysis, "account_id", 0L);
        JsonObject subject = reconcile(matchId, match, requestedAccountId);
        apply(match, subject);
        return analysis;
    }

    static void apply(JsonObject match, JsonObject subject) {
        match.add("subject", subject.deepCopy());
        if (subject.has("selected_player_slot")) {
            match.addProperty("selected_player_slot",
                    integer(subject, "selected_player_slot", -1));
        } else {
            match.remove("selected_player_slot");
        }
    }

    private JsonObject selectedSubject(String status, String source, long requestedAccountId,
            JsonObject player) {
        JsonObject subject = base(status, source, requestedAccountId);
        subject.addProperty("selected_player_slot", integer(player, "player_slot", -1));
        long accountId = longValue(player, "account_id", 0L);
        if (accountId > 0) subject.addProperty("selected_account_id", accountId);
        int heroId = integer(player, "hero_id", 0);
        if (heroId > 0) subject.addProperty("selected_hero_id", heroId);
        return subject;
    }

    private static JsonObject base(String status, String source, long requestedAccountId) {
        JsonObject subject = new JsonObject();
        subject.addProperty("schema", SCHEMA);
        subject.addProperty("status", status);
        subject.addProperty("source", source);
        if (requestedAccountId > 0) subject.addProperty("requested_account_id", requestedAccountId);
        subject.addProperty("updated_at", Instant.now().toString());
        return subject;
    }

    private static boolean isManualDecision(JsonObject subject) {
        if (subject == null || !"manual".equals(string(subject, "source"))) return false;
        String status = string(subject, "status");
        return "manual_selected".equals(status) || "invalidated".equals(status);
    }

    private static boolean representsSamePlayer(JsonObject subject, JsonObject player) {
        long expectedAccount = longValue(subject, "selected_account_id", 0L);
        long actualAccount = longValue(player, "account_id", 0L);
        if (expectedAccount > 0 || actualAccount > 0) {
            return expectedAccount > 0 && expectedAccount == actualAccount;
        }
        int expectedHero = integer(subject, "selected_hero_id", 0);
        int actualHero = integer(player, "hero_id", 0);
        return expectedHero > 0 && expectedHero == actualHero;
    }

    private static JsonObject playerBySlot(JsonObject match, int playerSlot) {
        if (playerSlot < 0) return null;
        return players(match).stream()
                .filter(player -> integer(player, "player_slot", -1) == playerSlot)
                .findFirst()
                .orElse(null);
    }

    private static List<JsonObject> players(JsonObject match) {
        List<JsonObject> players = new ArrayList<>();
        if (match == null) return players;
        JsonElement value = match.get("players");
        if (value == null || !value.isJsonArray()) return players;
        JsonArray array = value.getAsJsonArray();
        for (JsonElement element : array) {
            if (element.isJsonObject()) players.add(element.getAsJsonObject());
        }
        return players;
    }

    private void persist(long matchId, JsonObject subject) throws IOException {
        Path target = path(matchId);
        Files.createDirectories(target.getParent());
        Path part = target.resolveSibling(target.getFileName() + ".part");
        Files.writeString(part, GSON.toJson(subject), StandardCharsets.UTF_8);
        moveReplacing(part, target);
    }

    private Path path(long matchId) {
        return analysesDirectory.resolve(Long.toString(matchId)).resolve("subject.json");
    }

    private static String string(JsonObject object, String name) {
        if (object == null) return "";
        JsonElement value = object.get(name);
        return value == null || value.isJsonNull() ? "" : value.getAsString();
    }

    private static int integer(JsonObject object, String name, int fallback) {
        try {
            JsonElement value = object == null ? null : object.get(name);
            return value == null || value.isJsonNull() ? fallback : value.getAsInt();
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static long longValue(JsonObject object, String name, long fallback) {
        try {
            JsonElement value = object == null ? null : object.get(name);
            return value == null || value.isJsonNull() ? fallback : value.getAsLong();
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static void moveReplacing(Path source, Path target) throws IOException {
        for (int attempt = 1; attempt <= 8; attempt++) {
            try {
                moveReplacingOnce(source, target);
                return;
            } catch (AccessDeniedException error) {
                if (attempt == 8) throw error;
                try {
                    Thread.sleep(attempt * 25L);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    error.addSuppressed(interrupted);
                    throw error;
                }
            }
        }
    }

    private static void moveReplacingOnce(Path source, Path target) throws IOException {
        try {
            Files.move(source, target, StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING);
        } catch (AtomicMoveNotSupportedException ignored) {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }
}
