package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

class PlayerMatchAvailabilityTest {
    @Test
    void identifiesLikelyPrivateImmortalDraftHistory() {
        JsonObject profile = new JsonObject();
        JsonObject identity = new JsonObject();
        identity.addProperty("fh_unavailable", true);
        identity.addProperty("personaname", "每团必至");
        profile.add("profile", identity);
        profile.addProperty("rank_tier", 80);
        profile.addProperty("leaderboard_rank", 3646);

        JsonObject availability = PlayerMatchAvailability.describe(profile, new JsonArray());

        assertEquals("private_match_history", availability.get("code").getAsString());
        assertTrue(availability.get("likely_immortal_draft").getAsBoolean());
        assertTrue(availability.get("local_replay_supported").getAsBoolean());
        assertEquals(3646, availability.get("leaderboard_rank").getAsInt());
    }

    @Test
    void doesNotLabelAVisibleHistoryAsPrivate() {
        JsonObject profile = new JsonObject();
        JsonArray matches = new JsonArray();
        JsonObject match = new JsonObject();
        match.addProperty("match_id", 42);
        matches.add(match);

        JsonObject availability = PlayerMatchAvailability.describe(profile, matches);

        assertEquals("public", availability.get("code").getAsString());
        assertFalse(availability.get("likely_immortal_draft").getAsBoolean());
    }
}
