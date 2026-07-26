package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

class PlayerCombatTimingAnalysisTest {
    @Test
    void recordsSpatialArrivalAfterTheTeamEngages() {
        JsonObject result = PlayerCombatTimingAnalysis.analyze(
                timingModules(false), 5, 4, 92, 1800);

        JsonObject fact = result.getAsJsonArray("fight_facts").get(0).getAsJsonObject();
        assertEquals("player-combat-timing/1.0", result.get("model").getAsString());
        assertEquals(100, fact.get("team_engage_time").getAsInt());
        assertEquals(109, fact.get("player_spatial_arrival_time").getAsInt());
        assertEquals(9, fact.get("arrival_delta_seconds").getAsInt());
    }

    @Test
    void remoteDamageDoesNotPretendThePlayerHasSpatiallyArrived() {
        JsonObject result = PlayerCombatTimingAnalysis.analyze(
                timingModules(true), 5, 4, 92, 1800);

        JsonObject fact = result.getAsJsonArray("fight_facts").get(0).getAsJsonObject();
        assertEquals(101, fact.get("first_combat_action_time").getAsInt());
        assertEquals(109, fact.get("player_spatial_arrival_time").getAsInt());
        assertEquals(9, fact.get("arrival_delta_seconds").getAsInt());
    }

    @Test
    void marksAReachableLatePlayerAsMissingTheFirstRotation() {
        JsonObject result = PlayerCombatTimingAnalysis.analyze(
                timingModules(true), 5, 4, 92, 1800);

        JsonObject fact = result.getAsJsonArray("fight_facts").get(0).getAsJsonObject();
        assertEquals(106, fact.get("first_rotation_end").getAsInt());
        assertTrue(fact.get("missed_first_rotation").getAsBoolean());
        assertEquals("phase_plus_actions", fact.get("first_rotation_evidence").getAsString());
        assertEquals("reachable", fact.get("join_feasibility").getAsString());
        assertEquals("follow_initiation", fact.get("role_expectation").getAsString());
        assertTrue(fact.get("negative_eligible").getAsBoolean());
        assertTrue(fact.get("confidence").getAsInt() >= 78);
    }

    @Test
    void suppressesTimingCriticismWhenThePlayerIsDead() {
        JsonObject modules = timingModules(false);
        JsonArray rows = modules.getAsJsonObject("snapshots")
                .getAsJsonObject("by_slot").getAsJsonArray("5");
        for (int index = 0; index < rows.size(); index++) {
            rows.get(index).getAsJsonArray().set(4, new com.google.gson.JsonPrimitive(2));
        }

        JsonObject fact = PlayerCombatTimingAnalysis.analyze(
                modules, 5, 4, 92, 1800)
                .getAsJsonArray("fight_facts").get(0).getAsJsonObject();

        assertEquals("dead", fact.get("join_feasibility").getAsString());
        assertFalse(fact.get("negative_eligible").getAsBoolean());
        assertTrue(fact.getAsJsonArray("suppressed_reasons").contains(
                new com.google.gson.JsonPrimitive("player_dead")));
    }

    @Test
    void suppressesTimingCriticismWhenCoordinatesOrRoleAreUnreliable() {
        JsonObject modules = timingModules(false);
        JsonObject fight = modules.getAsJsonObject("combat")
                .getAsJsonArray("fights").get(0).getAsJsonObject();
        fight.addProperty("coordinate_valid", false);
        fight.getAsJsonArray("phases").get(0).getAsJsonObject()
                .addProperty("coordinate_valid", false);

        JsonObject coordinateFact = PlayerCombatTimingAnalysis.analyze(
                modules, 5, 4, 92, 1800)
                .getAsJsonArray("fight_facts").get(0).getAsJsonObject();
        assertEquals("insufficient_evidence",
                coordinateFact.get("join_feasibility").getAsString());
        assertFalse(coordinateFact.get("negative_eligible").getAsBoolean());

        JsonObject roleFact = PlayerCombatTimingAnalysis.analyze(
                timingModules(false), 5, 4, 40, 1800)
                .getAsJsonArray("fight_facts").get(0).getAsJsonObject();
        assertEquals("insufficient_evidence",
                roleFact.get("join_feasibility").getAsString());
        assertFalse(roleFact.get("negative_eligible").getAsBoolean());
    }

    @Test
    void suppressesTimingCriticismWhenThePlayerCouldNotReachTheFirstRotation() {
        JsonObject modules = timingModules(false);
        JsonArray rows = modules.getAsJsonObject("snapshots")
                .getAsJsonObject("by_slot").getAsJsonArray("5");
        for (int index = 0; index < rows.size(); index++) {
            JsonArray row = rows.get(index).getAsJsonArray();
            row.set(1, new com.google.gson.JsonPrimitive(95.0));
            row.set(2, new com.google.gson.JsonPrimitive(95.0));
        }

        JsonObject fact = PlayerCombatTimingAnalysis.analyze(
                modules, 5, 4, 92, 1800)
                .getAsJsonArray("fight_facts").get(0).getAsJsonObject();

        assertEquals("unreachable", fact.get("join_feasibility").getAsString());
        assertFalse(fact.get("negative_eligible").getAsBoolean());
        assertTrue(fact.get("expected_arrival_seconds").getAsInt() > 16);
    }

    @Test
    void aggregatesTwoConsecutiveLateFightsIntoOneOrdinaryPattern() {
        JsonObject modules = patternModules();
        appendFightWindow(modules, "fight-1", 100, 9, "routine", "mid_lane", true);
        appendFightWindow(modules, "fight-2", 200, 11, "routine", "river", false);

        JsonObject result = PlayerCombatTimingAnalysis.analyze(
                modules, 5, 4, 92, 1800);
        JsonObject pattern = findPattern(result, "late_arrival_sequence");

        assertNotNull(pattern);
        assertEquals(2, pattern.getAsJsonArray("occurrences").size());
        assertTrue(pattern.get("ordinary_eligible").getAsBoolean());
        assertTrue(pattern.get("what_happened").getAsString().contains("连续两次"));
        assertTrue(pattern.get("what_happened").getAsString().contains("9 秒"));
        assertTrue(pattern.get("what_happened").getAsString().contains("11 秒"));
        assertEquals("fight-1", pattern.getAsJsonObject("jump_target")
                .get("entity_id").getAsString());
        JsonObject missedRotation = findPattern(result, "missed_first_rotation_sequence");
        assertNotNull(missedRotation);
        assertFalse(missedRotation.get("ordinary_eligible").getAsBoolean());
        assertEquals(pattern.get("id").getAsString(),
                missedRotation.get("linked_pattern_id").getAsString());
    }

    @Test
    void doesNotCallSeparatedLateFightsConsecutiveWhenAnOnTimeFightOccursBetweenThem() {
        JsonObject modules = patternModules();
        appendFightWindow(modules, "fight-1", 100, 9, "routine", "mid_lane", true);
        appendFightWindow(modules, "fight-on-time", 150, 1, "routine", "river", false);
        appendFightWindow(modules, "fight-2", 200, 11, "routine", "mid_lane", false);

        JsonObject result = PlayerCombatTimingAnalysis.analyze(
                modules, 5, 4, 92, 1800);

        assertNull(findPattern(result, "late_arrival_sequence"));
    }

    @Test
    void keepsOneRoutineLateFightOutOfOrdinaryMode() {
        JsonObject modules = patternModules();
        appendFightWindow(modules, "fight-routine", 100, 9, "routine", "mid_lane", true);

        JsonObject pattern = findPattern(
                PlayerCombatTimingAnalysis.analyze(modules, 5, 4, 92, 1800),
                "late_arrival_observation");

        assertNotNull(pattern);
        assertFalse(pattern.get("ordinary_eligible").getAsBoolean());
    }

    @Test
    void admitsOneCriticalRoshanTimingFailureUnderRuleB() {
        JsonObject modules = patternModules();
        appendFightWindow(modules, "fight-roshan", 100, 9, "critical", "roshan_pit", true);

        JsonObject pattern = findPattern(
                PlayerCombatTimingAnalysis.analyze(modules, 5, 4, 96, 1800),
                "critical_late_arrival");

        assertNotNull(pattern);
        assertTrue(pattern.get("ordinary_eligible").getAsBoolean());
        assertTrue(pattern.get("title").getAsString().contains("关键时机"));
        assertFalse(pattern.get("title").getAsString().contains("连续"));
        assertFalse(pattern.get("title").getAsString().contains("习惯"));
    }

    @Test
    void usesARealBlinkPurchaseForTheFiveMinuteActivationAction() {
        JsonObject modules = patternModules();
        appendFightWindow(modules, "fight-1", 100, 9, "routine", "mid_lane", true);
        appendFightWindow(modules, "fight-2", 200, 11, "routine", "river", false);
        JsonObject bySlot = modules.getAsJsonObject("build").getAsJsonObject("by_slot");
        JsonObject player = new JsonObject();
        JsonArray purchases = new JsonArray();
        JsonObject blink = new JsonObject();
        blink.addProperty("key", "blink");
        blink.addProperty("time", 95);
        purchases.add(blink);
        player.add("purchases", purchases);
        bySlot.add("5", player);

        JsonObject pattern = findPattern(
                PlayerCombatTimingAnalysis.analyze(modules, 5, 4, 92, 1800),
                "late_arrival_sequence");

        assertNotNull(pattern);
        assertEquals("blink", pattern.getAsJsonObject("item_context").get("key").getAsString());
        assertTrue(pattern.get("next_action").getAsString().contains("闪烁匕首"));
        assertEquals(395, pattern.getAsJsonObject("item_context").get("window_end").getAsInt());
        JsonObject activationGap = findPattern(
                PlayerCombatTimingAnalysis.analyze(modules, 5, 4, 92, 1800),
                "key_item_activation_gap");
        assertNotNull(activationGap);
        assertFalse(activationGap.get("ordinary_eligible").getAsBoolean());
        assertEquals(pattern.get("id").getAsString(),
                activationGap.get("linked_pattern_id").getAsString());
    }

    @Test
    void neverMentionsBlinkWithoutAnObservedPurchase() {
        JsonObject modules = patternModules();
        appendFightWindow(modules, "fight-1", 100, 9, "routine", "mid_lane", true);
        appendFightWindow(modules, "fight-2", 200, 11, "routine", "river", false);

        JsonObject pattern = findPattern(
                PlayerCombatTimingAnalysis.analyze(modules, 5, 4, 92, 1800),
                "late_arrival_sequence");

        assertNotNull(pattern);
        assertFalse(pattern.has("item_context"));
        assertFalse(pattern.get("next_action").getAsString().contains("闪烁匕首"));
    }

    @Test
    void aggregatesTwoUnsupportedEarlyInitiationsIntoOnePattern() {
        JsonObject modules = patternModules();
        appendPrematureFightWindow(modules, "fight-early-1", 100, "mid_lane", true);
        appendPrematureFightWindow(modules, "fight-early-2", 200, "river", false);

        JsonObject pattern = findPattern(
                PlayerCombatTimingAnalysis.analyze(modules, 5, 4, 92, 1800),
                "premature_initiation_sequence");

        assertNotNull(pattern);
        assertTrue(pattern.get("ordinary_eligible").getAsBoolean());
        assertEquals(2, pattern.getAsJsonArray("occurrences").size());
        assertTrue(pattern.get("what_happened").getAsString().contains("早于队友"));
        JsonObject first = pattern.getAsJsonArray("occurrences").get(0).getAsJsonObject();
        assertEquals(0, first.get("allies_in_range_at_first_action").getAsInt());
        assertTrue(first.get("premature_initiation").getAsBoolean());
    }

    private static JsonObject timingModules(boolean includeRemoteDamage) {
        JsonObject modules = new JsonObject();
        modules.add("snapshots", snapshots());

        JsonObject combat = new JsonObject();
        JsonArray fights = new JsonArray();
        fights.add(fight(includeRemoteDamage));
        combat.add("fights", fights);
        modules.add("combat", combat);

        JsonObject build = new JsonObject();
        build.add("by_slot", new JsonObject());
        modules.add("build", build);
        return modules;
    }

    private static JsonObject patternModules() {
        JsonObject modules = new JsonObject();
        JsonObject snapshots = new JsonObject();
        JsonArray fields = new JsonArray();
        for (String field : new String[] {
                "second", "x", "y", "region", "life_state", "move_speed"
        }) {
            fields.add(field);
        }
        snapshots.add("fields", fields);
        JsonObject snapshotSlots = new JsonObject();
        snapshotSlots.add("5", new JsonArray());
        snapshotSlots.add("6", new JsonArray());
        snapshotSlots.add("7", new JsonArray());
        snapshots.add("by_slot", snapshotSlots);
        modules.add("snapshots", snapshots);

        JsonObject combat = new JsonObject();
        combat.add("fights", new JsonArray());
        modules.add("combat", combat);

        JsonObject build = new JsonObject();
        build.add("by_slot", new JsonObject());
        modules.add("build", build);
        return modules;
    }

    private static void appendFightWindow(JsonObject modules, String id, int contactTime,
            int arrivalDelta, String importanceTier, String region, boolean adverse) {
        int offset = contactTime - 100;
        JsonObject fight = fight(false);
        fight.addProperty("id", id);
        fight.addProperty("start", 90 + offset);
        fight.addProperty("review_start", 90 + offset);
        fight.addProperty("contact_start", contactTime);
        fight.addProperty("contact_end", 120 + offset);
        fight.addProperty("end", 120 + offset);
        fight.addProperty("region", region);
        fight.getAsJsonObject("importance").addProperty("tier", importanceTier);
        JsonObject phase = fight.getAsJsonArray("phases").get(0).getAsJsonObject();
        phase.addProperty("start", contactTime);
        phase.addProperty("end", contactTime + 6);
        JsonArray events = fight.getAsJsonArray("events");
        for (JsonElement element : events) {
            JsonObject event = element.getAsJsonObject();
            event.addProperty("time", event.get("time").getAsInt() + offset);
        }
        if (adverse) {
            events.add(event("hero_death", contactTime + 4, 0, 6, "enemy_kill"));
        }
        modules.getAsJsonObject("combat").getAsJsonArray("fights").add(fight);

        JsonObject slots = modules.getAsJsonObject("snapshots").getAsJsonObject("by_slot");
        JsonArray playerRows = slots.getAsJsonArray("5");
        JsonArray allySixRows = slots.getAsJsonArray("6");
        JsonArray allySevenRows = slots.getAsJsonArray("7");
        for (int second = contactTime - 10; second <= contactTime + 25; second++) {
            boolean arrived = second >= contactTime + arrivalDelta;
            playerRows.add(snapshot(second, arrived ? 51.0 : 60.0,
                    arrived ? 50.0 : 60.0, 4, 0, 320));
            allySixRows.add(snapshot(second, 49.5, 50.0, 4, 0, 315));
            allySevenRows.add(snapshot(second, 51.0, 49.5, 4, 0, 310));
        }
    }

    private static void appendPrematureFightWindow(JsonObject modules, String id,
            int contactTime, String region, boolean adverse) {
        appendFightWindow(modules, id, contactTime, 0, "routine", region, adverse);
        JsonObject fight = modules.getAsJsonObject("combat").getAsJsonArray("fights")
                .get(modules.getAsJsonObject("combat").getAsJsonArray("fights").size() - 1)
                .getAsJsonObject();
        fight.getAsJsonArray("events").add(
                event("ability_use", contactTime - 6, 5, 0, "test_player_initiation"));

        JsonObject slots = modules.getAsJsonObject("snapshots").getAsJsonObject("by_slot");
        for (JsonElement element : slots.getAsJsonArray("5")) {
            JsonArray row = element.getAsJsonArray();
            int second = row.get(0).getAsInt();
            if (second >= contactTime - 6) {
                row.set(1, new com.google.gson.JsonPrimitive(50.0));
                row.set(2, new com.google.gson.JsonPrimitive(50.0));
            }
        }
        for (int ally : new int[] { 6, 7 }) {
            for (JsonElement element : slots.getAsJsonArray(Integer.toString(ally))) {
                JsonArray row = element.getAsJsonArray();
                int second = row.get(0).getAsInt();
                if (second < contactTime) {
                    row.set(1, new com.google.gson.JsonPrimitive(60.0));
                    row.set(2, new com.google.gson.JsonPrimitive(60.0));
                }
            }
        }
    }

    private static JsonObject findPattern(JsonObject result, String type) {
        for (JsonElement element : result.getAsJsonArray("patterns")) {
            JsonObject pattern = element.getAsJsonObject();
            if (type.equals(pattern.get("pattern_type").getAsString())) return pattern;
        }
        return null;
    }

    private static JsonObject snapshots() {
        JsonObject snapshots = new JsonObject();
        JsonArray fields = new JsonArray();
        for (String field : new String[] {
                "second", "x", "y", "region", "life_state", "move_speed"
        }) {
            fields.add(field);
        }
        snapshots.add("fields", fields);

        JsonObject bySlot = new JsonObject();
        JsonArray playerRows = new JsonArray();
        JsonArray allySixRows = new JsonArray();
        JsonArray allySevenRows = new JsonArray();
        for (int second = 90; second <= 125; second++) {
            double playerX = second < 109 ? 60.0 : 51.0;
            double playerY = second < 109 ? 60.0 : 50.0;
            playerRows.add(snapshot(second, playerX, playerY, 6, 0, 320));
            allySixRows.add(snapshot(second, 49.5, 50.0, 4, 0, 315));
            allySevenRows.add(snapshot(second, 51.0, 49.5, 4, 0, 310));
        }
        bySlot.add("5", playerRows);
        bySlot.add("6", allySixRows);
        bySlot.add("7", allySevenRows);
        snapshots.add("by_slot", bySlot);
        return snapshots;
    }

    private static JsonArray snapshot(int second, double x, double y, int region,
            int lifeState, int moveSpeed) {
        JsonArray row = new JsonArray();
        row.add(second);
        row.add(x);
        row.add(y);
        row.add(region);
        row.add(lifeState);
        row.add(moveSpeed);
        return row;
    }

    private static JsonObject fight(boolean includeRemoteDamage) {
        JsonObject fight = new JsonObject();
        fight.addProperty("id", "fight-1");
        fight.addProperty("kind", "teamfight");
        fight.addProperty("start", 90);
        fight.addProperty("review_start", 90);
        fight.addProperty("contact_start", 100);
        fight.addProperty("contact_end", 120);
        fight.addProperty("end", 120);
        fight.addProperty("x", 50.0);
        fight.addProperty("y", 50.0);
        fight.addProperty("region", "mid_lane");
        fight.addProperty("coordinate_valid", true);
        fight.addProperty("scatter_radius_pct", 4.0);

        JsonObject classification = new JsonObject();
        classification.addProperty("confidence", 90);
        fight.add("classification", classification);

        JsonObject importance = new JsonObject();
        importance.addProperty("tier", "routine");
        fight.add("importance", importance);

        JsonArray participants = new JsonArray();
        for (int slot : new int[] { 0, 1, 5, 6, 7 }) participants.add(slot);
        fight.add("participants", participants);

        JsonArray phases = new JsonArray();
        JsonObject initiation = new JsonObject();
        initiation.addProperty("kind", "initiation");
        initiation.addProperty("start", 100);
        initiation.addProperty("end", 106);
        initiation.addProperty("x", 50.0);
        initiation.addProperty("y", 50.0);
        initiation.addProperty("coordinate_valid", true);
        phases.add(initiation);
        fight.add("phases", phases);

        JsonArray events = new JsonArray();
        events.add(event("damage", 100, 6, 0, "attack"));
        events.add(event("ability_use", 100, 6, 0, "test_initiation"));
        events.add(event("control", 100, 7, 1, "test_stun"));
        if (includeRemoteDamage) {
            events.add(event("damage", 101, 5, 0, "global_test_spell"));
        }
        events.add(event("ability_use", 110, 5, 0, "local_follow_up"));
        fight.add("events", events);
        return fight;
    }

    private static JsonObject event(String kind, int time, int actorSlot, int targetSlot, String key) {
        JsonObject event = new JsonObject();
        event.addProperty("kind", kind);
        event.addProperty("time", time);
        event.addProperty("actor_slot", actorSlot);
        event.addProperty("target_slot", targetSlot);
        event.addProperty("key", key);
        return event;
    }
}
