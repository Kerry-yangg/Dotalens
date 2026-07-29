package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;

class PlayerReportEventCandidatePoolTest {
    @Test
    void collectsFiveFactTypesAndKeepsEveryImportantMoment() {
        JsonObject modules = completeEventModules();
        List<JsonObject> existing = new ArrayList<>();
        existing.add(existingLaneInsight());
        JsonObject evidenceIndex = new JsonObject();

        PlayerReportEventCandidatePool.Result result = PlayerReportEventCandidatePool.build(
                modules, existing, evidenceIndex, 0, 4, 88);

        Set<String> types = stringSet(result.candidates(), "event_type");
        assertTrue(types.containsAll(Set.of(
                "lane", "ward", "purchase", "death", "objective", "teleport")));
        assertTrue(result.importantEvents().size() > 3,
                "important events must not be truncated to three phase stories");
        assertEquals(result.importantEvents().size(),
                countSelected(result.candidates()));
        assertEquals(result.importantEvents().size(), result.storyNodes().size());

        Set<String> selectedTypes = relatedTypes(result.importantEvents());
        assertTrue(selectedTypes.containsAll(Set.of(
                "lane", "ward", "purchase", "death", "objective", "teleport")));

        for (JsonElement element : result.importantEvents()) {
            JsonObject event = element.getAsJsonObject();
            assertTrue(event.get("importance_score").getAsInt()
                    >= PlayerReportEventCandidatePool.IMPORTANT_THRESHOLD);
            JsonObject jump = event.getAsJsonObject("jump_target");
            assertTrue(jump.get("range_end").getAsInt()
                    > jump.get("range_start").getAsInt());
        }
    }

    @Test
    void mergesDeathTeleportAndCombatInsightFromTheSameFight() {
        JsonObject modules = completeEventModules();
        List<JsonObject> existing = new ArrayList<>();
        existing.add(existingCombatInsight());

        PlayerReportEventCandidatePool.Result result = PlayerReportEventCandidatePool.build(
                modules, existing, new JsonObject(), 0, 4, 88);

        JsonObject fightMoment = null;
        for (JsonElement element : result.importantEvents()) {
            JsonObject event = element.getAsJsonObject();
            if ("fight:event-1".equals(event.get("dedupe_key").getAsString())) {
                fightMoment = event;
                break;
            }
        }

        assertTrue(fightMoment != null);
        Set<String> related = stringSet(fightMoment.getAsJsonArray("related_event_types"), null);
        assertTrue(related.containsAll(Set.of("combat", "death", "teleport")));
        assertTrue(fightMoment.getAsJsonArray("source_candidate_ids").size() >= 3);
        int matchingFightMoments = 0;
        for (JsonElement element : result.importantEvents()) {
            if ("fight:event-1".equals(
                    element.getAsJsonObject().get("dedupe_key").getAsString())) {
                matchingFightMoments++;
            }
        }
        assertEquals(1, matchingFightMoments);
    }

    @Test
    void teamContextDoesNotBecomePersonalCriticism() {
        JsonObject modules = completeEventModules();
        modules.getAsJsonObject("combat").getAsJsonArray("fights").get(0)
                .getAsJsonObject().getAsJsonArray("contributions").get(0)
                .getAsJsonObject().getAsJsonObject("responsibility_gate")
                .addProperty("status", "insufficient_evidence");
        modules.getAsJsonObject("combat").getAsJsonArray("fights").get(0)
                .getAsJsonObject().getAsJsonArray("contributions").get(0)
                .getAsJsonObject().addProperty("status", "insufficient_evidence");
        modules.getAsJsonObject("map").getAsJsonArray("objectives").get(0)
                .getAsJsonObject().remove("playerSlot");

        PlayerReportEventCandidatePool.Result result = PlayerReportEventCandidatePool.build(
                modules, new ArrayList<>(), new JsonObject(), 0, 4, 88);

        for (JsonObject insight : result.generatedInsights()) {
            if (!"improvement".equals(insight.get("kind").getAsString())) continue;
            assertFalse(Set.of("death", "objective").contains(
                    insight.get("event_type").getAsString()));
        }
    }

    @Test
    void generatedPraiseAndCriticismAlwaysHaveBoundedMapReviewTargets() {
        PlayerReportEventCandidatePool.Result result = PlayerReportEventCandidatePool.build(
                completeEventModules(), new ArrayList<>(), new JsonObject(), 0, 4, 88);

        assertFalse(result.generatedInsights().isEmpty());
        for (JsonObject insight : result.generatedInsights()) {
            JsonObject jump = insight.getAsJsonObject("jump_target");
            assertTrue(insight.get("ordinary_eligible").getAsBoolean());
            assertTrue(jump.get("range_end").getAsInt() > jump.get("range_start").getAsInt());
            JsonObject focus = jump.getAsJsonObject("map_focus");
            assertTrue(focus != null && (focus.has("region")
                    || focus.get("coordinate_valid").getAsBoolean()));
        }
    }

    @Test
    void keepsUnlocatedFactsInTheCandidatePoolButNotInImportantMoments() {
        JsonObject modules = completeEventModules();
        JsonObject ward = modules.getAsJsonObject("vision").getAsJsonArray("wards")
                .get(0).getAsJsonObject();
        ward.remove("region");
        ward.remove("x");
        ward.remove("y");
        ward.remove("coordinate_valid");

        PlayerReportEventCandidatePool.Result result = PlayerReportEventCandidatePool.build(
                modules, new ArrayList<>(), new JsonObject(), 0, 4, 88);

        JsonObject wardCandidate = null;
        for (JsonElement element : result.candidates()) {
            JsonObject candidate = element.getAsJsonObject();
            if ("ward".equals(candidate.get("event_type").getAsString())) {
                wardCandidate = candidate;
                break;
            }
        }
        assertTrue(wardCandidate != null);
        assertTrue(wardCandidate.get("importance_score").getAsInt()
                < PlayerReportEventCandidatePool.IMPORTANT_THRESHOLD);
        for (JsonElement element : result.importantEvents()) {
            assertFalse("ward:ward-1".equals(
                    element.getAsJsonObject().get("dedupe_key").getAsString()));
        }
    }

    @Test
    void keepsContextOnlyWardDeathAndTeleportOutOfImportantMoments() {
        JsonObject modules = completeEventModules();
        JsonObject ward = modules.getAsJsonObject("vision").getAsJsonArray("wards")
                .get(0).getAsJsonObject();
        ward.addProperty("score", 40);
        ward.addProperty("detections", 0);
        ward.addProperty("uniqueEnemies", 0);
        ward.addProperty("conversions", 0);

        JsonObject fight = modules.getAsJsonObject("combat").getAsJsonArray("fights")
                .get(0).getAsJsonObject();
        fight.getAsJsonArray("contributions").get(0).getAsJsonObject()
                .getAsJsonObject("responsibility_gate")
                .addProperty("status", "insufficient_evidence");
        JsonObject teleport = fight.getAsJsonArray("support_events").get(0).getAsJsonObject();
        teleport.addProperty("support", false);
        teleport.addProperty("outcome", "unknown");

        PlayerReportEventCandidatePool.Result result = PlayerReportEventCandidatePool.build(
                modules, new ArrayList<>(), new JsonObject(), 0, 4, 88);

        for (JsonElement element : result.candidates()) {
            JsonObject candidate = element.getAsJsonObject();
            if (!Set.of("ward", "death", "teleport").contains(
                    candidate.get("event_type").getAsString())) {
                continue;
            }
            assertTrue(candidate.get("importance_score").getAsInt()
                    < PlayerReportEventCandidatePool.IMPORTANT_THRESHOLD);
            assertFalse(candidate.get("selected").getAsBoolean());
        }
    }

    @Test
    void skipsNullSnapshotCoordinatesAndUsesTheNearestValidLocation() {
        JsonObject modules = completeEventModules();
        JsonObject snapshots = modules.getAsJsonObject("snapshots");
        JsonArray rows = snapshots.getAsJsonObject("by_slot").getAsJsonArray("0");
        JsonArray nullRow = rows.get(0).getAsJsonArray();
        List<String> fields = new ArrayList<>();
        for (JsonElement field : snapshots.getAsJsonArray("fields")) {
            fields.add(field.getAsString());
        }
        nullRow.set(fields.indexOf("x"), JsonNull.INSTANCE);
        nullRow.set(fields.indexOf("y"), JsonNull.INSTANCE);
        nullRow.set(fields.indexOf("region"), JsonNull.INSTANCE);
        rows.add(snapshotRow(650, 46, 52, 0));

        PlayerReportEventCandidatePool.Result result = PlayerReportEventCandidatePool.build(
                modules, new ArrayList<>(), new JsonObject(), 0, 4, 88);

        JsonObject purchase = null;
        for (JsonElement element : result.candidates()) {
            JsonObject candidate = element.getAsJsonObject();
            if ("purchase".equals(candidate.get("event_type").getAsString())) {
                purchase = candidate;
                break;
            }
        }
        assertTrue(purchase != null);
        JsonObject focus = purchase.getAsJsonObject("jump_target")
                .getAsJsonObject("map_focus");
        assertEquals(46, focus.get("x").getAsDouble(), 0.01);
        assertEquals(52, focus.get("y").getAsDouble(), 0.01);
        assertTrue(purchase.get("selected").getAsBoolean());
    }

    @Test
    void mergedImportantMomentUsesTheLocalizedCandidateAsItsPrimaryStory() {
        JsonObject modules = completeEventModules();
        JsonObject playerBuild = modules.getAsJsonObject("build").getAsJsonObject("by_slot")
                .getAsJsonObject("0");
        JsonObject delivery = timed("item_delivery", 710);
        delivery.addProperty("id", "delivery-purchase-0-640-blink-640");
        delivery.addProperty("purchase_id", "purchase-0-640-blink-640");
        delivery.addProperty("key", "blink");
        delivery.addProperty("purchased_at", 640);
        delivery.addProperty("first_usable_at", 710);
        delivery.addProperty("total_to_usable_seconds", 70);
        delivery.addProperty("delivery_mode", "courier_delivery_inferred");
        delivery.addProperty("confidence", 88);
        JsonArray deliveries = new JsonArray();
        deliveries.add(delivery);
        playerBuild.add("item_delivery_lifecycles", deliveries);

        PlayerReportEventCandidatePool.Result result = PlayerReportEventCandidatePool.build(
                modules, new ArrayList<>(), new JsonObject(), 0, 4, 88);

        JsonObject purchaseMoment = null;
        for (JsonElement element : result.importantEvents()) {
            JsonObject moment = element.getAsJsonObject();
            if ("purchase:purchase-0-640-blink-640".equals(
                    moment.get("dedupe_key").getAsString())) {
                purchaseMoment = moment;
                break;
            }
        }

        assertTrue(purchaseMoment != null);
        JsonObject jump = purchaseMoment.getAsJsonObject("jump_target");
        assertTrue(PlayerReportLocalization.ordinaryEligible(jump));
        assertTrue(jump.getAsJsonObject("map_focus").get("coordinate_valid").getAsBoolean());
        assertEquals("purchase", purchaseMoment.get("event_type").getAsString());
    }

    @Test
    void mergesOneWardWindowAndOneHighGroundPushIntoRepresentativeMoments() {
        JsonObject modules = completeEventModules();
        JsonObject secondWard = positioned("ward-2", 520, 48, 56, "river");
        secondWard.addProperty("playerSlot", 0);
        secondWard.addProperty("placedAt", 520);
        secondWard.addProperty("endedAt", 880);
        secondWard.addProperty("type", "observer");
        secondWard.addProperty("detections", 8);
        secondWard.addProperty("uniqueEnemies", 3);
        secondWard.addProperty("conversions", 1);
        secondWard.addProperty("score", 90);
        modules.getAsJsonObject("vision").getAsJsonArray("wards").add(secondWard);

        JsonArray objectives = modules.getAsJsonObject("map").getAsJsonArray("objectives");
        JsonObject tower = positioned("objective-hg-tower", 1400, 18, 76, "radiant_base");
        tower.addProperty("kind", "building");
        tower.addProperty("target", "npc_dota_goodguys_tower3_mid");
        objectives.add(tower);
        JsonObject barracks = positioned("objective-hg-rax", 1450, 17, 78, "radiant_base");
        barracks.addProperty("kind", "building");
        barracks.addProperty("target", "npc_dota_goodguys_melee_rax_mid");
        objectives.add(barracks);

        PlayerReportEventCandidatePool.Result result = PlayerReportEventCandidatePool.build(
                modules, new ArrayList<>(), new JsonObject(), 0, 4, 88);

        JsonObject wardMoment = null;
        JsonObject highGroundMoment = null;
        for (JsonElement element : result.importantEvents()) {
            JsonObject moment = element.getAsJsonObject();
            String key = moment.get("dedupe_key").getAsString();
            if (key.startsWith("ward-window:0:1")) wardMoment = moment;
            if (key.startsWith("objective:highground:radiant:")) highGroundMoment = moment;
        }
        assertTrue(wardMoment != null);
        assertEquals(2, wardMoment.getAsJsonArray("source_candidate_ids").size());
        assertTrue(highGroundMoment != null);
        assertEquals(2, highGroundMoment.getAsJsonArray("source_candidate_ids").size());
    }

    @Test
    void keepsCourierEventsAsFactsWithoutPromotingThemToKeyMoments() {
        JsonObject modules = completeEventModules();
        JsonObject courier = positioned("objective-courier", 300, 40, 60, "mid_lane");
        courier.addProperty("kind", "courier");
        courier.addProperty("playerSlot", 0);
        modules.getAsJsonObject("map").getAsJsonArray("objectives").add(courier);

        PlayerReportEventCandidatePool.Result result = PlayerReportEventCandidatePool.build(
                modules, new ArrayList<>(), new JsonObject(), 0, 4, 88);

        JsonObject candidate = null;
        for (JsonElement element : result.candidates()) {
            JsonObject row = element.getAsJsonObject();
            if ("candidate:objective:objective-courier".equals(row.get("id").getAsString())) {
                candidate = row;
                break;
            }
        }
        assertTrue(candidate != null);
        assertTrue(candidate.get("importance_score").getAsInt()
                < PlayerReportEventCandidatePool.IMPORTANT_THRESHOLD);
        assertFalse(candidate.get("selected").getAsBoolean());
    }

    @Test
    void addsAuditableLaneDeliveryRuneSupportPullAndLevelTimingCandidates() {
        JsonObject modules = completeEventModules();
        modules.add("farm", tempoFarm());
        modules.add("laning", tempoLaning());
        JsonObject playerBuild = modules.getAsJsonObject("build").getAsJsonObject("by_slot")
                .getAsJsonObject("0");
        JsonArray deliveries = new JsonArray();
        JsonObject delivery = positioned("delivery-0-640-blink", 710, 46, 52, "mid_lane");
        delivery.addProperty("purchase_id", "purchase-0-640-blink-0");
        delivery.addProperty("key", "blink");
        delivery.addProperty("purchased_at", 640);
        delivery.addProperty("first_stash_at", 640);
        delivery.addProperty("first_carried_at", 700);
        delivery.addProperty("first_usable_at", 710);
        delivery.addProperty("stash_to_carried_seconds", 60);
        delivery.addProperty("carried_to_usable_seconds", 10);
        delivery.addProperty("total_to_usable_seconds", 70);
        delivery.addProperty("delivery_mode", "courier_delivery_inferred");
        delivery.addProperty("courier_delivery_inferred", true);
        delivery.addProperty("confidence", 88);
        deliveries.add(delivery);
        playerBuild.add("item_delivery_lifecycles", deliveries);

        PlayerReportEventCandidatePool.Result result = PlayerReportEventCandidatePool.build(
                modules, new ArrayList<>(), new JsonObject(), 0, 4, 88);

        Set<String> types = stringSet(result.candidates(), "event_type");
        assertTrue(types.containsAll(Set.of(
                "lane_pressure", "item_delivery", "rune_control",
                "support_route", "suspected_pull", "level_spike")));
        JsonObject deliveryCandidate = null;
        for (JsonElement element : result.candidates()) {
            JsonObject row = element.getAsJsonObject();
            if (!Set.of("lane_pressure", "item_delivery", "rune_control",
                    "support_route", "suspected_pull", "level_spike")
                    .contains(row.get("event_type").getAsString())) {
                continue;
            }
            JsonObject jump = row.getAsJsonObject("jump_target");
            assertTrue(jump.get("range_end").getAsInt()
                    > jump.get("range_start").getAsInt());
            assertTrue(jump.has("map_focus"));
            if ("item_delivery".equals(row.get("event_type").getAsString())) {
                deliveryCandidate = row;
            }
        }
        assertTrue(deliveryCandidate != null);
        assertEquals("item_delivery", deliveryCandidate.getAsJsonObject("jump_target")
                .get("entity_type").getAsString());
        assertEquals("purchase-0-640-blink-0", deliveryCandidate.getAsJsonObject("jump_target")
                .get("entity_id").getAsString());
        assertTrue(result.generatedInsights().stream().anyMatch(insight ->
                "item_delivery".equals(insight.get("event_type").getAsString())
                        && "improvement".equals(insight.get("kind").getAsString())));
    }

    private static JsonObject completeEventModules() {
        JsonObject modules = new JsonObject();
        modules.add("vision", vision());
        modules.add("build", build());
        modules.add("timeline", timeline());
        modules.add("map", map());
        modules.add("objectives", objectives());
        modules.add("combat", combat());
        modules.add("snapshots", snapshots());
        return modules;
    }

    private static JsonObject tempoFarm() {
        JsonObject farm = new JsonObject();

        JsonArray laneSpatial = new JsonArray();
        JsonObject lane = positioned("lane-space-mid-10", 325, 38, 54, "mid_lane");
        lane.addProperty("lane", "mid");
        lane.addProperty("wave_index", 10);
        lane.addProperty("meeting_time", 325);
        lane.addProperty("lane_progress_pct", 38);
        lane.addProperty("radiant_push_depth", -24);
        lane.addProperty("dire_push_depth", 24);
        JsonObject towerZone = new JsonObject();
        towerZone.addProperty("inside", true);
        towerZone.addProperty("tower_key", "npc_dota_goodguys_tower1_mid");
        towerZone.addProperty("distance_pct", 1.2);
        lane.add("radiant_tower_zone", towerZone);
        laneSpatial.add(lane);
        farm.add("lane_spatial_windows", laneSpatial);

        JsonObject runesBySlot = new JsonObject();
        JsonArray runes = new JsonArray();
        JsonObject rune = positioned("rune-0-360-5", 360, 42, 48, "river");
        rune.addProperty("rune_type", "bounty");
        rune.addProperty("direct_gold", 40);
        rune.addProperty("observed_xp_delta", 0);
        rune.addProperty("event_evidence", "chat_event_exact");
        rune.addProperty("confidence", 96);
        runes.add(rune);
        runesBySlot.add("0", runes);
        farm.add("rune_opportunities_by_slot", runesBySlot);

        JsonObject awayBySlot = new JsonObject();
        JsonArray awayRows = new JsonArray();
        JsonObject away = positioned("support-away-0-350", 350, 42, 48, "river");
        away.addProperty("start", 340);
        away.addProperty("end", 380);
        away.addProperty("outcome", "productive");
        away.addProperty("runes", 1);
        away.addProperty("wards", 1);
        away.addProperty("stacks", 0);
        away.addProperty("core_deaths", 0);
        away.addProperty("core_solo_xp", 220);
        away.addProperty("confidence", 86);
        awayRows.add(away);
        awayBySlot.add("0", awayRows);
        farm.add("support_away_windows_by_slot", awayBySlot);

        JsonObject pullsBySlot = new JsonObject();
        JsonArray pulls = new JsonArray();
        JsonObject pull = positioned("suspected-pull-0-75", 75, 28, 35, "radiant_jungle");
        pull.addProperty("classification", "suspected");
        pull.addProperty("confirmed", false);
        pull.addProperty("lane", "mid");
        pull.addProperty("lane_creep_count", 3);
        pull.addProperty("neutral_present", true);
        pull.addProperty("confidence", 82);
        pulls.add(pull);
        pullsBySlot.add("0", pulls);
        farm.add("suspected_pulls_by_slot", pullsBySlot);

        JsonObject levelsBySlot = new JsonObject();
        JsonArray levels = new JsonArray();
        JsonObject level = positioned("level-spike-0-180-6", 180, 40, 52, "mid_lane");
        level.addProperty("start", 180);
        level.addProperty("end", 225);
        level.addProperty("level", 6);
        level.addProperty("outcome", "used");
        level.addProperty("hero_damage", 620);
        level.addProperty("kill_assists", 1);
        level.addProperty("last_hits", 8);
        level.addProperty("opportunity_gate", true);
        level.addProperty("confidence", 84);
        levels.add(level);
        levelsBySlot.add("0", levels);
        farm.add("level_spike_windows_by_slot", levelsBySlot);
        return farm;
    }

    private static JsonObject tempoLaning() {
        JsonObject laning = new JsonObject();
        JsonObject positions = new JsonObject();
        JsonObject slot = new JsonObject();
        slot.addProperty("slot", 0);
        slot.addProperty("position", 4);
        slot.addProperty("lane", "mid");
        slot.addProperty("confidence", 88);
        positions.add("0", slot);
        laning.add("positions_by_slot", positions);
        return laning;
    }

    private static JsonObject vision() {
        JsonObject vision = new JsonObject();
        JsonArray wards = new JsonArray();
        JsonObject ward = positioned("ward-1", 420, 43, 52, "river");
        ward.addProperty("playerSlot", 0);
        ward.addProperty("placedAt", 420);
        ward.addProperty("endedAt", 780);
        ward.addProperty("duration", 360);
        ward.addProperty("type", "observer");
        ward.addProperty("purpose", "offense");
        ward.addProperty("detections", 9);
        ward.addProperty("uniqueEnemies", 3);
        ward.addProperty("conversions", 1);
        ward.addProperty("score", 92);
        ward.addProperty("endReason", "expired");
        wards.add(ward);
        vision.add("wards", wards);
        return vision;
    }

    private static JsonObject build() {
        JsonObject build = new JsonObject();
        JsonObject bySlot = new JsonObject();
        JsonObject player = new JsonObject();
        JsonArray purchases = new JsonArray();
        JsonObject purchase = timed("purchase", 640);
        purchase.addProperty("key", "blink");
        purchase.addProperty("actor_slot", 0);
        purchases.add(purchase);
        player.add("purchases", purchases);
        bySlot.add("0", player);
        build.add("by_slot", bySlot);
        return build;
    }

    private static JsonObject timeline() {
        JsonObject timeline = new JsonObject();
        JsonArray events = new JsonArray();
        JsonObject death = timed("hero_death", 905);
        death.addProperty("id", "timeline-death-1");
        death.addProperty("actor_slot", 5);
        death.addProperty("target_slot", 0);
        events.add(death);
        timeline.add("events", events);
        return timeline;
    }

    private static JsonObject map() {
        JsonObject map = new JsonObject();
        JsonArray objectives = new JsonArray();
        JsonObject objective = positioned("objective-1", 1120, 72, 77, "river");
        objective.addProperty("kind", "tower");
        objective.addProperty("playerSlot", 0);
        objective.addProperty("attackerTeam", 2);
        objectives.add(objective);
        map.add("objectives", objectives);
        return map;
    }

    private static JsonObject objectives() {
        JsonObject objectives = new JsonObject();
        JsonArray attempts = new JsonArray();
        JsonObject attempt = positioned("roshan-attempt-1", 1280, 73, 77, "river");
        attempt.addProperty("start", 1260);
        attempt.addProperty("end", 1280);
        attempt.addProperty("classification", "contested_roshan");
        attempt.addProperty("completed", true);
        attempt.addProperty("kill_team", 2);
        attempt.addProperty("killer_slot", 0);
        JsonArray participants = new JsonArray();
        participants.add(0);
        participants.add(1);
        participants.add(5);
        attempt.add("participants", participants);
        attempts.add(attempt);
        objectives.add("roshan_attempts", attempts);
        return objectives;
    }

    private static JsonObject combat() {
        JsonObject combat = new JsonObject();
        JsonArray fights = new JsonArray();
        JsonObject fight = positioned("event-1", 900, 55, 47, "mid_lane");
        fight.addProperty("start", 890);
        fight.addProperty("review_start", 880);
        fight.addProperty("contact_start", 900);
        fight.addProperty("contact_end", 920);
        fight.addProperty("end", 925);
        fight.addProperty("kind", "teamfight");
        JsonObject importance = new JsonObject();
        importance.addProperty("score", 84);
        importance.addProperty("tier", "critical");
        importance.addProperty("important", true);
        fight.add("importance", importance);
        JsonArray participants = new JsonArray();
        participants.add(0);
        participants.add(1);
        participants.add(5);
        participants.add(6);
        fight.add("participants", participants);

        JsonArray contributions = new JsonArray();
        JsonObject contribution = new JsonObject();
        contribution.addProperty("slot", 0);
        contribution.addProperty("responsibilityScore", 38);
        contribution.addProperty("presencePct", 100);
        contribution.addProperty("status", "passed");
        contribution.addProperty("confidence", 88);
        JsonObject gate = new JsonObject();
        gate.addProperty("status", "passed");
        contribution.add("responsibility_gate", gate);
        contributions.add(contribution);
        fight.add("contributions", contributions);

        JsonArray supportEvents = new JsonArray();
        JsonObject teleport = positioned(null, 898, 54, 46, "mid_lane");
        teleport.addProperty("kind", "tp_support");
        teleport.addProperty("actor_slot", 0);
        teleport.addProperty("cast_start", 894);
        teleport.addProperty("cast_start_ms", 894_000);
        teleport.addProperty("completed_at", 898);
        teleport.addProperty("support", true);
        teleport.addProperty("status", "completed_support");
        teleport.addProperty("outcome", "saved_ally");
        teleport.addProperty("response_delay", 4);
        supportEvents.add(teleport);
        fight.add("support_events", supportEvents);
        fights.add(fight);
        combat.add("fights", fights);
        return combat;
    }

    private static JsonObject snapshots() {
        JsonObject snapshots = new JsonObject();
        snapshots.addProperty("schema", "snapshot-columns/1.1");
        JsonArray fields = new JsonArray();
        for (String field : AnalysisStorage.SNAPSHOT_FIELDS) fields.add(field);
        snapshots.add("fields", fields);
        JsonArray regions = new JsonArray();
        regions.add("river");
        regions.add("mid_lane");
        snapshots.add("regions", regions);
        JsonObject bySlot = new JsonObject();
        JsonArray rows = new JsonArray();
        rows.add(snapshotRow(640, 45, 51, 0));
        rows.add(snapshotRow(905, 55, 47, 1));
        rows.add(snapshotRow(1120, 72, 77, 0));
        bySlot.add("0", rows);
        snapshots.add("by_slot", bySlot);
        return snapshots;
    }

    private static JsonArray snapshotRow(int second, double x, double y, int regionId) {
        JsonArray row = new JsonArray();
        for (String field : AnalysisStorage.SNAPSHOT_FIELDS) {
            switch (field) {
                case "second" -> row.add(second);
                case "x" -> row.add(x);
                case "y" -> row.add(y);
                case "region" -> row.add(regionId);
                default -> row.add(0);
            }
        }
        return row;
    }

    private static JsonObject existingLaneInsight() {
        JsonObject insight = new JsonObject();
        insight.addProperty("id", "insight:lane:0:600");
        insight.addProperty("kind", "strength");
        insight.addProperty("category", "lane_execution");
        insight.addProperty("severity", "positive");
        insight.addProperty("confidence", 88);
        insight.addProperty("time_start", 600);
        insight.addProperty("time_end", 620);
        insight.addProperty("location", "上路");
        insight.addProperty("title", "对线压制转化稳定");
        insight.addProperty("fact", "10 分钟补刀与经验均领先。");
        insight.addProperty("impact", "保留了先动和控线权。");
        insight.addProperty("action", "继续在兵线安全时扩大领先。");
        insight.addProperty("ordinary_eligible", true);
        insight.add("evidence_refs", strings("lane:0:600"));
        insight.add("jump_target", jump("development", "lane_checkpoint",
                "lane:0:600", 0, 600, 580, 620, 38, 24, "top_lane"));
        return insight;
    }

    private static JsonObject existingCombatInsight() {
        JsonObject insight = new JsonObject();
        insight.addProperty("id", "advice:event-1:0");
        insight.addProperty("kind", "improvement");
        insight.addProperty("category", "combat_duty");
        insight.addProperty("severity", "high");
        insight.addProperty("confidence", 88);
        insight.addProperty("time_start", 900);
        insight.addProperty("time_end", 920);
        insight.addProperty("location", "中路");
        insight.addProperty("title", "关键团战职责完成不足");
        insight.addProperty("fact", "本场关键团战职责分偏低。");
        insight.addProperty("impact", "队伍第一轮技能衔接不完整。");
        insight.addProperty("action", "接战前先确认队友距离。");
        insight.addProperty("ordinary_eligible", true);
        insight.add("evidence_refs", strings("combat:event-1:0"));
        insight.add("jump_target", jump("combat", "fight", "event-1",
                0, 900, 880, 925, 55, 47, "mid_lane"));
        return insight;
    }

    private static JsonObject timed(String kind, int time) {
        JsonObject row = new JsonObject();
        row.addProperty("kind", kind);
        row.addProperty("time", time);
        row.addProperty("game_time_ms", time * 1000L);
        row.addProperty("event_seq", time);
        return row;
    }

    private static JsonObject positioned(String id, int time, double x, double y,
            String region) {
        JsonObject row = timed("event", time);
        if (id != null) row.addProperty("id", id);
        row.addProperty("x", x);
        row.addProperty("y", y);
        row.addProperty("region", region);
        row.addProperty("coordinate_valid", true);
        row.addProperty("coordinate_space", "map_percent");
        row.addProperty("coordinate_source", "fixture");
        row.addProperty("coordinate_version", "fixture/1.0");
        row.addProperty("location_confidence", 92);
        return row;
    }

    private static JsonObject jump(String module, String entityType, String entityId,
            int slot, int time, int start, int end, double x, double y, String region) {
        JsonObject jump = new JsonObject();
        jump.addProperty("module", module);
        jump.addProperty("entity_type", entityType);
        jump.addProperty("entity_id", entityId);
        jump.addProperty("player_slot", slot);
        jump.addProperty("time", time);
        jump.addProperty("range_start", start);
        jump.addProperty("range_end", end);
        jump.addProperty("location_level", "L3");
        JsonObject focus = positioned(null, time, x, y, region);
        focus.remove("kind");
        focus.remove("time");
        focus.remove("game_time_ms");
        focus.remove("event_seq");
        jump.add("map_focus", focus);
        return jump;
    }

    private static JsonArray strings(String... values) {
        JsonArray rows = new JsonArray();
        for (String value : values) rows.add(value);
        return rows;
    }

    private static Set<String> stringSet(JsonArray rows, String key) {
        Set<String> values = new HashSet<>();
        for (JsonElement element : rows) {
            if (key == null) values.add(element.getAsString());
            else values.add(element.getAsJsonObject().get(key).getAsString());
        }
        return values;
    }

    private static Set<String> relatedTypes(JsonArray events) {
        Set<String> values = new HashSet<>();
        for (JsonElement element : events) {
            values.addAll(stringSet(
                    element.getAsJsonObject().getAsJsonArray("related_event_types"), null));
        }
        return values;
    }

    private static int countSelected(JsonArray candidates) {
        int count = 0;
        for (JsonElement element : candidates) {
            if (element.getAsJsonObject().get("selected").getAsBoolean()) count++;
        }
        return count;
    }
}
