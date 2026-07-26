package opendota;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

final class ReplayMatchMetadata {
    private static final long STEAM_ID64_BASE = 76561197960265728L;

    private ReplayMatchMetadata() {
    }

    static JsonObject enrich(Path rawJsonl, JsonObject source, long fallbackMatchId) throws IOException {
        Accumulator accumulator = new Accumulator(source, fallbackMatchId);
        try (BufferedReader reader = Files.newBufferedReader(rawJsonl, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) continue;
                try {
                    String type = JsonLineProjection.compactType(line);
                    if (!"interval".equals(type) && !"epilogue".equals(type)) continue;
                    JsonElement parsed = JsonParser.parseString(line);
                    if (parsed.isJsonObject()) accumulator.accept(parsed.getAsJsonObject());
                } catch (RuntimeException ignored) {
                    // AnalysisSummary owns integrity reporting for malformed lines.
                }
            }
        }
        return accumulator.finish();
    }

    static final class Accumulator {
        private final JsonObject source;
        private final long fallbackMatchId;
        private final boolean authoritativeSource;
        private final Map<Integer, JsonObject> latestBySlot = new TreeMap<>();
        private final Map<Integer, Integer> latestTimeBySlot = new LinkedHashMap<>();
        private JsonObject replayInfo;
        private int latestSecond;

        Accumulator(JsonObject source, long fallbackMatchId) {
            this.source = source == null ? new JsonObject() : source.deepCopy();
            this.fallbackMatchId = fallbackMatchId;
            this.authoritativeSource = this.source.entrySet().stream()
                    .anyMatch(entry -> !entry.getKey().equals("match_id")
                            && !entry.getKey().equals("metadata_source"));
        }

        void accept(JsonObject event) {
            String type = stringValue(event, "type");
            if ("interval".equals(type)) acceptInterval(event);
            else if ("epilogue".equals(type)) acceptEpilogue(event);
        }

        JsonObject finish() {
            JsonObject result = source.deepCopy();
            Long internalMatchId = longObjectValue(replayInfo, "matchId_");
            long replayMatchId = internalMatchId == null ? fallbackMatchId : internalMatchId;
            addMissing(result, "match_id", replayMatchId > 0 ? replayMatchId : fallbackMatchId);
            if (internalMatchId != null && internalMatchId > 0) {
                result.addProperty("replay_match_id", internalMatchId);
            }
            addMissing(result, "game_mode", integerValue(replayInfo, "gameMode_"));
            Integer winner = integerValue(replayInfo, "gameWinner_");
            if (!hasValue(result, "radiant_win") && winner != null) {
                result.addProperty("radiant_win", winner == 2);
            }
            if (!hasValue(result, "duration") && latestSecond > 0) {
                result.addProperty("duration", latestSecond);
            }
            Long endTime = longObjectValue(replayInfo, "endTime_");
            if (endTime != null && endTime > 0) result.addProperty("replay_end_time", endTime);
            if (!hasValue(result, "start_time") && endTime != null && latestSecond > 0) {
                result.addProperty("start_time", Math.max(0, endTime - latestSecond));
            }
            if (!hasValue(result, "radiant_score")) {
                result.addProperty("radiant_score", teamKills(0, 5));
            }
            if (!hasValue(result, "dire_score")) {
                result.addProperty("dire_score", teamKills(5, 10));
            }
            result.add("players", mergePlayers(result.get("players")));
            result.addProperty("metadata_source", authoritativeSource
                    ? "opendota_plus_replay" : "local_replay");
            return result;
        }

        private void acceptInterval(JsonObject event) {
            Integer slot = integerValue(event, "slot");
            if (slot == null || slot < 0 || slot > 9) return;
            int time = Math.max(0, intValue(event, "time", 0));
            latestSecond = Math.max(latestSecond, time);
            if (time < latestTimeBySlot.getOrDefault(slot, Integer.MIN_VALUE)) return;
            latestTimeBySlot.put(slot, time);

            JsonObject player = new JsonObject();
            player.addProperty("player_slot", externalSlot(slot));
            copy(event, player, "hero_id", "hero_id");
            copy(event, player, "gold", "gold");
            copy(event, player, "xp", "xp");
            copy(event, player, "lh", "last_hits");
            copy(event, player, "denies", "denies");
            copy(event, player, "level", "level");
            copy(event, player, "kills", "kills");
            copy(event, player, "deaths", "deaths");
            copy(event, player, "assists", "assists");
            copy(event, player, "networth", "net_worth");
            copy(event, player, "stuns", "stuns");
            copy(event, player, "obs_placed", "obs_placed");
            copy(event, player, "sen_placed", "sen_placed");
            copy(event, player, "creeps_stacked", "creeps_stacked");
            copy(event, player, "camps_stacked", "camps_stacked");
            copy(event, player, "rune_pickups", "rune_pickups");
            copy(event, player, "teamfight_participation", "teamfight_participation");
            copy(event, player, "towers_killed", "towers_killed");
            copy(event, player, "roshans_killed", "roshans_killed");
            latestBySlot.put(slot, player);
        }

        private void acceptEpilogue(JsonObject event) {
            String encoded = stringValue(event, "key");
            if (encoded == null || encoded.isBlank()) return;
            try {
                JsonObject root = JsonParser.parseString(encoded).getAsJsonObject();
                JsonObject gameInfo = object(root, "gameInfo_");
                JsonObject dota = object(gameInfo, "dota_");
                if (dota.size() > 0) replayInfo = dota;
            } catch (RuntimeException ignored) {
                // Some older replays expose no readable CDemoFileInfo payload.
            }
        }

        private JsonArray mergePlayers(JsonElement existingElement) {
            Map<Integer, JsonObject> replayPlayers = replayPlayers();
            JsonArray merged = new JsonArray();
            if (existingElement != null && existingElement.isJsonArray()) {
                for (JsonElement element : existingElement.getAsJsonArray()) {
                    if (!element.isJsonObject()) continue;
                    JsonObject player = element.getAsJsonObject().deepCopy();
                    Integer slot = normalizedSlot(integerValue(player, "player_slot"));
                    JsonObject replay = slot == null ? null : replayPlayers.remove(slot);
                    if (replay != null) mergeMissing(player, replay);
                    merged.add(player);
                }
            }
            replayPlayers.values().forEach(merged::add);
            return merged;
        }

        private Map<Integer, JsonObject> replayPlayers() {
            Map<Integer, JsonObject> players = new TreeMap<>();
            int radiant = 0;
            int dire = 5;
            JsonArray infos = array(replayInfo, "playerInfo_");
            for (JsonElement element : infos) {
                if (!element.isJsonObject()) continue;
                JsonObject info = element.getAsJsonObject();
                int team = intValue(info, "gameTeam_", 0);
                int slot = team == 2 ? radiant++ : team == 3 ? dire++ : players.size();
                if (slot < 0 || slot > 9) continue;
                JsonObject player = latestBySlot.containsKey(slot)
                        ? latestBySlot.get(slot).deepCopy() : new JsonObject();
                player.addProperty("player_slot", externalSlot(slot));
                player.addProperty("team_number", slot < 5 ? 0 : 1);
                Long steamId = longObjectValue(info, "steamid_");
                if (steamId != null && steamId >= STEAM_ID64_BASE) {
                    player.addProperty("account_id", steamId - STEAM_ID64_BASE);
                }
                String name = byteString(info.get("playerName_"));
                if (name != null && !name.isBlank()) player.addProperty("personaname", name);
                String heroName = byteString(info.get("heroName_"));
                if (heroName != null && !heroName.isBlank()) player.addProperty("hero_name", heroName);
                addRates(player);
                players.put(slot, player);
            }
            latestBySlot.forEach((slot, snapshot) -> {
                if (players.containsKey(slot)) return;
                JsonObject player = snapshot.deepCopy();
                player.addProperty("team_number", slot < 5 ? 0 : 1);
                addRates(player);
                players.put(slot, player);
            });
            return players;
        }

        private void addRates(JsonObject player) {
            int duration = hasValue(source, "duration")
                    ? intValue(source, "duration", latestSecond) : latestSecond;
            if (duration <= 0) return;
            Integer gold = integerValue(player, "gold");
            Integer xp = integerValue(player, "xp");
            if (!hasValue(player, "gold_per_min") && gold != null) {
                player.addProperty("gold_per_min", Math.round(gold * 60.0 / duration));
            }
            if (!hasValue(player, "xp_per_min") && xp != null) {
                player.addProperty("xp_per_min", Math.round(xp * 60.0 / duration));
            }
        }

        private int teamKills(int start, int end) {
            int total = 0;
            for (int slot = start; slot < end; slot++) {
                total += intValue(latestBySlot.get(slot), "kills", 0);
            }
            return total;
        }
    }

    private static void mergeMissing(JsonObject target, JsonObject fallback) {
        fallback.entrySet().forEach(entry -> {
            if (!hasValue(target, entry.getKey())) target.add(entry.getKey(), entry.getValue().deepCopy());
        });
    }

    private static void addMissing(JsonObject target, String field, Number value) {
        if (!hasValue(target, field) && value != null) target.addProperty(field, value);
    }

    private static void copy(JsonObject source, JsonObject target, String sourceField, String targetField) {
        JsonElement value = source.get(sourceField);
        if (value != null && !value.isJsonNull()) target.add(targetField, value.deepCopy());
    }

    private static JsonObject object(JsonObject source, String field) {
        JsonElement value = source == null ? null : source.get(field);
        return value != null && value.isJsonObject() ? value.getAsJsonObject() : new JsonObject();
    }

    private static JsonArray array(JsonObject source, String field) {
        JsonElement value = source == null ? null : source.get(field);
        return value != null && value.isJsonArray() ? value.getAsJsonArray() : new JsonArray();
    }

    private static boolean hasValue(JsonObject source, String field) {
        JsonElement value = source == null ? null : source.get(field);
        return value != null && !value.isJsonNull();
    }

    private static String stringValue(JsonObject source, String field) {
        JsonElement value = source == null ? null : source.get(field);
        try {
            return value == null || value.isJsonNull() ? null : value.getAsString();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static Integer integerValue(JsonObject source, String field) {
        JsonElement value = source == null ? null : source.get(field);
        try {
            return value == null || value.isJsonNull() ? null : value.getAsInt();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static int intValue(JsonObject source, String field, int fallback) {
        Integer value = integerValue(source, field);
        return value == null ? fallback : value;
    }

    private static Long longObjectValue(JsonObject source, String field) {
        JsonElement value = source == null ? null : source.get(field);
        try {
            return value == null || value.isJsonNull() ? null : value.getAsLong();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static long longValue(JsonObject source, String field, long fallback) {
        Long value = longObjectValue(source, field);
        return value == null ? fallback : value;
    }

    private static Integer normalizedSlot(Integer slot) {
        if (slot == null) return null;
        if (slot >= 128 && slot <= 132) return slot - 123;
        return slot >= 0 && slot <= 9 ? slot : null;
    }

    private static int externalSlot(int slot) {
        return slot < 5 ? slot : 128 + slot - 5;
    }

    private static String byteString(JsonElement value) {
        if (value == null || value.isJsonNull()) return null;
        if (value.isJsonPrimitive()) return value.getAsString();
        if (!value.isJsonObject()) return null;
        JsonElement bytesElement = value.getAsJsonObject().get("bytes");
        if (bytesElement == null || !bytesElement.isJsonArray()) return null;
        JsonArray bytes = bytesElement.getAsJsonArray();
        byte[] decoded = new byte[bytes.size()];
        for (int index = 0; index < bytes.size(); index++) {
            decoded[index] = (byte) bytes.get(index).getAsInt();
        }
        return new String(decoded, StandardCharsets.UTF_8);
    }
}
