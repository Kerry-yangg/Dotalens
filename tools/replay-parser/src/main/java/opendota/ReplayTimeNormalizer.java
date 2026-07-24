package opendota;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.NavigableMap;
import java.util.Set;
import java.util.TreeMap;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

/** Aligns delayed CombatLog callbacks to the pause-adjusted clock of their original demo tick. */
final class ReplayTimeNormalizer {
    private static final int MAX_ANCHOR_DISTANCE_TICKS = 45;
    private static final double DEFAULT_MILLIS_PER_TICK = 1000.0 / 30.0;
    private static final Set<String> ANCHOR_FIELDS = Set.of("type", "demo_tick", "game_time_ms");

    private final NavigableMap<Integer, Anchor> anchors = new TreeMap<>();
    private long normalizedEvents;
    private long materiallyCorrectedEvents;
    private long maxCorrectionMs;

    static ReplayTimeNormalizer scan(Path rawJsonl) throws IOException {
        ReplayTimeNormalizer normalizer = new ReplayTimeNormalizer();
        try (BufferedReader reader = Files.newBufferedReader(rawJsonl, StandardCharsets.UTF_8)) {
            String line;
            long lines = 0;
            while ((line = reader.readLine()) != null) {
                lines++;
                if ((lines & 4095L) == 0L && Thread.currentThread().isInterrupted()) {
                    throw new InterruptedIOException("Replay time normalization canceled");
                }
                if (line.isBlank()) continue;
                try {
                    normalizer.observe(JsonLineProjection.parse(line, ANCHOR_FIELDS));
                } catch (RuntimeException ignored) {
                    // The main summary pass reports malformed lines.
                }
            }
        }
        return normalizer;
    }

    void observe(JsonObject event) {
        Integer tick = integerValue(event, "demo_tick");
        Long timeMs = longValue(event, "game_time_ms");
        String type = stringValue(event, "type");
        int priority = anchorPriority(type);
        if (tick == null || tick < 0 || timeMs == null || priority == 0) return;
        Anchor current = anchors.get(tick);
        if (current == null || priority > current.priority) anchors.put(tick, new Anchor(timeMs, priority));
    }

    void normalize(JsonObject event) {
        String type = stringValue(event, "type");
        if (type == null || !type.startsWith("DOTA_COMBATLOG_")) return;
        Integer tick = integerValue(event, "demo_tick");
        Long original = longValue(event, "game_time_ms");
        if (tick == null || tick < 0 || original == null) return;
        Long canonical = estimate(tick);
        if (canonical == null) return;
        long correction = canonical - original;
        event.addProperty("game_time_ms", canonical);
        event.addProperty("time", Math.floorDiv(canonical, 1000L));
        normalizedEvents++;
        long absolute = Math.abs(correction);
        if (absolute >= 50L) {
            materiallyCorrectedEvents++;
            maxCorrectionMs = Math.max(maxCorrectionMs, absolute);
        }
    }

    JsonObject diagnostics() {
        JsonObject row = new JsonObject();
        row.addProperty("model", "demo-tick-anchor/1.0");
        row.addProperty("anchor_count", anchors.size());
        row.addProperty("normalized_combat_events", normalizedEvents);
        row.addProperty("materially_corrected_events", materiallyCorrectedEvents);
        row.addProperty("max_correction_ms", maxCorrectionMs);
        row.addProperty("material_correction_threshold_ms", 50);
        return row;
    }

    private Long estimate(int tick) {
        Anchor exact = anchors.get(tick);
        if (exact != null) return exact.timeMs;
        Map.Entry<Integer, Anchor> floor = anchors.floorEntry(tick);
        Map.Entry<Integer, Anchor> ceiling = anchors.ceilingEntry(tick);
        int floorDistance = floor == null ? Integer.MAX_VALUE : tick - floor.getKey();
        int ceilingDistance = ceiling == null ? Integer.MAX_VALUE : ceiling.getKey() - tick;
        if (floorDistance > MAX_ANCHOR_DISTANCE_TICKS && ceilingDistance > MAX_ANCHOR_DISTANCE_TICKS) return null;
        if (floor != null && ceiling != null && floorDistance <= MAX_ANCHOR_DISTANCE_TICKS
                && ceilingDistance <= MAX_ANCHOR_DISTANCE_TICKS && ceiling.getKey() > floor.getKey()) {
            double ratio = (tick - floor.getKey()) / (double) (ceiling.getKey() - floor.getKey());
            return Math.round(floor.getValue().timeMs
                    + (ceiling.getValue().timeMs - floor.getValue().timeMs) * ratio);
        }
        Map.Entry<Integer, Anchor> nearest = floorDistance <= ceilingDistance ? floor : ceiling;
        if (nearest == null) return null;
        return Math.round(nearest.getValue().timeMs + (tick - nearest.getKey()) * DEFAULT_MILLIS_PER_TICK);
    }

    private static int anchorPriority(String type) {
        if (type == null || type.startsWith("DOTA_COMBATLOG_")) return 0;
        if (type.equals("interval") || type.startsWith("CHAT_MESSAGE_")) return 3;
        if (type.equals("obs") || type.equals("sen") || type.endsWith("_left")) return 2;
        if (type.equals("game_paused") || type.equals("epilogue")) return 1;
        return 0;
    }

    private static Integer integerValue(JsonObject object, String field) {
        JsonElement value = object.get(field);
        if (value == null || value.isJsonNull()) return null;
        try {
            return value.getAsInt();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static Long longValue(JsonObject object, String field) {
        JsonElement value = object.get(field);
        if (value == null || value.isJsonNull()) return null;
        try {
            return value.getAsLong();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static String stringValue(JsonObject object, String field) {
        JsonElement value = object.get(field);
        return value == null || value.isJsonNull() ? null : value.getAsString();
    }

    private record Anchor(long timeMs, int priority) {}
}
