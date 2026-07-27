package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.net.URI;

import org.junit.jupiter.api.Test;

class DotaLensApiQueryTest {
    @Test
    void matchListLimitDefaultsToTwentyAndAcceptsOneThroughFiveHundred() {
        assertEquals(20, DotaLensApi.matchListLimit(URI.create("/api/players/123/matches")));
        assertEquals(1, DotaLensApi.matchListLimit(URI.create("/api/players/123/matches?limit=1")));
        assertEquals(75, DotaLensApi.matchListLimit(URI.create("/api/players/123/matches?limit=75")));
        assertEquals(500, DotaLensApi.matchListLimit(URI.create("/api/players/123/matches?limit=500")));
    }

    @Test
    void matchListLimitRejectsMalformedOrOutOfRangeValues() {
        assertNull(DotaLensApi.matchListLimit(URI.create("/api/players/123/matches?limit=0")));
        assertNull(DotaLensApi.matchListLimit(URI.create("/api/players/123/matches?limit=501")));
        assertNull(DotaLensApi.matchListLimit(URI.create("/api/players/123/matches?limit=abc")));
        assertNull(DotaLensApi.matchListLimit(URI.create("/api/players/123/matches?limit=20&limit=40")));
    }
}
