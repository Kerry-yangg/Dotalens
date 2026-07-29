package opendota;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/**
 * Canonical Dota map coordinate conversion and patch-scoped region lookup.
 */
final class MapCoordinateService {
    static final String COORDINATE_VERSION = "dota-map-coordinates/2.0";
    static final String REGION_VERSION = "dota-map-regions/2.0";

    static final float ENTITY_MIN = 64.0f;
    static final float ENTITY_MAX = 192.0f;
    static final float ENTITY_SPAN = ENTITY_MAX - ENTITY_MIN;
    static final float WORLD_MIN = -8192.0f;
    static final float WORLD_MAX = 8192.0f;

    private static final float[][] NEW_FRONTIERS_TOP_LANE = {
            { 15, 79 }, { 9, 64 }, { 8, 42 }, { 13, 29 }, { 22, 17 }, { 37, 10 }, { 58, 10 }, { 79, 15 }
    };
    private static final float[][] NEW_FRONTIERS_MID_LANE = {
            { 20, 80 }, { 35, 65 }, { 50, 50 }, { 65, 35 }, { 80, 20 }
    };
    private static final float[][] NEW_FRONTIERS_BOTTOM_LANE = {
            { 21, 85 }, { 43, 88 }, { 68, 88 }, { 87, 82 }, { 89, 60 }, { 88, 36 }, { 84, 21 }
    };

    private static final float[][] LEGACY_TOP_LANE = {
            { 17, 82 }, { 10, 66 }, { 10, 42 }, { 15, 27 }, { 25, 17 }, { 42, 11 }, { 62, 11 }, { 81, 17 }
    };
    private static final float[][] LEGACY_MID_LANE = {
            { 20, 80 }, { 35, 65 }, { 50, 50 }, { 65, 35 }, { 80, 20 }
    };
    private static final float[][] LEGACY_BOTTOM_LANE = {
            { 19, 83 }, { 40, 89 }, { 61, 89 }, { 78, 83 }, { 87, 70 }, { 89, 45 }, { 83, 19 }
    };

    private static final Map<String, float[]> BUILDINGS = buildingPositions();
    private static final List<Landmark> NEW_FRONTIERS_LANDMARKS = List.of(
            new Landmark("radiant_fountain", 5.0f, 87.0f),
            new Landmark("dire_fountain", 88.0f, 8.0f),
            new Landmark("top_river_rune", 35.5f, 35.5f),
            new Landmark("bottom_river_rune", 64.5f, 64.5f),
            new Landmark("radiant_wisdom_rune", 16.0f, 63.0f),
            new Landmark("dire_wisdom_rune", 84.0f, 37.0f),
            new Landmark("radiant_lotus_pool", 55.0f, 86.0f),
            new Landmark("dire_lotus_pool", 45.0f, 14.0f),
            new Landmark("northwest_roshan_pit", 27.0f, 23.0f),
            new Landmark("southeast_roshan_pit", 73.0f, 77.0f));
    private static final List<Landmark> LEGACY_LANDMARKS = List.of(
            new Landmark("radiant_fountain", 5.0f, 87.0f),
            new Landmark("dire_fountain", 88.0f, 8.0f),
            new Landmark("top_river_rune", 35.5f, 35.5f),
            new Landmark("bottom_river_rune", 64.5f, 64.5f),
            new Landmark("legacy_roshan_pit", 40.0f, 31.0f));

    private final String replayPatch;
    private final PatchProfile profile;
    private final Map<String, Long> attempts = new LinkedHashMap<>();
    private final Map<String, Long> invalid = new LinkedHashMap<>();
    private final Map<Integer, ObservedAnchor> observedCamps = new LinkedHashMap<>();
    private final Map<Integer, ObservedAnchor> observedBuildings = new LinkedHashMap<>();

    MapCoordinateService(String patchName) {
        replayPatch = patchName == null || patchName.isBlank() ? "unknown" : patchName;
        profile = selectProfile(replayPatch);
        for (String space : List.of("entity_cell", "world_units", "map_percent")) {
            attempts.put(space, 0L);
            invalid.put(space, 0L);
        }
    }

    Point fromEntity(Float entityX, Float entityY) {
        recordAttempt("entity_cell");
        if (!inRange(entityX, ENTITY_MIN, ENTITY_MAX) || !inRange(entityY, ENTITY_MIN, ENTITY_MAX)) {
            recordInvalid("entity_cell");
            return null;
        }
        float percentX = (entityX - ENTITY_MIN) / ENTITY_SPAN * 100.0f;
        float percentY = (ENTITY_MAX - entityY) / ENTITY_SPAN * 100.0f;
        return point(percentX, percentY, "entity_cell", entityX, entityY);
    }

    Point fromWorld(Float worldX, Float worldY) {
        recordAttempt("world_units");
        if (!inRange(worldX, WORLD_MIN, WORLD_MAX) || !inRange(worldY, WORLD_MIN, WORLD_MAX)) {
            recordInvalid("world_units");
            return null;
        }
        float entityX = worldX / 128.0f + 128.0f;
        float entityY = worldY / 128.0f + 128.0f;
        float percentX = (entityX - ENTITY_MIN) / ENTITY_SPAN * 100.0f;
        float percentY = (ENTITY_MAX - entityY) / ENTITY_SPAN * 100.0f;
        return point(percentX, percentY, "world_units", worldX, worldY);
    }

    Point fromPercent(Float percentX, Float percentY) {
        recordAttempt("map_percent");
        if (!inRange(percentX, 0.0f, 100.0f) || !inRange(percentY, 0.0f, 100.0f)) {
            recordInvalid("map_percent");
            return null;
        }
        return point(percentX, percentY, "map_percent", percentX, percentY);
    }

    Point canonical(float percentX, float percentY, String source, Float sourceX, Float sourceY) {
        if (!Float.isFinite(percentX) || !Float.isFinite(percentY)
                || percentX < 0 || percentX > 100 || percentY < 0 || percentY > 100) {
            return null;
        }
        return point(percentX, percentY, source == null ? "map_percent" : source,
                sourceX == null ? percentX : sourceX, sourceY == null ? percentY : sourceY);
    }

    void observeEntity(Integer handle, String unit, String kind, Integer team, Point point, int time) {
        if (handle == null || point == null || unit == null || kind == null) return;
        String normalized = unit.toLowerCase(Locale.ROOT);
        if (kind.equals("neutral") && normalized.contains("neutralspawner")) {
            observedCamps.putIfAbsent(handle,
                    new ObservedAnchor(handle, "camp-" + handle, unit, team, point, time));
        } else if (kind.equals("building")) {
            observedBuildings.putIfAbsent(handle,
                    new ObservedAnchor(handle, "building-" + handle, unit, team, point, time));
        }
    }

    Point building(String target) {
        float[] value = BUILDINGS.get(target);
        if (value == null) return null;
        Point expected = point(value[0], value[1], "patch_static", value[0], value[1]);
        Integer team = target.contains("goodguys") ? 2 : target.contains("badguys") ? 3 : null;
        ObservedAnchor observed = observedBuildings.values().stream()
                .filter(anchor -> team == null || team.equals(anchor.team))
                .min(Comparator.comparingDouble(anchor -> distance(expected, anchor.point)))
                .orElse(null);
        if (observed != null && distance(expected, observed.point) <= 18.0) {
            Point source = observed.point;
            return point(source.x, source.y, "replay_observed_building", source.sourceX, source.sourceY);
        }
        return expected;
    }

    List<String> towerKeys() {
        return BUILDINGS.keySet().stream().filter(key -> key.contains("tower")).sorted().toList();
    }

    List<Point> roshanPits() {
        return profile.landmarks.stream()
                .filter(landmark -> landmark.key.contains("roshan_pit"))
                .map(landmark -> point(landmark.x, landmark.y, "patch_static", landmark.x, landmark.y))
                .toList();
    }

    String nearestLane(Point point) {
        if (point == null) return "other";
        LaneDistance top = laneDistance(point, profile.topLane, "top");
        LaneDistance mid = laneDistance(point, profile.midLane, "mid");
        LaneDistance bottom = laneDistance(point, profile.bottomLane, "bottom");
        LaneDistance nearest = top.distance <= mid.distance && top.distance <= bottom.distance
                ? top : mid.distance <= bottom.distance ? mid : bottom;
        return nearest.lane;
    }

    double nearestLaneDistance(Point point) {
        if (point == null) return Double.MAX_VALUE;
        return Math.min(laneDistance(point, profile.topLane, "top").distance,
                Math.min(laneDistance(point, profile.midLane, "mid").distance,
                        laneDistance(point, profile.bottomLane, "bottom").distance));
    }

    LaneProjection projectToLane(Point point, String lane) {
        float[][] line = laneLine(lane);
        if (point == null || line == null) return null;
        double totalLength = 0;
        for (int index = 1; index < line.length; index++) {
            totalLength += Math.hypot(
                    line[index][0] - line[index - 1][0],
                    line[index][1] - line[index - 1][1]);
        }
        double traversed = 0;
        double bestDistance = Double.MAX_VALUE;
        double bestProgress = 0;
        float bestX = line[0][0];
        float bestY = line[0][1];
        for (int index = 1; index < line.length; index++) {
            float ax = line[index - 1][0];
            float ay = line[index - 1][1];
            float bx = line[index][0];
            float by = line[index][1];
            double dx = bx - ax;
            double dy = by - ay;
            double segmentLength = Math.hypot(dx, dy);
            if (segmentLength <= 0) continue;
            double t = Math.max(0, Math.min(1,
                    ((point.x - ax) * dx + (point.y - ay) * dy)
                            / (segmentLength * segmentLength)));
            float projectedX = (float) (ax + t * dx);
            float projectedY = (float) (ay + t * dy);
            double candidateDistance = Math.hypot(point.x - projectedX, point.y - projectedY);
            if (candidateDistance < bestDistance) {
                bestDistance = candidateDistance;
                bestProgress = totalLength <= 0 ? 0
                        : (traversed + t * segmentLength) / totalLength;
                bestX = projectedX;
                bestY = projectedY;
            }
            traversed += segmentLength;
        }
        return new LaneProjection(
                normalizeLane(lane),
                Math.max(0, Math.min(1, bestProgress)),
                bestDistance,
                point(bestX, bestY, "lane_projection", point.x, point.y));
    }

    List<TowerAnchor> laneTowers(int team, String lane) {
        String normalizedLane = normalizeLane(lane);
        if (!List.of("top", "mid", "bottom").contains(normalizedLane)) return List.of();
        String side = team == 2 ? "goodguys" : team == 3 ? "badguys" : null;
        if (side == null) return List.of();
        String suffix = normalizedLane.equals("bottom") ? "bot" : normalizedLane;
        List<TowerAnchor> towers = new java.util.ArrayList<>();
        for (int tier = 1; tier <= 3; tier++) {
            String key = "npc_dota_" + side + "_tower" + tier + "_" + suffix;
            Point point = building(key);
            if (point != null) towers.add(new TowerAnchor(key, tier, point, 0));
        }
        return List.copyOf(towers);
    }

    TowerAnchor nearestLaneTower(Point point, int team, String lane) {
        if (point == null) return null;
        return laneTowers(team, lane).stream()
                .map(tower -> new TowerAnchor(tower.key, tower.tier, tower.point,
                        distance(point, tower.point)))
                .min(Comparator.comparingDouble(TowerAnchor::distance))
                .orElse(null);
    }

    CampAnchor nearestCamp(Point point) {
        if (point == null || observedCamps.isEmpty()) return null;
        ObservedAnchor anchor = observedCamps.values().stream()
                .min(Comparator.comparingDouble(candidate -> distance(point, candidate.point)))
                .orElse(null);
        if (anchor == null) return null;
        return new CampAnchor(anchor.key, anchor.handle, anchor.point,
                distance(point, anchor.point), anchor.firstObserved);
    }

    List<CampAnchor> observedCampAnchors() {
        return observedCamps.values().stream()
                .sorted(Comparator.comparing(anchor -> anchor.key))
                .map(anchor -> new CampAnchor(anchor.key, anchor.handle, anchor.point, 0, anchor.firstObserved))
                .toList();
    }

    JsonObject calibrationAnchors() {
        JsonObject result = new JsonObject();
        JsonArray camps = new JsonArray();
        observedCampAnchors().forEach(anchor -> {
            JsonObject row = new JsonObject();
            row.addProperty("id", anchor.id);
            row.addProperty("handle", anchor.handle);
            row.addProperty("first_observed", anchor.firstObserved);
            annotate(row, anchor.point, true);
            row.addProperty("evidence", "replay_entity");
            camps.add(row);
        });
        JsonArray buildings = new JsonArray();
        observedBuildings.values().stream().sorted(Comparator.comparing(anchor -> anchor.key)).forEach(anchor -> {
            JsonObject row = new JsonObject();
            row.addProperty("id", anchor.key);
            row.addProperty("handle", anchor.handle);
            row.addProperty("team", anchor.team);
            row.addProperty("unit", anchor.unit);
            row.addProperty("first_observed", anchor.firstObserved);
            annotate(row, anchor.point, true);
            row.addProperty("evidence", "replay_entity");
            buildings.add(row);
        });
        result.add("neutral_spawners", camps);
        result.add("buildings", buildings);
        return result;
    }

    boolean isDireHalfEntity(Float entityX, Float entityY) {
        return inRange(entityX, ENTITY_MIN, ENTITY_MAX)
                && inRange(entityY, ENTITY_MIN, ENTITY_MAX)
                && entityX + entityY >= ENTITY_MIN + ENTITY_MAX;
    }

    Region classify(Point point) {
        if (point == null) return Region.unknown();
        float x = point.x;
        float y = point.y;
        if (insidePolygon(x, y, new float[][] { { 0, 100 }, { 0, 70 }, { 18, 70 }, { 28, 88 }, { 28, 100 } })) {
            return region("radiant_base", "other", "base", 0.98f, point);
        }
        if (insidePolygon(x, y, new float[][] { { 72, 0 }, { 100, 0 }, { 100, 30 }, { 82, 30 }, { 72, 12 } })) {
            return region("dire_base", "other", "base", 0.98f, point);
        }

        LaneDistance top = laneDistance(point, profile.topLane, "top");
        LaneDistance mid = laneDistance(point, profile.midLane, "mid");
        LaneDistance bottom = laneDistance(point, profile.bottomLane, "bottom");
        LaneDistance nearest = top.distance <= mid.distance && top.distance <= bottom.distance
                ? top : mid.distance <= bottom.distance ? mid : bottom;
        float laneWidth = nearest.lane.equals("mid") ? 7.0f : 8.5f;
        if (nearest.distance <= laneWidth) {
            float confidence = (float) Math.max(0.55, 1.0 - nearest.distance / (laneWidth * 1.7));
            return region(nearest.lane + "_lane", nearest.lane, "lane", confidence, point);
        }

        if (Math.abs(x - y) <= 9.0f && x >= 18 && x <= 82) {
            return region("river", "other", "river", 0.82f, point);
        }
        if (x < 52 && y > 48) {
            String context = x >= 48 && y >= 66 ? "radiant_triangle" : "radiant_main_jungle";
            return region("radiant_jungle", "other", context, 0.76f, point);
        }
        if (x > 48 && y < 52) {
            String context = x <= 52 && y <= 34 ? "dire_triangle" : "dire_main_jungle";
            return region("dire_jungle", "other", context, 0.76f, point);
        }
        return region("river", "other", "river_transition", 0.58f, point);
    }

    void annotate(JsonObject object, Point point, boolean verbose) {
        if (point == null) {
            object.addProperty("coordinate_valid", false);
            object.addProperty("coordinate_space", "unknown");
            return;
        }
        Region region = classify(point);
        object.addProperty("x", round(point.x));
        object.addProperty("y", round(point.y));
        object.addProperty("region", region.primary);
        object.addProperty("coordinate_valid", true);
        object.addProperty("coordinate_space", "map_percent");
        object.addProperty("coordinate_source", point.source);
        if (!verbose) return;

        object.addProperty("coordinate_version", COORDINATE_VERSION);
        object.addProperty("region_version", REGION_VERSION);
        object.addProperty("region_context", region.context);
        object.addProperty("region_confidence", Math.round(region.confidence * 100));
        if (!region.nearestLandmark.equals("unknown")) {
            object.addProperty("nearest_landmark", region.nearestLandmark);
            object.addProperty("landmark_distance_pct", round(region.landmarkDistance));
        }
        JsonObject raw = new JsonObject();
        raw.addProperty("space", point.source);
        raw.addProperty("x", round(point.sourceX));
        raw.addProperty("y", round(point.sourceY));
        object.add("coordinate_raw", raw);
    }

    JsonObject manifest() {
        JsonObject result = new JsonObject();
        result.addProperty("coordinate_space", "map_percent");
        result.addProperty("coordinate_version", COORDINATE_VERSION);
        result.addProperty("region_version", REGION_VERSION);
        result.addProperty("replay_patch", replayPatch);
        result.addProperty("calibration_profile", profile.id);
        result.addProperty("patch_family", profile.family);
        result.addProperty("calibration_exact", profile.exact);
        result.addProperty("calibration_support", profile.support);
        result.addProperty("calibration_mode", observedCamps.isEmpty() && observedBuildings.isEmpty()
                ? "patch_static" : "replay_dynamic_plus_patch_static");
        result.addProperty("x_axis", "west_to_east");
        result.addProperty("y_axis", "north_to_south");

        JsonArray supportedProfiles = new JsonArray();
        supportedProfiles.add("legacy_pre_7.33");
        supportedProfiles.add("new_frontiers_7.33_to_7.40");
        supportedProfiles.add("current_7.41");
        result.add("supported_profiles", supportedProfiles);

        JsonObject bounds = new JsonObject();
        bounds.add("entity_cell", range(ENTITY_MIN, ENTITY_MAX));
        bounds.add("world_units", range(WORLD_MIN, WORLD_MAX));
        bounds.add("map_percent", range(0, 100));
        result.add("bounds", bounds);

        JsonObject diagnostics = new JsonObject();
        JsonObject attemptRows = new JsonObject();
        attempts.forEach(attemptRows::addProperty);
        JsonObject invalidRows = new JsonObject();
        invalid.forEach(invalidRows::addProperty);
        diagnostics.add("conversion_attempts", attemptRows);
        diagnostics.add("invalid_points", invalidRows);
        diagnostics.addProperty("invalid_total", invalid.values().stream().mapToLong(Long::longValue).sum());
        diagnostics.addProperty("observed_camp_anchors", observedCamps.size());
        diagnostics.addProperty("observed_building_anchors", observedBuildings.size());
        result.add("diagnostics", diagnostics);
        return result;
    }

    private Region region(String primary, String lane, String context, float confidence, Point point) {
        Landmark nearest = null;
        double distance = Double.MAX_VALUE;
        for (Landmark landmark : profile.landmarks) {
            double candidate = Math.hypot(point.x - landmark.x, point.y - landmark.y);
            if (candidate < distance) {
                nearest = landmark;
                distance = candidate;
            }
        }
        return new Region(primary, lane, context, confidence,
                nearest == null || distance > 18 ? "unknown" : nearest.key,
                nearest == null ? 0 : (float) distance);
    }

    private static Point point(float percentX, float percentY, String source, float sourceX, float sourceY) {
        float entityX = ENTITY_MIN + percentX / 100.0f * ENTITY_SPAN;
        float entityY = ENTITY_MAX - percentY / 100.0f * ENTITY_SPAN;
        float worldX = (entityX - 128.0f) * 128.0f;
        float worldY = (entityY - 128.0f) * 128.0f;
        return new Point(percentX, percentY, entityX, entityY, worldX, worldY, source, sourceX, sourceY);
    }

    private void recordAttempt(String space) {
        attempts.compute(space, (ignored, value) -> value == null ? 1 : value + 1);
    }

    private void recordInvalid(String space) {
        invalid.compute(space, (ignored, value) -> value == null ? 1 : value + 1);
    }

    private static boolean inRange(Float value, float min, float max) {
        return value != null && Float.isFinite(value) && value >= min && value <= max;
    }

    private static JsonArray range(float min, float max) {
        JsonArray values = new JsonArray();
        values.add(min);
        values.add(max);
        return values;
    }

    private static float round(float value) {
        return Math.round(value * 100.0f) / 100.0f;
    }

    private static LaneDistance laneDistance(Point point, float[][] line, String lane) {
        double best = Double.MAX_VALUE;
        for (int index = 1; index < line.length; index++) {
            best = Math.min(best, pointToSegmentDistance(point.x, point.y,
                    line[index - 1][0], line[index - 1][1], line[index][0], line[index][1]));
        }
        return new LaneDistance(lane, best);
    }

    private float[][] laneLine(String lane) {
        return switch (normalizeLane(lane)) {
            case "top" -> profile.topLane;
            case "mid" -> profile.midLane;
            case "bottom" -> profile.bottomLane;
            default -> null;
        };
    }

    private static String normalizeLane(String lane) {
        if (lane == null) return "other";
        return switch (lane.toLowerCase(Locale.ROOT)) {
            case "top", "top_lane" -> "top";
            case "middle", "mid", "mid_lane" -> "mid";
            case "bottom", "bot", "bottom_lane", "bot_lane" -> "bottom";
            default -> "other";
        };
    }

    private static double distance(Point left, Point right) {
        return Math.hypot(left.x - right.x, left.y - right.y);
    }

    private static double pointToSegmentDistance(float px, float py, float ax, float ay, float bx, float by) {
        double dx = bx - ax;
        double dy = by - ay;
        if (dx == 0 && dy == 0) return Math.hypot(px - ax, py - ay);
        double t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }

    private static boolean insidePolygon(float x, float y, float[][] polygon) {
        boolean inside = false;
        for (int i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            float xi = polygon[i][0];
            float yi = polygon[i][1];
            float xj = polygon[j][0];
            float yj = polygon[j][1];
            float denominator = yj - yi;
            if (Math.abs(denominator) < 0.0001f) denominator = denominator < 0 ? -0.0001f : 0.0001f;
            boolean intersects = (yi > y) != (yj > y)
                    && x < (xj - xi) * (y - yi) / denominator + xi;
            if (intersects) inside = !inside;
        }
        return inside;
    }

    private static PatchProfile selectProfile(String patchName) {
        double version = patchVersion(patchName);
        if (version >= 7.41 && version < 7.42) {
            return new PatchProfile("current_7.41", "7.41", true, "exact_patch_profile",
                    NEW_FRONTIERS_TOP_LANE, NEW_FRONTIERS_MID_LANE, NEW_FRONTIERS_BOTTOM_LANE,
                    NEW_FRONTIERS_LANDMARKS);
        }
        if (version >= 7.33) {
            return new PatchProfile("new_frontiers_7.33_to_7.40", "new_frontiers", false,
                    "family_profile_dynamic_anchors_preferred",
                    NEW_FRONTIERS_TOP_LANE, NEW_FRONTIERS_MID_LANE, NEW_FRONTIERS_BOTTOM_LANE,
                    NEW_FRONTIERS_LANDMARKS);
        }
        if (version > 0) {
            return new PatchProfile("legacy_pre_7.33", "legacy", false,
                    "legacy_family_profile_dynamic_anchors_required",
                    LEGACY_TOP_LANE, LEGACY_MID_LANE, LEGACY_BOTTOM_LANE, LEGACY_LANDMARKS);
        }
        return new PatchProfile("unknown_patch_dynamic", "unknown", false,
                "unknown_patch_dynamic_anchors_required",
                NEW_FRONTIERS_TOP_LANE, NEW_FRONTIERS_MID_LANE, NEW_FRONTIERS_BOTTOM_LANE,
                NEW_FRONTIERS_LANDMARKS);
    }

    private static double patchVersion(String patchName) {
        if (patchName == null) return -1;
        StringBuilder value = new StringBuilder();
        boolean decimalSeen = false;
        for (char character : patchName.toCharArray()) {
            if (Character.isDigit(character)) {
                value.append(character);
            } else if (character == '.' && !decimalSeen && !value.isEmpty()) {
                value.append(character);
                decimalSeen = true;
            } else if (!value.isEmpty()) {
                break;
            }
        }
        try {
            return value.isEmpty() ? -1 : Double.parseDouble(value.toString());
        } catch (NumberFormatException ignored) {
            return -1;
        }
    }

    private static Map<String, float[]> buildingPositions() {
        Map<String, float[]> result = new LinkedHashMap<>();
        result.put("npc_dota_goodguys_tower1_top", new float[] { 9.5f, 36.0f });
        result.put("npc_dota_goodguys_tower2_top", new float[] { 9.0f, 53.0f });
        result.put("npc_dota_goodguys_tower3_top", new float[] { 8.0f, 68.0f });
        result.put("npc_dota_goodguys_tower1_mid", new float[] { 38.0f, 54.0f });
        result.put("npc_dota_goodguys_tower2_mid", new float[] { 27.5f, 63.0f });
        result.put("npc_dota_goodguys_tower3_mid", new float[] { 18.5f, 71.5f });
        result.put("npc_dota_goodguys_tower1_bot", new float[] { 75.0f, 82.0f });
        result.put("npc_dota_goodguys_tower2_bot", new float[] { 46.0f, 85.0f });
        result.put("npc_dota_goodguys_tower3_bot", new float[] { 23.0f, 83.5f });
        result.put("npc_dota_goodguys_tower4", new float[] { 10.0f, 80.5f });
        result.put("npc_dota_goodguys_range_rax_top", new float[] { 6.5f, 70.5f });
        result.put("npc_dota_goodguys_melee_rax_top", new float[] { 10.5f, 70.5f });
        result.put("npc_dota_goodguys_range_rax_mid", new float[] { 15.0f, 72.0f });
        result.put("npc_dota_goodguys_melee_rax_mid", new float[] { 18.0f, 74.5f });
        result.put("npc_dota_goodguys_range_rax_bot", new float[] { 20.0f, 80.5f });
        result.put("npc_dota_goodguys_melee_rax_bot", new float[] { 20.0f, 84.5f });
        result.put("npc_dota_goodguys_fort", new float[] { 5.0f, 83.0f });
        result.put("npc_dota_badguys_tower1_top", new float[] { 18.0f, 12.0f });
        result.put("npc_dota_badguys_tower2_top", new float[] { 49.0f, 11.0f });
        result.put("npc_dota_badguys_tower3_top", new float[] { 70.0f, 12.5f });
        result.put("npc_dota_badguys_tower1_mid", new float[] { 51.0f, 43.5f });
        result.put("npc_dota_badguys_tower2_mid", new float[] { 64.0f, 33.0f });
        result.put("npc_dota_badguys_tower3_mid", new float[] { 73.0f, 24.0f });
        result.put("npc_dota_badguys_tower1_bot", new float[] { 84.0f, 60.0f });
        result.put("npc_dota_badguys_tower2_bot", new float[] { 85.0f, 45.0f });
        result.put("npc_dota_badguys_tower3_bot", new float[] { 85.5f, 28.0f });
        result.put("npc_dota_badguys_tower4", new float[] { 82.5f, 14.5f });
        result.put("npc_dota_badguys_range_rax_top", new float[] { 74.0f, 10.0f });
        result.put("npc_dota_badguys_melee_rax_top", new float[] { 74.0f, 14.0f });
        result.put("npc_dota_badguys_range_rax_mid", new float[] { 74.5f, 19.5f });
        result.put("npc_dota_badguys_melee_rax_mid", new float[] { 77.5f, 22.0f });
        result.put("npc_dota_badguys_range_rax_bot", new float[] { 84.0f, 24.0f });
        result.put("npc_dota_badguys_melee_rax_bot", new float[] { 88.0f, 24.0f });
        result.put("npc_dota_badguys_fort", new float[] { 84.0f, 9.0f });
        return Map.copyOf(result);
    }

    record Point(float x, float y, float entityX, float entityY, float worldX, float worldY,
            String source, float sourceX, float sourceY) {}

    record CampAnchor(String id, int handle, Point point, double distance, int firstObserved) {}

    record LaneProjection(String lane, double progress, double distance, Point point) {}

    record TowerAnchor(String key, int tier, Point point, double distance) {}

    record Region(String primary, String lane, String context, float confidence,
            String nearestLandmark, float landmarkDistance) {
        static Region unknown() {
            return new Region("unknown", "other", "unknown", 0, "unknown", 0);
        }
    }

    private record Landmark(String key, float x, float y) {}
    private record LaneDistance(String lane, double distance) {}
    private record PatchProfile(String id, String family, boolean exact, String support,
            float[][] topLane, float[][] midLane, float[][] bottomLane, List<Landmark> landmarks) {}
    private record ObservedAnchor(int handle, String key, String unit, Integer team,
            Point point, int firstObserved) {}
}
