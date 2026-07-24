package opendota;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

/**
 * Strict, patch-scoped ability semantics generated from Valve's public Dota 2
 * datafeed. A current profile is never applied to a Replay from another patch.
 */
final class PatchAbilityMetadata {
    static final String SCHEMA = "dota-ability-metadata/1.0";

    private static final long BEHAVIOR_HIDDEN = 1L;
    private static final long BEHAVIOR_PASSIVE = 2L;
    private static final long BEHAVIOR_NO_TARGET = 4L;
    private static final long BEHAVIOR_UNIT_TARGET = 8L;
    private static final long BEHAVIOR_POINT_TARGET = 16L;
    private static final long BEHAVIOR_TOGGLE = 512L;
    private static final long BEHAVIOR_AUTOCAST = 4096L;
    private static final long BEHAVIOR_ATTACK = 131072L;

    private static final int TARGET_TEAM_FRIENDLY = 1;
    private static final int TARGET_TEAM_ENEMY = 2;
    private static final int TARGET_TYPE_HERO = 1;

    private final String replayPatch;
    private final String profilePatch;
    private final String source;
    private final String generatedAt;
    private final JsonObject provenance;
    private final boolean exactMatch;
    private final Map<String, AbilityProfile> abilities;

    private PatchAbilityMetadata(String replayPatch, String profilePatch, String source,
            String generatedAt, JsonObject provenance, boolean exactMatch,
            Map<String, AbilityProfile> abilities) {
        this.replayPatch = replayPatch;
        this.profilePatch = profilePatch;
        this.source = source;
        this.generatedAt = generatedAt;
        this.provenance = provenance;
        this.exactMatch = exactMatch;
        this.abilities = abilities;
    }

    static PatchAbilityMetadata load(String patchName) {
        String replayPatch = normalizePatch(patchName);
        if (replayPatch.equals("unknown")) return unavailable(replayPatch);
        String resource = "/dota/ability-metadata/" + replayPatch + ".json";
        try (InputStream stream = PatchAbilityMetadata.class.getResourceAsStream(resource)) {
            if (stream == null) return unavailable(replayPatch);
            JsonObject root = new Gson().fromJson(
                    new InputStreamReader(stream, StandardCharsets.UTF_8), JsonObject.class);
            String schema = string(root, "schema");
            String profilePatch = normalizePatch(string(root, "patch"));
            if (!SCHEMA.equals(schema) || !replayPatch.equals(profilePatch)) {
                return unavailable(replayPatch);
            }
            Map<String, AbilityProfile> profiles = new LinkedHashMap<>();
            JsonObject rows = root.getAsJsonObject("abilities");
            if (rows != null) {
                rows.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(entry -> {
                    if (entry.getValue().isJsonObject()) {
                        profiles.put(entry.getKey(), AbilityProfile.from(entry.getKey(),
                                entry.getValue().getAsJsonObject()));
                    }
                });
            }
            return new PatchAbilityMetadata(replayPatch, profilePatch,
                    string(root, "source"), string(root, "generated_at"),
                    root.has("provenance") && root.get("provenance").isJsonObject()
                            ? root.getAsJsonObject("provenance").deepCopy() : null,
                    true,
                    Collections.unmodifiableMap(profiles));
        } catch (IOException | RuntimeException ignored) {
            return unavailable(replayPatch);
        }
    }

    private static PatchAbilityMetadata unavailable(String replayPatch) {
        return new PatchAbilityMetadata(replayPatch, null, null, null, null, false, Map.of());
    }

    AbilityProfile ability(String key) {
        return key == null ? null : abilities.get(key);
    }

    boolean exactMatch() {
        return exactMatch;
    }

    JsonObject manifest() {
        JsonObject row = new JsonObject();
        row.addProperty("schema", SCHEMA);
        row.addProperty("replay_patch", replayPatch);
        if (profilePatch == null) row.add("profile_patch", null); else row.addProperty("profile_patch", profilePatch);
        row.addProperty("match", exactMatch ? "exact" : "unavailable");
        row.addProperty("strict_patch_matching", true);
        row.addProperty("ability_count", abilities.size());
        if (source != null) row.addProperty("source", source);
        if (generatedAt != null) row.addProperty("generated_at", generatedAt);
        if (provenance != null) row.add("provenance", provenance.deepCopy());
        return row;
    }

    private static String normalizePatch(String patchName) {
        if (patchName == null || patchName.isBlank()) return "unknown";
        StringBuilder result = new StringBuilder();
        for (char character : patchName.trim().toLowerCase(Locale.ROOT).toCharArray()) {
            if (Character.isDigit(character) || character == '.' || character >= 'a' && character <= 'z') {
                result.append(character);
            }
        }
        return result.isEmpty() ? "unknown" : result.toString();
    }

    private static String string(JsonObject source, String field) {
        JsonElement value = source == null ? null : source.get(field);
        return value == null || value.isJsonNull() ? null : value.getAsString();
    }

    private static int integer(JsonObject source, String field) {
        JsonElement value = source == null ? null : source.get(field);
        return value == null || value.isJsonNull() ? 0 : value.getAsInt();
    }

    private static long longValue(JsonObject source, String field) {
        String value = string(source, field);
        if (value == null || value.isBlank()) return 0L;
        try {
            return Long.parseUnsignedLong(value);
        } catch (NumberFormatException ignored) {
            return 0L;
        }
    }

    private static float[] floats(JsonObject source, String field) {
        JsonArray values = source == null ? null : source.getAsJsonArray(field);
        if (values == null || values.isEmpty()) return new float[0];
        float[] result = new float[values.size()];
        for (int index = 0; index < values.size(); index++) {
            JsonElement value = values.get(index);
            result[index] = value == null || value.isJsonNull() ? 0.0f : value.getAsFloat();
        }
        return result;
    }

    enum TargetMode {
        UNIT,
        POINT,
        NO_TARGET,
        UNSUPPORTED
    }

    static final class AbilityProfile {
        final String key;
        final int id;
        final long behavior;
        final int targetTeam;
        final int targetType;
        final float[] castRanges;
        final float[] effectRadii;

        private AbilityProfile(String key, int id, long behavior, int targetTeam, int targetType,
                float[] castRanges, float[] effectRadii) {
            this.key = key;
            this.id = id;
            this.behavior = behavior;
            this.targetTeam = targetTeam;
            this.targetType = targetType;
            this.castRanges = castRanges;
            this.effectRadii = effectRadii;
        }

        static AbilityProfile from(String key, JsonObject source) {
            return new AbilityProfile(key, integer(source, "id"), longValue(source, "behavior"),
                    integer(source, "target_team"), integer(source, "target_type"),
                    floats(source, "cast_ranges"), floats(source, "effect_radii"));
        }

        TargetMode targetMode() {
            if (has(BEHAVIOR_UNIT_TARGET)) return TargetMode.UNIT;
            if (has(BEHAVIOR_POINT_TARGET)) return TargetMode.POINT;
            if (has(BEHAVIOR_NO_TARGET)) return TargetMode.NO_TARGET;
            return TargetMode.UNSUPPORTED;
        }

        boolean responsibilityCandidate() {
            return !has(BEHAVIOR_HIDDEN) && !has(BEHAVIOR_PASSIVE) && !has(BEHAVIOR_TOGGLE)
                    && !has(BEHAVIOR_AUTOCAST) && !has(BEHAVIOR_ATTACK)
                    && targetMode() != TargetMode.UNSUPPORTED;
        }

        boolean targetsEnemyHero() {
            return (targetTeam & TARGET_TEAM_ENEMY) != 0
                    && (targetMode() != TargetMode.UNIT || (targetType & TARGET_TYPE_HERO) != 0);
        }

        boolean targetsFriendlyHero() {
            return (targetTeam & TARGET_TEAM_FRIENDLY) != 0
                    && (targetMode() != TargetMode.UNIT || (targetType & TARGET_TYPE_HERO) != 0);
        }

        boolean targetSemanticsKnown() {
            if (targetMode() == TargetMode.UNIT) return targetsEnemyHero() || targetsFriendlyHero();
            return (targetsEnemyHero() || targetsFriendlyHero()) && effectiveRange(1, null) > 0;
        }

        float castRange(int level, Float replayRange) {
            if (replayRange != null && replayRange > 0) return replayRange;
            return levelValue(castRanges, level);
        }

        float effectRadius(int level) {
            return levelValue(effectRadii, level);
        }

        float effectiveRange(int level, Float replayRange) {
            float castRange = castRange(level, replayRange);
            float radius = effectRadius(level);
            return switch (targetMode()) {
                case UNIT -> castRange;
                case POINT -> castRange > 0 ? castRange + Math.max(0, radius) : 0;
                case NO_TARGET -> radius;
                default -> 0;
            };
        }

        private boolean has(long flag) {
            return (behavior & flag) != 0;
        }

        private static float levelValue(float[] values, int level) {
            if (values.length == 0) return 0;
            int index = Math.max(0, Math.min(values.length - 1, level - 1));
            return values[index];
        }
    }
}
