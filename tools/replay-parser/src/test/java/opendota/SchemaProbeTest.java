package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class SchemaProbeTest {
    @Test
    void classifiesTrackedReplayEntities() {
        assertEquals("hero", SchemaProbe.classifyEntity("CDOTA_Unit_Hero_Axe"));
        assertEquals("observer_ward", SchemaProbe.classifyEntity("CDOTA_NPC_Observer_Ward"));
        assertEquals("sentry_ward", SchemaProbe.classifyEntity("CDOTA_NPC_Observer_Ward_TrueSight"));
        assertEquals("item", SchemaProbe.classifyEntity("CDOTA_Item_SentryWard"));
        assertEquals("item", SchemaProbe.classifyEntity("CDOTA_Item_ObserverWard"));
        assertEquals("lane_creep", SchemaProbe.classifyEntity("CDOTA_BaseNPC_Creep_Lane"));
        assertEquals("neutral", SchemaProbe.classifyEntity("CDOTA_Unit_Neutral"));
        assertNull(SchemaProbe.classifyEntity("CDOTAWearableItem"));
        assertTrue(SchemaProbe.isTrackedUnit("hero"));
    }
}
