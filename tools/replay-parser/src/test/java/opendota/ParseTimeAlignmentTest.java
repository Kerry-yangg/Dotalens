package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class ParseTimeAlignmentTest {
    @Test
    void usesPauseAdjustedTickClockForCombatEvents() {
        assertEquals(1_997_000L, Parse.alignedCombatGameTimeMs(1_997_000L, 2_034.0f));
    }

    @Test
    void fallsBackToCombatTimestampBeforeTheTickClockIsAvailable() {
        assertEquals(2_034_000L, Parse.alignedCombatGameTimeMs(0, 2_034.0f));
    }

    @Test
    void usesTheOriginalDemoTickAnchorWhenCombatCallbacksArriveLate() {
        assertEquals(2_008_334L,
                Parse.alignedCombatGameTimeMs(2_008_334L, 2_033_034L, 2_033.0334f));
    }
}
