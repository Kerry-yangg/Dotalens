package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import com.google.gson.JsonObject;

class MapCoordinateServiceTest {
    @Test
    void convertsEntityAndWorldBoundsWithoutClamping() {
        MapCoordinateService service = new MapCoordinateService("7.41");

        MapCoordinateService.Point radiantCorner = service.fromEntity(64.0f, 64.0f);
        MapCoordinateService.Point direCorner = service.fromEntity(192.0f, 192.0f);
        MapCoordinateService.Point center = service.fromEntity(128.0f, 128.0f);
        MapCoordinateService.Point worldCenter = service.fromWorld(0.0f, 0.0f);

        assertEquals(0.0, radiantCorner.x(), 0.001);
        assertEquals(100.0, radiantCorner.y(), 0.001);
        assertEquals(100.0, direCorner.x(), 0.001);
        assertEquals(0.0, direCorner.y(), 0.001);
        assertEquals(50.0, center.x(), 0.001);
        assertEquals(50.0, center.y(), 0.001);
        assertEquals(center.x(), worldCenter.x(), 0.001);
        assertEquals(center.y(), worldCenter.y(), 0.001);

        assertNull(service.fromEntity(194.0f, 128.0f));
        assertNull(service.fromWorld(9000.0f, 0.0f));
        assertEquals(2, service.manifest().getAsJsonObject("diagnostics").get("invalid_total").getAsInt());
    }

    @Test
    void classifiesLanesAndAddsVersionedCoordinateEvidence() {
        MapCoordinateService service = new MapCoordinateService("7.41");
        MapCoordinateService.Point bottomLane = service.fromPercent(84.0f, 72.0f);
        MapCoordinateService.Point topLane = service.fromPercent(18.0f, 24.0f);
        JsonObject annotated = new JsonObject();
        service.annotate(annotated, bottomLane, true);

        assertEquals("bottom_lane", service.classify(bottomLane).primary());
        assertEquals("top_lane", service.classify(topLane).primary());
        assertEquals("map_percent", annotated.get("coordinate_space").getAsString());
        assertEquals("map_percent", annotated.get("coordinate_source").getAsString());
        assertEquals(MapCoordinateService.COORDINATE_VERSION,
                annotated.get("coordinate_version").getAsString());
        assertTrue(annotated.get("coordinate_valid").getAsBoolean());
        assertNotNull(annotated.get("region"));
        assertFalse(service.manifest().get("calibration_profile").getAsString().isBlank());
    }

    @Test
    void selectsPatchFamiliesAndPrefersReplayCalibrationAnchors() {
        MapCoordinateService current = new MapCoordinateService("7.41d");
        MapCoordinateService newFrontiers = new MapCoordinateService("7.35c");
        MapCoordinateService legacy = new MapCoordinateService("7.32e");

        assertEquals("current_7.41", current.manifest().get("calibration_profile").getAsString());
        assertTrue(current.manifest().get("calibration_exact").getAsBoolean());
        assertEquals("new_frontiers_7.33_to_7.40",
                newFrontiers.manifest().get("calibration_profile").getAsString());
        assertEquals("legacy_pre_7.33", legacy.manifest().get("calibration_profile").getAsString());

        MapCoordinateService.Point campPoint = current.fromPercent(42.0f, 68.0f);
        current.observeEntity(77, "CDOTA_NeutralSpawner", "neutral", 4, campPoint, -90);
        MapCoordinateService.CampAnchor nearest = current.nearestCamp(current.fromPercent(43.0f, 68.0f));

        assertNotNull(nearest);
        assertEquals(77, nearest.handle());
        assertEquals(1, current.manifest().getAsJsonObject("diagnostics")
                .get("observed_camp_anchors").getAsInt());
        assertEquals("replay_dynamic_plus_patch_static",
                current.manifest().get("calibration_mode").getAsString());
    }
}
