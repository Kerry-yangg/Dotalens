package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import com.google.gson.JsonObject;

class DotaPatchResolverTest {
    @Test
    void trustsAnAuthoritativePatchNameAndEnablesSupportedGates() {
        JsonObject match = new JsonObject();
        match.addProperty("patch_name", "7.41d");
        match.addProperty("patch", 61);
        match.addProperty("metadata_source", "opendota_plus_replay");

        JsonObject resolution = DotaPatchResolver.resolve(match);

        assertEquals("patch-resolution/1.0", resolution.get("schema").getAsString());
        assertEquals("exact", resolution.get("status").getAsString());
        assertEquals("opendota_match", resolution.get("source").getAsString());
        assertEquals("7.41d", resolution.get("patch_name").getAsString());
        JsonObject gates = resolution.getAsJsonObject("gates");
        assertTrue(gates.get("map_profile").getAsBoolean());
        assertTrue(gates.get("ability_metadata").getAsBoolean());
        assertTrue(gates.get("negative_scoring").getAsBoolean());
    }

    @Test
    void infersTheLatestSupportedPatchAwayFromAReleaseBoundary() {
        JsonObject match = new JsonObject();
        match.addProperty("replay_end_time", 1782864000L);

        JsonObject resolution = DotaPatchResolver.resolve(match);

        assertEquals("inferred", resolution.get("status").getAsString());
        assertEquals("replay_end_time", resolution.get("source").getAsString());
        assertEquals("7.41d", resolution.get("patch_name").getAsString());
        assertEquals("7.41d", match.get("patch_name").getAsString());
        assertEquals(0.92, resolution.get("confidence").getAsDouble(), 0.0001);
        assertTrue(resolution.getAsJsonObject("gates")
                .get("negative_scoring").getAsBoolean());
    }

    @Test
    void cachedInferredPatchKeepsItsProvenanceOnTheNextParse() {
        JsonObject match = new JsonObject();
        match.addProperty("patch_name", "7.41d");
        match.addProperty("replay_end_time", 1782864000L);
        match.addProperty("metadata_source", "opendota_plus_replay");
        JsonObject previous = new JsonObject();
        previous.addProperty("schema", "patch-resolution/1.0");
        previous.addProperty("status", "inferred");
        previous.addProperty("source", "replay_end_time");
        previous.addProperty("patch_name", "7.41d");
        match.add("patch_resolution", previous);

        JsonObject resolution = DotaPatchResolver.resolve(match);

        assertEquals("inferred", resolution.get("status").getAsString());
        assertEquals("replay_end_time", resolution.get("source").getAsString());
        assertEquals(0.92, resolution.get("confidence").getAsDouble(), 0.0001);
    }

    @Test
    void cachedExactPatchWithoutDurableAuthorityIsRevalidatedFromReplayTime() {
        JsonObject match = new JsonObject();
        match.addProperty("patch_name", "7.41d");
        match.addProperty("replay_end_time", 1782864000L);
        match.addProperty("metadata_source", "opendota_plus_replay");
        JsonObject previous = new JsonObject();
        previous.addProperty("schema", "patch-resolution/1.0");
        previous.addProperty("status", "exact");
        previous.addProperty("source", "opendota_match");
        previous.addProperty("patch_name", "7.41d");
        match.add("patch_resolution", previous);

        JsonObject resolution = DotaPatchResolver.resolve(match);

        assertEquals("inferred", resolution.get("status").getAsString());
        assertEquals("replay_end_time", resolution.get("source").getAsString());
    }

    @Test
    void marksTheFullOfficialReleaseDayAsAmbiguous() {
        JsonObject match = new JsonObject();
        match.addProperty("replay_end_time", 1780660800L);

        JsonObject resolution = DotaPatchResolver.resolve(match);

        assertEquals("ambiguous", resolution.get("status").getAsString());
        assertFalse(match.has("patch_name"));
        assertFalse(resolution.getAsJsonObject("gates")
                .get("negative_scoring").getAsBoolean());
        assertEquals(2, resolution.getAsJsonArray("candidates").size());
    }

    @Test
    void returnsUnknownWithoutAnAuthoritativePatchOrReplayTime() {
        JsonObject match = new JsonObject();

        JsonObject resolution = DotaPatchResolver.resolve(match);

        assertEquals("unknown", resolution.get("status").getAsString());
        assertFalse(resolution.getAsJsonObject("gates")
                .get("map_profile").getAsBoolean());
        assertFalse(resolution.getAsJsonObject("gates")
                .get("ability_metadata").getAsBoolean());
    }
}
