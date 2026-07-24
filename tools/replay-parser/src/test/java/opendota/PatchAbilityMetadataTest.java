package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import com.google.gson.JsonObject;

class PatchAbilityMetadataTest {
    @Test
    void loadsOnlyAnExactPatchProfile() {
        PatchAbilityMetadata metadata = PatchAbilityMetadata.load("7.41d");
        PatchAbilityMetadata.AbilityProfile call = metadata.ability("axe_berserkers_call");

        assertTrue(metadata.exactMatch());
        assertNotNull(call);
        assertEquals(PatchAbilityMetadata.TargetMode.NO_TARGET, call.targetMode());
        assertEquals(315.0f, call.effectRadius(1), 0.01f);
    }

    @Test
    void loadsReconstructedMetadataWithExplicitProvenance() {
        PatchAbilityMetadata metadata = PatchAbilityMetadata.load("7.41");
        PatchAbilityMetadata.AbilityProfile battleHunger = metadata.ability("axe_battle_hunger");

        assertTrue(metadata.exactMatch());
        assertNotNull(battleHunger);
        assertEquals(700.0f, battleHunger.castRange(1, null), 0.01f);
        JsonObject manifest = metadata.manifest();
        assertEquals("reverse_official_patch_notes", manifest.getAsJsonObject("provenance")
                .get("mode").getAsString());
        assertEquals(19, manifest.getAsJsonObject("provenance").get("override_count").getAsInt());
    }

    @Test
    void doesNotApplyCurrentMetadataToAnOlderReplay() {
        PatchAbilityMetadata metadata = PatchAbilityMetadata.load("7.40c");

        assertFalse(metadata.exactMatch());
        assertEquals("unavailable", metadata.manifest().get("match").getAsString());
    }
}
