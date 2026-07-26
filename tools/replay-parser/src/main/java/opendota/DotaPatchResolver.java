package opendota;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

final class DotaPatchResolver {
    static final String SCHEMA = "patch-resolution/1.0";

    private static final Timeline TIMELINE = loadTimeline();

    private DotaPatchResolver() {
    }

    static JsonObject resolve(JsonObject match) {
        String authoritative = normalizePatch(string(match, "patch_name"));
        JsonObject previous = match != null && match.has("patch_resolution")
                && match.get("patch_resolution").isJsonObject()
                        ? match.getAsJsonObject("patch_resolution") : null;
        String previousStatus = string(previous, "status");
        boolean previousResolution = SCHEMA.equals(string(previous, "schema"));
        boolean durablePreviousExact = "exact".equals(previousStatus)
                && hasValue(previous, "authoritative_field");
        boolean cachedNonAuthoritative = previousResolution && !durablePreviousExact;
        boolean explicitAuthoritativeSignal = hasValue(match, "patch");
        if (!authoritative.isBlank() && !authoritative.equals("unknown")
                && (!cachedNonAuthoritative || explicitAuthoritativeSignal)) {
            String source = hasValue(match, "patch")
                    || string(match, "metadata_source").contains("opendota")
                            ? "opendota_match" : "cached_match";
            JsonObject result = resolved("exact", source, authoritative, 1.0, null);
            result.addProperty("authoritative_field", hasValue(match, "patch")
                    ? "patch_id" : source.equals("opendota_match")
                            ? "patch_name" : "cached_patch_name");
            return result;
        }

        Long replayEndTime = longValue(match, "replay_end_time");
        if (replayEndTime == null) {
            Long start = longValue(match, "start_time");
            Long duration = longValue(match, "duration");
            if (start != null && duration != null && start > 0 && duration > 0) {
                replayEndTime = start + duration;
            }
        }
        if (replayEndTime == null || replayEndTime <= 0) {
            return unknown("missing_patch_and_replay_time");
        }
        long resolvedEndTime = replayEndTime;

        for (int index = 0; index < TIMELINE.entries.size(); index++) {
            PatchEntry boundary = TIMELINE.entries.get(index);
            if (Math.abs(resolvedEndTime - boundary.releasedAt) <= TIMELINE.uncertaintySeconds) {
                JsonObject result = base("ambiguous", "replay_end_time", 0.5, resolvedEndTime);
                result.addProperty("reason", "official_release_day_boundary");
                result.addProperty("boundary_patch", boundary.patchName);
                result.addProperty("boundary_released_at", boundary.releasedAt);
                result.addProperty("boundary_uncertainty_seconds", TIMELINE.uncertaintySeconds);
                JsonArray candidates = new JsonArray();
                candidates.add(index == 0 ? "unknown" : TIMELINE.entries.get(index - 1).patchName);
                candidates.add(boundary.patchName);
                result.add("candidates", candidates);
                result.add("gates", gates(false));
                return result;
            }
        }

        PatchEntry selected = TIMELINE.entries.stream()
                .filter(entry -> entry.releasedAt < resolvedEndTime)
                .max(Comparator.comparingLong(entry -> entry.releasedAt))
                .orElse(null);
        if (selected == null) return unknown("before_supported_patch_timeline");

        match.addProperty("patch_name", selected.patchName);
        JsonObject result = resolved("inferred", "replay_end_time", selected.patchName,
                TIMELINE.confidenceOutsideBoundary, resolvedEndTime);
        result.addProperty("time_basis", selected.timeBasis);
        result.addProperty("release_date", selected.releaseDate);
        result.addProperty("released_at", selected.releasedAt);
        result.addProperty("boundary_uncertainty_seconds", TIMELINE.uncertaintySeconds);
        return result;
    }

    private static JsonObject resolved(String status, String source, String patchName,
            double confidence, Long replayEndTime) {
        JsonObject result = base(status, source, confidence, replayEndTime);
        result.addProperty("patch_name", patchName);
        boolean supported = supportedProfile(patchName);
        result.add("gates", gates(supported));
        if (!supported) result.addProperty("reason", "patch_profile_unavailable");
        return result;
    }

    private static JsonObject unknown(String reason) {
        JsonObject result = base("unknown", "none", 0.0, null);
        result.addProperty("reason", reason);
        result.add("gates", gates(false));
        return result;
    }

    private static JsonObject base(String status, String source, double confidence,
            Long replayEndTime) {
        JsonObject result = new JsonObject();
        result.addProperty("schema", SCHEMA);
        result.addProperty("timeline_schema", TIMELINE.schema);
        result.addProperty("status", status);
        result.addProperty("source", source);
        result.addProperty("confidence", confidence);
        if (replayEndTime != null) result.addProperty("replay_end_time", replayEndTime);
        return result;
    }

    private static JsonObject gates(boolean enabled) {
        JsonObject gates = new JsonObject();
        gates.addProperty("map_profile", enabled);
        gates.addProperty("ability_metadata", enabled);
        gates.addProperty("negative_scoring", enabled);
        return gates;
    }

    private static boolean supportedProfile(String patchName) {
        return TIMELINE.entries.stream().anyMatch(entry ->
                entry.patchName.equals(patchName)
                        && PatchAbilityMetadata.load(entry.metadataProfile).exactMatch());
    }

    private static Timeline loadTimeline() {
        try (InputStream stream = DotaPatchResolver.class
                .getResourceAsStream("/dota-patch-timeline.json")) {
            if (stream == null) throw new IllegalStateException("Missing Dota Patch timeline");
            JsonObject root = new Gson().fromJson(
                    new InputStreamReader(stream, StandardCharsets.UTF_8), JsonObject.class);
            String schema = string(root, "schema");
            long uncertainty = requiredLong(root, "uncertainty_seconds");
            double confidence = root.get("confidence_outside_boundary").getAsDouble();
            JsonArray values = root.getAsJsonArray("entries");
            if (!"dota-patch-timeline/1.0".equals(schema) || uncertainty <= 0
                    || confidence < 0.9 || confidence > 1.0 || values == null || values.isEmpty()) {
                throw new IllegalStateException("Malformed Dota Patch timeline");
            }
            List<PatchEntry> entries = new ArrayList<>();
            long previous = Long.MIN_VALUE;
            for (JsonElement value : values) {
                if (!value.isJsonObject()) throw new IllegalStateException("Malformed Patch entry");
                JsonObject row = value.getAsJsonObject();
                long releasedAt = requiredLong(row, "released_at");
                if (releasedAt <= previous) {
                    throw new IllegalStateException("Dota Patch timeline must be strictly ordered");
                }
                PatchEntry entry = new PatchEntry(
                        requiredString(row, "patch_name"),
                        requiredString(row, "release_date"),
                        releasedAt,
                        requiredString(row, "time_basis"),
                        requiredString(row, "metadata_profile"));
                entries.add(entry);
                previous = releasedAt;
            }
            return new Timeline(schema, uncertainty, confidence, List.copyOf(entries));
        } catch (RuntimeException | java.io.IOException error) {
            throw new ExceptionInInitializerError(error);
        }
    }

    private static String normalizePatch(String patchName) {
        if (patchName == null) return "";
        StringBuilder normalized = new StringBuilder();
        for (char character : patchName.trim().toLowerCase(Locale.ROOT).toCharArray()) {
            if (Character.isDigit(character) || character == '.'
                    || character >= 'a' && character <= 'z') {
                normalized.append(character);
            }
        }
        return normalized.toString();
    }

    private static String requiredString(JsonObject source, String field) {
        String value = string(source, field);
        if (value.isBlank()) throw new IllegalStateException("Missing Patch field " + field);
        return value;
    }

    private static long requiredLong(JsonObject source, String field) {
        Long value = longValue(source, field);
        if (value == null) throw new IllegalStateException("Missing Patch field " + field);
        return value;
    }

    private static boolean hasValue(JsonObject source, String field) {
        JsonElement value = source == null ? null : source.get(field);
        return value != null && !value.isJsonNull();
    }

    private static String string(JsonObject source, String field) {
        JsonElement value = source == null ? null : source.get(field);
        try {
            return value == null || value.isJsonNull() ? "" : value.getAsString();
        } catch (RuntimeException ignored) {
            return "";
        }
    }

    private static Long longValue(JsonObject source, String field) {
        JsonElement value = source == null ? null : source.get(field);
        try {
            return value == null || value.isJsonNull() ? null : value.getAsLong();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private record Timeline(String schema, long uncertaintySeconds,
            double confidenceOutsideBoundary, List<PatchEntry> entries) {
    }

    private record PatchEntry(String patchName, String releaseDate, long releasedAt,
            String timeBasis, String metadataProfile) {
    }
}
