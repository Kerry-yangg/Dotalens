package opendota;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

final class PlayerMatchAvailability {
    private PlayerMatchAvailability() {
    }

    static JsonObject describe(JsonObject profileResponse, JsonArray matches) {
        JsonObject result = new JsonObject();
        boolean hasMatches = matches != null && !matches.isEmpty();
        JsonObject profile = object(profileResponse, "profile");
        boolean historyUnavailable = booleanValue(profile, "fh_unavailable");
        Integer rankTier = integerValue(profileResponse, "rank_tier");
        Integer leaderboardRank = integerValue(profileResponse, "leaderboard_rank");
        boolean likelyImmortalDraft = !hasMatches && historyUnavailable
                && (leaderboardRank != null || rankTier != null && rankTier >= 80);

        result.addProperty("code", hasMatches ? "public"
                : historyUnavailable ? "private_match_history" : "no_public_matches");
        result.addProperty("public_history_available", hasMatches);
        result.addProperty("likely_immortal_draft", likelyImmortalDraft);
        result.addProperty("local_replay_supported", true);
        if (rankTier != null) result.addProperty("rank_tier", rankTier);
        if (leaderboardRank != null) result.addProperty("leaderboard_rank", leaderboardRank);
        String personaname = stringValue(profile, "personaname");
        if (personaname != null) result.addProperty("personaname", personaname);
        return result;
    }

    private static JsonObject object(JsonObject source, String field) {
        JsonElement value = source == null ? null : source.get(field);
        return value != null && value.isJsonObject() ? value.getAsJsonObject() : new JsonObject();
    }

    private static boolean booleanValue(JsonObject source, String field) {
        JsonElement value = source == null ? null : source.get(field);
        return value != null && !value.isJsonNull() && value.getAsBoolean();
    }

    private static Integer integerValue(JsonObject source, String field) {
        JsonElement value = source == null ? null : source.get(field);
        try {
            return value == null || value.isJsonNull() ? null : value.getAsInt();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static String stringValue(JsonObject source, String field) {
        JsonElement value = source == null ? null : source.get(field);
        return value == null || value.isJsonNull() ? null : value.getAsString();
    }
}
