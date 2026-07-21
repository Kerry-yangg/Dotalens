package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import com.google.gson.JsonObject;

class OpenDotaClientTest {
    @Test
    void resolvesDirectAndConstructedReplayUrls() {
        JsonObject direct = new JsonObject();
        direct.addProperty("replay_url", "http://replay.example/42.dem.bz2");
        assertEquals("http://replay.example/42.dem.bz2", OpenDotaClient.replayUrl(direct).toString());

        JsonObject constructed = new JsonObject();
        constructed.addProperty("match_id", 1234567890L);
        constructed.addProperty("cluster", 151);
        constructed.addProperty("replay_salt", 987654321L);
        assertEquals("http://replay151.valve.net/570/1234567890_987654321.dem.bz2",
                OpenDotaClient.replayUrl(constructed).toString());
    }

    @Test
    void requestsProjectedMatchFieldsNeededByTheList() {
        String path = OpenDotaClient.recentMatchesPath(123456789L);

        assertTrue(path.startsWith("/players/123456789/matches?limit=20"));
        assertTrue(path.contains("&project=last_hits"));
        assertTrue(path.contains("&project=denies"));
        assertTrue(path.contains("&project=gold_per_min"));
        assertTrue(path.contains("&project=xp_per_min"));
    }

    @Test
    void retriesTransientReplayServerResponsesOnly() {
        assertTrue(OpenDotaClient.isRetryableReplayStatus(408));
        assertTrue(OpenDotaClient.isRetryableReplayStatus(429));
        assertTrue(OpenDotaClient.isRetryableReplayStatus(502));
        assertTrue(!OpenDotaClient.isRetryableReplayStatus(404));
    }
}
