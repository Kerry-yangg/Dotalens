package opendota;

import java.util.List;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

final class PlayerReportLocalization {
    static final String MODEL = "player-report-localization/1.0";

    private static final List<String> COORDINATE_FIELDS = List.of(
            "coordinate_space",
            "coordinate_source",
            "coordinate_version",
            "region_version");

    private PlayerReportLocalization() {
    }

    static JsonObject forFight(JsonObject fight, int slot) {
        int contactStart = intValue(fight, "contact_start", intValue(fight, "start", 0));
        int contactEnd = intValue(fight, "contact_end", intValue(fight, "end", contactStart));
        int rangeStart = intValue(fight, "review_start", Math.max(0, contactStart - 10));
        String id = stringValue(fight, "id", "fight-" + contactStart);
        return target(
                "combat",
                "fight",
                id,
                slot,
                contactStart,
                rangeStart,
                Math.max(contactStart, contactEnd) + 5,
                fight,
                stringValue(fight, "region", "unknown"));
    }

    static JsonObject forFarm(JsonObject diagnostic, int slot) {
        int time = intValue(diagnostic, "time", 0);
        int end = intValue(diagnostic, "end", time + 30);
        String id = stringValue(diagnostic, "id", "diagnostic-" + slot + "-" + time);
        String region = stringValue(diagnostic, "region",
                stringValue(diagnostic, "route_region", "unknown"));
        return target(
                "farm",
                "farm_diagnostic",
                id,
                slot,
                time,
                Math.max(0, time - 10),
                Math.max(time, end) + 5,
                diagnostic,
                region);
    }

    static JsonObject forLane(JsonObject review, int checkpointTime, String evidenceRef, int slot) {
        String lane = laneRegion(stringValue(review, "lane", "unknown"));
        return target(
                "development",
                "lane_checkpoint",
                evidenceRef,
                slot,
                checkpointTime,
                Math.max(0, checkpointTime - 20),
                checkpointTime + 20,
                review,
                lane);
    }

    static JsonObject aggregate(String module, int time, int slot) {
        return target(
                module,
                "",
                "",
                slot,
                Math.max(0, time),
                Math.max(0, time),
                Math.max(0, time),
                null,
                "unknown");
    }

    static boolean ordinaryEligible(JsonObject jumpTarget) {
        if (jumpTarget == null) return false;
        String level = stringValue(jumpTarget, "location_level", "L0");
        if (!"L2".equals(level) && !"L3".equals(level)) return false;
        if (stringValue(jumpTarget, "entity_id", "").isBlank()) return false;
        return intValue(jumpTarget, "range_end", -1) >= intValue(jumpTarget, "range_start", 0);
    }

    private static JsonObject target(String module, String entityType, String entityId, int slot,
            int time, int rangeStart, int rangeEnd, JsonObject source, String region) {
        JsonObject row = new JsonObject();
        row.addProperty("module", module);
        row.addProperty("entity_type", entityType);
        row.addProperty("entity_id", entityId);
        row.addProperty("player_slot", slot);
        row.addProperty("time", Math.max(0, time));
        row.addProperty("range_start", Math.max(0, rangeStart));
        row.addProperty("range_end", Math.max(Math.max(0, rangeStart), rangeEnd));

        JsonObject mapFocus = mapFocus(source, region);
        String level = locationLevel(entityId, time, mapFocus);
        row.addProperty("location_level", level);
        if (mapFocus.size() > 0) row.add("map_focus", mapFocus);

        JsonObject returnContext = new JsonObject();
        returnContext.addProperty("view", "player-score");
        returnContext.addProperty("player_slot", slot);
        returnContext.addProperty("report_mode", "ordinary");
        row.add("return_context", returnContext);
        return row;
    }

    private static JsonObject mapFocus(JsonObject source, String region) {
        JsonObject focus = new JsonObject();
        if (meaningfulRegion(region)) focus.addProperty("region", region);
        if (source == null) return focus;

        boolean valid = booleanValue(source, "coordinate_valid", false)
                && mapPercentCoordinate(source, "x")
                && mapPercentCoordinate(source, "y");
        if (valid) {
            focus.addProperty("coordinate_valid", true);
            focus.addProperty("x", source.get("x").getAsDouble());
            focus.addProperty("y", source.get("y").getAsDouble());
        }
        for (String key : COORDINATE_FIELDS) copy(focus, source, key);
        copy(focus, source, "location_confidence");
        copy(focus, source, "region_confidence");
        return focus;
    }

    private static String locationLevel(String entityId, int time, JsonObject mapFocus) {
        if (booleanValue(mapFocus, "coordinate_valid", false)
                && finiteNumber(mapFocus, "x")
                && finiteNumber(mapFocus, "y")) {
            return "L3";
        }
        if (!entityId.isBlank() && meaningfulRegion(stringValue(mapFocus, "region", "unknown"))) {
            return "L2";
        }
        if (!entityId.isBlank() && time >= 0) return "L1";
        return "L0";
    }

    private static String laneRegion(String lane) {
        return switch (lane) {
            case "top", "top_lane" -> "top_lane";
            case "middle", "mid", "mid_lane" -> "mid_lane";
            case "bottom", "bot", "bottom_lane" -> "bottom_lane";
            default -> "unknown";
        };
    }

    private static boolean meaningfulRegion(String region) {
        return region != null
                && !region.isBlank()
                && !"unknown".equals(region)
                && !"未定位".equals(region);
    }

    private static boolean finiteNumber(JsonObject object, String key) {
        if (object == null || !object.has(key)) return false;
        try {
            return Double.isFinite(object.get(key).getAsDouble());
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private static boolean mapPercentCoordinate(JsonObject object, String key) {
        if (!finiteNumber(object, key)) return false;
        double value = object.get(key).getAsDouble();
        return value >= 0 && value <= 100;
    }

    private static boolean booleanValue(JsonObject object, String key, boolean fallback) {
        if (object == null || !object.has(key)) return fallback;
        try {
            return object.get(key).getAsBoolean();
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static int intValue(JsonObject object, String key, int fallback) {
        if (object == null || !object.has(key)) return fallback;
        try {
            return object.get(key).getAsInt();
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static String stringValue(JsonObject object, String key, String fallback) {
        if (object == null || !object.has(key)) return fallback;
        try {
            String value = object.get(key).getAsString();
            return value == null ? fallback : value;
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static void copy(JsonObject target, JsonObject source, String key) {
        if (source == null || !source.has(key)) return;
        JsonElement value = source.get(key);
        if (value != null && !value.isJsonNull()) target.add(key, value.deepCopy());
    }
}
