package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

class ProductAnalysisTest {
    @Test
    void pairsOfflanePositionsAgainstTheEnemySafeLane() {
        ProductAnalysis analysis = new ProductAnalysis();
        addLaneSnapshot(analysis, 0, "axe", 12, 28, 42, 4200);
        addLaneSnapshot(analysis, 1, "tusk", 15, 30, 6, 2100);
        addLaneSnapshot(analysis, 2, "bane", 84, 74, 5, 1900);
        addLaneSnapshot(analysis, 3, "puck", 47, 52, 46, 4700);
        addLaneSnapshot(analysis, 4, "drow_ranger", 82, 76, 51, 5000);
        addLaneSnapshot(analysis, 5, "centaur", 86, 72, 44, 4300);
        addLaneSnapshot(analysis, 6, "storm_spirit", 52, 47, 48, 4800);
        addLaneSnapshot(analysis, 7, "juggernaut", 14, 26, 55, 5200);
        addLaneSnapshot(analysis, 8, "crystal_maiden", 18, 24, 4, 1800);
        addLaneSnapshot(analysis, 9, "hoodwink", 83, 69, 7, 2200);
        JsonObject laning = analysis.build(600).getAsJsonObject("laning");
        JsonObject positions = laning.getAsJsonObject("positions_by_slot");

        assertEquals(3, positions.getAsJsonObject("0").get("position").getAsInt());
        assertEquals(1, positions.getAsJsonObject("7").get("position").getAsInt());
        assertEquals(7, laning.getAsJsonObject("matchup_slot_by_slot").get("0").getAsInt());
        assertEquals(0, laning.getAsJsonObject("matchup_slot_by_slot").get("7").getAsInt());
        JsonObject review = laning.getAsJsonObject("reviews_by_slot").getAsJsonObject("0");
        assertEquals(1, review.get("own_support_slot").getAsInt());
        assertEquals(8, review.get("enemy_support_slot").getAsInt());
        assertTrue(review.getAsJsonObject("support").has("own_core_support_xp_gap"));
        assertTrue(review.getAsJsonObject("support_route").has("route"));
    }

    @Test
    void keepsTheHigherFarmPlayerAsOfflaneCoreWhenTheSupportStaysInLaneLonger() {
        ProductAnalysis analysis = new ProductAnalysis();
        addLaneSnapshot(analysis, 0, "axe", 12, 28, 42, 4200);
        addLaneSnapshot(analysis, 1, "tusk", 15, 30, 6, 2100);
        addLaneSnapshot(analysis, 2, "bane", 84, 74, 5, 1900);
        addLaneSnapshot(analysis, 3, "puck", 47, 52, 46, 4700);
        addLaneSnapshot(analysis, 4, "drow_ranger", 82, 76, 51, 5000);
        addLaneSnapshot(analysis, 5, "centaur", 86, 72, 44, 4300);
        addLaneSnapshot(analysis, 6, "storm_spirit", 52, 47, 48, 4800);
        addLaneSnapshot(analysis, 7, "juggernaut", 14, 26, 55, 5200);
        addLaneSnapshot(analysis, 8, "crystal_maiden", 18, 24, 4, 1800);
        addLaneSnapshot(analysis, 9, "hoodwink", 83, 69, 7, 2200);
        analysis.accept(json("""
                {"type":"interval","slot":5,"time":400,"unit":"CDOTA_Unit_Hero_Centaur","x":127.5,"y":127.5,"life_state":0,"level":7,"lh":55,"networth":5100}
                """));
        analysis.accept(json("""
                {"type":"interval","slot":9,"time":400,"unit":"CDOTA_Unit_Hero_Hoodwink","x":169.4,"y":103.4,"life_state":0,"level":4,"lh":8,"networth":2300}
                """));

        JsonObject positions = analysis.build(600).getAsJsonObject("laning")
                .getAsJsonObject("positions_by_slot");

        assertEquals(3, positions.getAsJsonObject("5").get("position").getAsInt());
        assertEquals(4, positions.getAsJsonObject("9").get("position").getAsInt());
    }

    @Test
    void doesNotInventALaneJungleRouteFromTheNeutralSpawnClock() {
        ProductAnalysis analysis = new ProductAnalysis();
        analysis.accept(json("""
                {"type":"interval","slot":0,"time":60,"unit":"CDOTA_Unit_Hero_Axe","x":168.1,"y":94.5,"life_state":0,"level":2,"lh":5,"networth":1100}
                """));
        analysis.accept(json("""
                {"type":"interval","slot":0,"time":89,"unit":"CDOTA_Unit_Hero_Axe","x":168.1,"y":94.5,"life_state":0,"level":2,"lh":6,"networth":1150}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_GOLD","time":65,"targetname":"npc_dota_hero_axe","value":42,"gold_reason":13}
                """));

        JsonObject farm = analysis.build(180).getAsJsonObject("farm");
        JsonArray diagnostics = farm.getAsJsonObject("diagnostics_by_slot").getAsJsonArray("0");
        JsonArray cycles = farm.getAsJsonObject("lane_jungle_cycles_by_slot").getAsJsonArray("0");

        assertTrue(diagnostics.size() > 0);
        for (JsonElement element : diagnostics) {
            assertFalse(element.getAsJsonObject().get("recommendation").getAsString().equals("lane_jungle_cycle"));
        }
        assertEquals(0, cycles.size());
    }

    @Test
    void projectsReplayCellsOntoTheOfficialMapBounds() {
        ProductAnalysis analysis = new ProductAnalysis();
        analysis.accept(json("""
                {"type":"interval","slot":0,"time":10,"x":160,"y":80,"life_state":0}
                """));

        JsonObject point = snapshotAt(analysis.build(60), 0, 0);

        assertEquals(75.0, point.get("x").getAsDouble(), 0.01);
        assertEquals(87.5, point.get("y").getAsDouble(), 0.01);
    }

    @Test
    void locatesRoshanByTheKillerAndBuildingsByOfficialMapData() {
        ProductAnalysis analysis = new ProductAnalysis();
        analysis.accept(json("""
                {"type":"interval","slot":6,"time":1722,"x":148.786,"y":106.866,"life_state":0}
                """));
        analysis.accept(json("""
                {"type":"CHAT_MESSAGE_ROSHAN_KILL","time":1722,"player1":3,"player2":6}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_TEAM_BUILDING_KILL","time":1800,"targetname":"npc_dota_goodguys_tower1_bot","attacker_team":3,"target_team":2}
                """));

        JsonArray objectives = analysis.build(1900)
                .getAsJsonObject("map")
                .getAsJsonArray("objectives");
        JsonObject roshan = objectives.get(0).getAsJsonObject();
        JsonObject tower = objectives.get(1).getAsJsonObject();

        assertEquals(6, roshan.get("playerSlot").getAsInt());
        assertEquals(66.24, roshan.get("x").getAsDouble(), 0.01);
        assertEquals(66.51, roshan.get("y").getAsDouble(), 0.01);
        assertEquals(75.0, tower.get("x").getAsDouble(), 0.01);
        assertEquals(82.0, tower.get("y").getAsDouble(), 0.01);
    }

    @Test
    void keepsReplayStackCountersAndMarksDoubleStacksAsFacts() {
        ProductAnalysis analysis = new ProductAnalysis();
        analysis.accept(json("""
                {"type":"interval","slot":4,"time":58,"unit":"CDOTA_Unit_Hero_Slark","x":174,"y":90,"life_state":0,"camps_stacked":0,"creeps_stacked":0}
                """));
        analysis.accept(json("""
                {"type":"interval","slot":4,"time":60,"unit":"CDOTA_Unit_Hero_Slark","x":174,"y":90,"life_state":0,"camps_stacked":2,"creeps_stacked":6}
                """));

        JsonObject stack = analysis.build(120)
                .getAsJsonObject("farm")
                .getAsJsonObject("stack_events_by_slot")
                .getAsJsonArray("4")
                .get(0).getAsJsonObject();

        assertEquals(2, stack.get("camps").getAsInt());
        assertEquals(6, stack.get("creeps").getAsInt());
        assertTrue(stack.get("double_stack").getAsBoolean());
        assertEquals("fact", stack.get("evidence").getAsString());
    }

    @Test
    void valuesAConfirmedStackFromSameMatchNeutralGoldEvidence() {
        ProductAnalysis analysis = new ProductAnalysis("7.41");
        analysis.accept(json("""
                {"type":"unit_enter","time":-90,"game_time_ms":-90000,"event_seq":1,"ehandle":500,"unit":"CDOTA_NeutralSpawner","unit_kind":"neutral","team":0,"x":102.56,"y":160.97}
                """));
        analysis.accept(json("""
                {"type":"interval","slot":4,"time":58,"unit":"CDOTA_Unit_Hero_Slark","x":102.56,"y":160.97,"life_state":0,"camps_stacked":0,"creeps_stacked":0}
                """));
        analysis.accept(json("""
                {"type":"interval","slot":4,"time":60,"unit":"CDOTA_Unit_Hero_Slark","x":102.56,"y":160.97,"life_state":0,"camps_stacked":1,"creeps_stacked":3}
                """));
        analysis.accept(json("""
                {"type":"unit_enter","time":60,"game_time_ms":60000,"event_seq":10,"ehandle":501,"unit":"CDOTA_BaseNPC_Creep_Neutral","unit_kind":"neutral","team":4,"x":102.56,"y":160.97,"hp":400,"max_hp":400,"life_state":0}
                """));
        analysis.accept(json("""
                {"type":"unit_state","time":80,"game_time_ms":80000,"event_seq":20,"ehandle":501,"unit":"CDOTA_BaseNPC_Creep_Neutral","unit_kind":"neutral","team":4,"x":102.56,"y":160.97,"hp":0,"max_hp":400,"life_state":1}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DEATH","time":80,"game_time_ms":80000,"event_seq":21,"attackername":"npc_dota_hero_slark","targetname":"npc_dota_neutral_centaur_outrunner","attackerhero":true,"targethero":false,"attacker_team":2,"target_team":4}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_GOLD","time":80,"game_time_ms":80000,"event_seq":22,"targetname":"npc_dota_hero_slark","value":25,"gold_reason":14}
                """));

        JsonObject stack = analysis.build(120).getAsJsonObject("farm")
                .getAsJsonObject("stack_events_by_slot").getAsJsonArray("4")
                .get(0).getAsJsonObject();

        assertEquals(75, stack.get("created_gold_estimate").getAsInt());
        assertEquals("confirmed_creep_delta_times_same_camp_observed_median",
                stack.get("value_evidence").getAsString());
    }

    @Test
    void buildsFightVisionAndRoleResponsibilityEvidence() {
        ProductAnalysis analysis = new ProductAnalysis();
        analysis.accept(json("""
                {"type":"interval","slot":4,"time":600,"unit":"CDOTA_Unit_Hero_Shadow_Shaman","x":160,"y":80,"life_state":0,"networth":2400}
                """));
        analysis.accept(json("""
                {"type":"interval","slot":0,"time":600,"unit":"CDOTA_Unit_Hero_Axe","x":159,"y":80,"life_state":0,"networth":5200}
                """));
        analysis.accept(json("""
                {"type":"interval","slot":5,"time":600,"unit":"CDOTA_Unit_Hero_Bane","x":160,"y":80,"life_state":0,"networth":4700}
                """));
        analysis.accept(json("""
                {"type":"sen","time":590,"ehandle":44,"team":2,"owner_slot":4,"x":160,"y":80,"day_vision_range":1050}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_ABILITY","time":603,"attackername":"npc_dota_hero_shadow_shaman","targetname":"npc_dota_hero_bane","inflictor":"shadow_shaman_shackles"}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_MODIFIER_ADD","time":604,"attackername":"npc_dota_hero_shadow_shaman","targetname":"npc_dota_hero_bane","targethero":true,"inflictor":"modifier_shadow_shaman_shackles","stun_duration":2.4,"modifier_duration":2.4}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_HEAL","time":605,"attackername":"npc_dota_hero_shadow_shaman","targetname":"npc_dota_hero_axe","targethero":true,"value":180,"heal_from_regen":false,"heal_from_lifesteal":false}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":606,"attackername":"npc_dota_hero_shadow_shaman","targetname":"npc_dota_hero_bane","targethero":true,"value":320,"inflictor":"shadow_shaman_shackles","visible_radiant":true,"visible_dire":false}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DEATH","time":610,"attackername":"npc_dota_hero_shadow_shaman","targetname":"npc_dota_hero_bane","attackerhero":true,"targethero":true,"attacker_team":2,"target_team":3}
                """));

        JsonObject fight = analysis.build(700)
                .getAsJsonObject("combat")
                .getAsJsonArray("fights")
                .get(0).getAsJsonObject();
        JsonObject radiantVision = fight.getAsJsonObject("vision").getAsJsonObject("radiant");
        JsonObject support = null;
        for (JsonElement element : fight.getAsJsonArray("contributions")) {
            JsonObject row = element.getAsJsonObject();
            if (row.get("slot").getAsInt() == 4) {
                support = row;
                break;
            }
        }
        if (support == null) throw new AssertionError("slot 4 contribution missing");

        assertEquals(100, radiantVision.get("combat_log_visibility_pct").getAsInt());
        assertEquals(1, radiantVision.get("setup_sentries").getAsInt());
        assertEquals(2.4, support.get("controlSeconds").getAsDouble(), 0.01);
        assertEquals(180, support.get("healing").getAsInt());
        assertEquals(1, support.get("setupSentries").getAsInt());
        assertEquals("position-responsibility/1.0", support.get("responsibility_model").getAsString());
        assertTrue(support.get("role").getAsString().startsWith("position_"));
    }

    @Test
    void separatesSimultaneousFightsAtDifferentMapLocations() {
        ProductAnalysis analysis = new ProductAnalysis();
        addCombatSnapshot(analysis, 0, "axe", 20, 80, 600);
        addCombatSnapshot(analysis, 5, "bane", 20, 80, 600);
        addCombatSnapshot(analysis, 1, "puck", 80, 20, 600);
        addCombatSnapshot(analysis, 6, "lion", 80, 20, 600);
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":600,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_hero_bane","targethero":true,"value":460}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":601,"attackername":"npc_dota_hero_puck","targetname":"npc_dota_hero_lion","targethero":true,"value":520}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DEATH","time":603,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_hero_bane","attackerhero":true,"targethero":true}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DEATH","time":604,"attackername":"npc_dota_hero_puck","targetname":"npc_dota_hero_lion","attackerhero":true,"targethero":true}
                """));

        JsonArray fights = analysis.build(700).getAsJsonObject("combat").getAsJsonArray("fights");

        assertEquals(2, fights.size());
        JsonObject first = fights.get(0).getAsJsonObject();
        JsonObject second = fights.get(1).getAsJsonObject();
        assertEquals(20.0, first.get("x").getAsDouble(), 0.2);
        assertEquals(80.0, first.get("y").getAsDouble(), 0.2);
        assertEquals(80.0, second.get("x").getAsDouble(), 0.2);
        assertEquals(20.0, second.get("y").getAsDouble(), 0.2);
    }

    @Test
    void keepsHighIntensityTwoVersusTwoAsASkirmishAndAddsTenSecondReviewLeadIn() {
        ProductAnalysis analysis = new ProductAnalysis();
        addCombatSnapshot(analysis, 0, "axe", 56, 48, 600);
        addCombatSnapshot(analysis, 1, "puck", 57, 48, 600);
        addCombatSnapshot(analysis, 5, "bane", 56, 49, 600);
        addCombatSnapshot(analysis, 6, "lion", 57, 49, 600);
        String[] events = {
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":600,\"attackername\":\"npc_dota_hero_axe\",\"targetname\":\"npc_dota_hero_bane\",\"targethero\":true,\"value\":780}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":601,\"attackername\":\"npc_dota_hero_bane\",\"targetname\":\"npc_dota_hero_axe\",\"targethero\":true,\"value\":640}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":603,\"attackername\":\"npc_dota_hero_puck\",\"targetname\":\"npc_dota_hero_lion\",\"targethero\":true,\"value\":720}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":604,\"attackername\":\"npc_dota_hero_lion\",\"targetname\":\"npc_dota_hero_puck\",\"targethero\":true,\"value\":590}",
                "{\"type\":\"DOTA_COMBATLOG_DEATH\",\"time\":607,\"attackername\":\"npc_dota_hero_axe\",\"targetname\":\"npc_dota_hero_bane\",\"attackerhero\":true,\"targethero\":true}",
                "{\"type\":\"DOTA_COMBATLOG_DEATH\",\"time\":608,\"attackername\":\"npc_dota_hero_lion\",\"targetname\":\"npc_dota_hero_puck\",\"attackerhero\":true,\"targethero\":true}"
        };
        for (String event : events) analysis.accept(json(event));

        JsonObject fight = analysis.build(700).getAsJsonObject("combat")
                .getAsJsonArray("fights").get(0).getAsJsonObject();

        assertEquals("skirmish", fight.get("kind").getAsString());
        assertEquals(590, fight.get("review_start").getAsInt());
        assertEquals(600, fight.get("contact_start").getAsInt());
        assertEquals("two_vs_two_cap", fight.getAsJsonObject("classification")
                .getAsJsonArray("reasons").get(0).getAsString());
        assertTrue(fight.get("location_confidence").getAsInt() >= 35);
    }

    @Test
    void separatesDistantSignalsEvenWhenTheyShareAReportedParticipant() {
        ProductAnalysis analysis = new ProductAnalysis();
        addCombatSnapshot(analysis, 0, "axe", 20, 80, 600);
        addCombatSnapshot(analysis, 5, "bane", 20, 80, 600);
        addCombatSnapshot(analysis, 6, "lion", 80, 20, 600);
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":600,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_hero_bane","targethero":true,"value":700}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":602,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_hero_lion","targethero":true,"value":720}
                """));

        JsonArray fights = analysis.build(700).getAsJsonObject("combat").getAsJsonArray("fights");

        assertEquals(2, fights.size());
        assertEquals(2, fights.get(0).getAsJsonObject().getAsJsonArray("participants").size());
        assertEquals(2, fights.get(1).getAsJsonObject().getAsJsonArray("participants").size());
        assertEquals(20.0, fights.get(0).getAsJsonObject().get("x").getAsDouble(), 0.2);
        assertEquals(80.0, fights.get(1).getAsJsonObject().get("x").getAsDouble(), 0.2);
    }

    @Test
    void excludesReviewWindowCastsFromTeamfightClassification() {
        ProductAnalysis analysis = new ProductAnalysis();
        addCombatSnapshot(analysis, 0, "axe", 56, 48, 600);
        addCombatSnapshot(analysis, 1, "puck", 57, 48, 600);
        addCombatSnapshot(analysis, 2, "mirana", 58, 48, 600);
        addCombatSnapshot(analysis, 5, "bane", 56, 49, 600);
        addCombatSnapshot(analysis, 6, "lion", 57, 49, 600);
        String[] setupCasts = {
                "{\"type\":\"DOTA_COMBATLOG_ABILITY\",\"time\":592,\"attackername\":\"npc_dota_hero_axe\",\"targetname\":\"npc_dota_hero_bane\",\"inflictor\":\"axe_berserkers_call\"}",
                "{\"type\":\"DOTA_COMBATLOG_ABILITY\",\"time\":593,\"attackername\":\"npc_dota_hero_puck\",\"targetname\":\"npc_dota_hero_lion\",\"inflictor\":\"puck_waning_rift\"}",
                "{\"type\":\"DOTA_COMBATLOG_ABILITY\",\"time\":594,\"attackername\":\"npc_dota_hero_mirana\",\"targetname\":\"npc_dota_hero_bane\",\"inflictor\":\"mirana_starfall\"}",
                "{\"type\":\"DOTA_COMBATLOG_ABILITY\",\"time\":595,\"attackername\":\"npc_dota_hero_bane\",\"targetname\":\"npc_dota_hero_axe\",\"inflictor\":\"bane_brain_sap\"}",
                "{\"type\":\"DOTA_COMBATLOG_ABILITY\",\"time\":596,\"attackername\":\"npc_dota_hero_lion\",\"targetname\":\"npc_dota_hero_puck\",\"inflictor\":\"lion_impale\"}",
                "{\"type\":\"DOTA_COMBATLOG_ABILITY\",\"time\":597,\"attackername\":\"npc_dota_hero_axe\",\"targetname\":\"npc_dota_hero_bane\",\"inflictor\":\"axe_battle_hunger\"}",
                "{\"type\":\"DOTA_COMBATLOG_ABILITY\",\"time\":598,\"attackername\":\"npc_dota_hero_puck\",\"targetname\":\"npc_dota_hero_lion\",\"inflictor\":\"puck_illusory_orb\"}",
                "{\"type\":\"DOTA_COMBATLOG_ABILITY\",\"time\":599,\"attackername\":\"npc_dota_hero_mirana\",\"targetname\":\"npc_dota_hero_bane\",\"inflictor\":\"mirana_arrow\"}"
        };
        for (String event : setupCasts) analysis.accept(json(event));
        String[] contactEvents = {
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":600,\"attackername\":\"npc_dota_hero_axe\",\"targetname\":\"npc_dota_hero_bane\",\"targethero\":true,\"value\":300}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":601,\"attackername\":\"npc_dota_hero_bane\",\"targetname\":\"npc_dota_hero_axe\",\"targethero\":true,\"value\":250}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":602,\"attackername\":\"npc_dota_hero_puck\",\"targetname\":\"npc_dota_hero_lion\",\"targethero\":true,\"value\":250}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":603,\"attackername\":\"npc_dota_hero_lion\",\"targetname\":\"npc_dota_hero_puck\",\"targethero\":true,\"value\":200}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":604,\"attackername\":\"npc_dota_hero_mirana\",\"targetname\":\"npc_dota_hero_bane\",\"targethero\":true,\"value\":250}",
                "{\"type\":\"DOTA_COMBATLOG_MODIFIER_ADD\",\"time\":603,\"attackername\":\"npc_dota_hero_mirana\",\"targetname\":\"npc_dota_hero_bane\",\"targethero\":true,\"inflictor\":\"modifier_mirana_arrow\",\"stun_duration\":3.0,\"modifier_duration\":3.0}",
                "{\"type\":\"DOTA_COMBATLOG_DEATH\",\"time\":605,\"attackername\":\"npc_dota_hero_axe\",\"targetname\":\"npc_dota_hero_bane\",\"attackerhero\":true,\"targethero\":true}",
                "{\"type\":\"DOTA_COMBATLOG_DEATH\",\"time\":606,\"attackername\":\"npc_dota_hero_lion\",\"targetname\":\"npc_dota_hero_puck\",\"attackerhero\":true,\"targethero\":true}"
        };
        for (String event : contactEvents) analysis.accept(json(event));

        JsonObject fight = analysis.build(700).getAsJsonObject("combat")
                .getAsJsonArray("fights").get(0).getAsJsonObject();

        assertEquals("skirmish", fight.get("kind").getAsString());
        assertEquals("two_vs_three_cap", fight.getAsJsonObject("classification")
                .getAsJsonArray("reasons").get(0).getAsString());
        assertEquals(5, fight.getAsJsonArray("participants").size());
    }

    @Test
    void onlyCallsReciprocalNoDeathContactALaneTradeInsideALane() {
        ProductAnalysis lane = new ProductAnalysis("7.41");
        addCombatSnapshot(lane, 0, "axe", 18, 24, 600);
        addCombatSnapshot(lane, 5, "bane", 18, 24, 600);
        lane.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":600,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_hero_bane","targethero":true,"value":360}
                """));
        lane.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":601,"attackername":"npc_dota_hero_bane","targetname":"npc_dota_hero_axe","targethero":true,"value":340}
                """));

        ProductAnalysis river = new ProductAnalysis("7.41");
        addCombatSnapshot(river, 0, "axe", 30, 50, 600);
        addCombatSnapshot(river, 5, "bane", 30, 50, 600);
        river.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":600,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_hero_bane","targethero":true,"value":360}
                """));
        river.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":601,"attackername":"npc_dota_hero_bane","targetname":"npc_dota_hero_axe","targethero":true,"value":340}
                """));

        JsonObject laneFight = lane.build(700).getAsJsonObject("combat").getAsJsonArray("fights")
                .get(0).getAsJsonObject();
        JsonObject riverFight = river.build(700).getAsJsonObject("combat").getAsJsonArray("fights")
                .get(0).getAsJsonObject();

        assertEquals("lane_trade", laneFight.get("kind").getAsString());
        assertEquals("harass", riverFight.get("kind").getAsString());
        assertEquals("non_lane_poke", riverFight.getAsJsonObject("classification")
                .getAsJsonArray("reasons").get(0).getAsString());
    }

    @Test
    void mergesShortGapSharedParticipantBurstsIntoOneChaseCandidate() {
        ProductAnalysis analysis = new ProductAnalysis();
        addCombatSnapshot(analysis, 0, "axe", 40, 50, 600);
        addCombatSnapshot(analysis, 5, "bane", 40, 50, 600);
        addCombatSnapshot(analysis, 0, "axe", 56, 50, 605);
        addCombatSnapshot(analysis, 5, "bane", 56, 50, 605);
        String[] events = {
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":600,\"attackername\":\"npc_dota_hero_axe\",\"targetname\":\"npc_dota_hero_bane\",\"targethero\":true,\"value\":360}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":601,\"attackername\":\"npc_dota_hero_bane\",\"targetname\":\"npc_dota_hero_axe\",\"targethero\":true,\"value\":340}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":605,\"attackername\":\"npc_dota_hero_axe\",\"targetname\":\"npc_dota_hero_bane\",\"targethero\":true,\"value\":380}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":606,\"attackername\":\"npc_dota_hero_bane\",\"targetname\":\"npc_dota_hero_axe\",\"targethero\":true,\"value\":320}"
        };
        for (String event : events) analysis.accept(json(event));

        JsonArray fights = analysis.build(700).getAsJsonObject("combat").getAsJsonArray("fights");

        assertEquals(1, fights.size());
        assertEquals(600, fights.get(0).getAsJsonObject().get("contact_start").getAsInt());
        assertEquals(606, fights.get(0).getAsJsonObject().get("contact_end").getAsInt());
    }

    @Test
    void addsExplainableGankScoresWithoutCallingItATeamfight() {
        ProductAnalysis analysis = new ProductAnalysis("7.41");
        addCombatSnapshot(analysis, 0, "axe", 18, 24, 600);
        addCombatSnapshot(analysis, 1, "puck", 18, 24, 600);
        addCombatSnapshot(analysis, 5, "bane", 18, 24, 600);
        String[] events = {
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":600,\"attackername\":\"npc_dota_hero_axe\",\"targetname\":\"npc_dota_hero_bane\",\"targethero\":true,\"value\":500}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":601,\"attackername\":\"npc_dota_hero_puck\",\"targetname\":\"npc_dota_hero_bane\",\"targethero\":true,\"value\":450}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":602,\"attackername\":\"npc_dota_hero_bane\",\"targetname\":\"npc_dota_hero_axe\",\"targethero\":true,\"value\":120}",
                "{\"type\":\"DOTA_COMBATLOG_DEATH\",\"time\":603,\"attackername\":\"npc_dota_hero_axe\",\"targetname\":\"npc_dota_hero_bane\",\"attackerhero\":true,\"targethero\":true}"
        };
        for (String event : events) analysis.accept(json(event));

        JsonObject fight = analysis.build(700).getAsJsonObject("combat").getAsJsonArray("fights")
                .get(0).getAsJsonObject();
        JsonObject classification = fight.getAsJsonObject("classification");

        assertEquals("pickoff", fight.get("kind").getAsString());
        assertTrue(classification.getAsJsonArray("context_tags").toString().contains("gank"));
        assertEquals("combat-automatic-hybrid-v5", classification.get("model").getAsString());
        assertTrue(classification.get("confidence").getAsInt() >= 38);
        assertTrue(classification.getAsJsonObject("scores").has("teamfight"));
        assertTrue(classification.getAsJsonObject("features").get("target_concentration").getAsDouble() > 0.8);
    }

    @Test
    void confirmsTpSupportOnlyAfterPositionJumpAndCombatAction() {
        ProductAnalysis analysis = new ProductAnalysis("7.41");
        addCombatSnapshot(analysis, 0, "axe", 18, 24, 600);
        addCombatSnapshot(analysis, 5, "bane", 18, 24, 600);
        addCombatSnapshot(analysis, 1, "puck", 80, 72, 595);
        addCombatSnapshot(analysis, 1, "puck", 18, 24, 599);
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_ITEM","time":596,"attackername":"npc_dota_hero_puck","targetname":"npc_dota_hero_puck","targethero":true,"inflictor":"item_tpscroll"}
                """));
        String[] events = {
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":600,\"attackername\":\"npc_dota_hero_axe\",\"targetname\":\"npc_dota_hero_bane\",\"targethero\":true,\"value\":350}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":600,\"attackername\":\"npc_dota_hero_puck\",\"targetname\":\"npc_dota_hero_bane\",\"targethero\":true,\"value\":300}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":601,\"attackername\":\"npc_dota_hero_bane\",\"targetname\":\"npc_dota_hero_axe\",\"targethero\":true,\"value\":300}"
        };
        for (String event : events) analysis.accept(json(event));

        JsonObject fight = analysis.build(700).getAsJsonObject("combat").getAsJsonArray("fights")
                .get(0).getAsJsonObject();
        JsonArray supportEvents = fight.getAsJsonArray("support_events");

        assertEquals(1, supportEvents.size());
        assertTrue(supportEvents.get(0).getAsJsonObject().get("support").getAsBoolean());
        assertEquals("completed_support", supportEvents.get(0).getAsJsonObject().get("status").getAsString());
        assertTrue(fight.getAsJsonObject("classification").getAsJsonArray("context_tags")
                .toString().contains("tp_support"));
        assertTrue(fight.getAsJsonArray("events").toString().contains("tp_support"));
    }

    @Test
    void keepsAnExplicitlyInterruptedTeleportOutOfSupportResults() {
        ProductAnalysis analysis = new ProductAnalysis("7.41");
        addCombatSnapshot(analysis, 0, "axe", 18, 24, 600);
        addCombatSnapshot(analysis, 5, "bane", 18, 24, 600);
        addCombatSnapshot(analysis, 1, "puck", 80, 72, 595);
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_MODIFIER_ADD","time":596,"game_time_ms":596100,"attackername":"npc_dota_hero_puck","targetname":"npc_dota_hero_puck","targethero":true,"inflictor":"modifier_teleporting","modifier_duration":3.0}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_ITEM","time":596,"game_time_ms":596120,"attackername":"npc_dota_hero_puck","targetname":"npc_dota_hero_puck","targethero":true,"inflictor":"item_tpscroll"}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_MODIFIER_REMOVE","time":597,"game_time_ms":597200,"attackername":"npc_dota_hero_puck","targetname":"npc_dota_hero_puck","targethero":true,"inflictor":"modifier_teleporting","modifier_duration":3.0,"modifier_elapsed_duration":1.1,"modifier_purged":false}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":600,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_hero_bane","targethero":true,"value":420}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":601,"attackername":"npc_dota_hero_bane","targetname":"npc_dota_hero_axe","targethero":true,"value":360}
                """));

        JsonObject fight = analysis.build(700).getAsJsonObject("combat").getAsJsonArray("fights")
                .get(0).getAsJsonObject();
        JsonObject response = fight.getAsJsonArray("support_events").get(0).getAsJsonObject();

        assertEquals("interrupted", response.get("status").getAsString());
        assertTrue(response.get("channel_observed").getAsBoolean());
        assertTrue(response.get("channel_interrupted").getAsBoolean());
        assertFalse(response.get("support").getAsBoolean());
        assertFalse(fight.getAsJsonObject("classification").getAsJsonArray("context_tags")
                .toString().contains("tp_support"));
    }

    @Test
    void confirmsTowerDiveOnlyWhenTheLiveTowerDamagesAnAttacker() {
        ProductAnalysis confirmed = towerFight(true);
        JsonObject confirmedContext = confirmed.build(700).getAsJsonObject("combat")
                .getAsJsonArray("fights").get(0).getAsJsonObject().getAsJsonObject("tower_context");

        assertEquals("confirmed_dive", confirmedContext.get("status").getAsString());
        assertTrue(confirmedContext.get("confirmed_dive").getAsBoolean());
        assertEquals("npc_dota_badguys_tower1_bot", confirmedContext.get("tower").getAsString());
        assertTrue(confirmedContext.get("tower_damage_to_attackers").getAsInt() > 0);

        ProductAnalysis zoneOnly = towerFight(false);
        JsonObject zoneContext = zoneOnly.build(700).getAsJsonObject("combat")
                .getAsJsonArray("fights").get(0).getAsJsonObject().getAsJsonObject("tower_context");
        assertEquals("tower_zone_fight", zoneContext.get("status").getAsString());
        assertFalse(zoneContext.get("confirmed_dive").getAsBoolean());
    }

    @Test
    void buildsRoshanAttemptAndFiveMinuteAegisLifecycleFromFacts() {
        ProductAnalysis analysis = new ProductAnalysis("7.41");
        addCombatSnapshot(analysis, 0, "axe", 27, 23, 600);
        analysis.accept(json("""
                {"type":"interval","slot":0,"time":599,"unit":"CDOTA_Unit_Hero_Axe","x":98.56,"y":162.56,"life_state":0,"hero_inventory":[]}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":600,"game_time_ms":600100,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_roshan","attackerhero":true,"targethero":false,"attacker_team":2,"target_team":4,"value":900,"event_health":7200}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":605,"game_time_ms":605100,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_roshan","attackerhero":true,"targethero":false,"attacker_team":2,"target_team":4,"value":1600,"event_health":4200}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":608,"game_time_ms":608100,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_roshan","attackerhero":true,"targethero":false,"attacker_team":2,"target_team":4,"value":4200,"event_health":0}
                """));
        analysis.accept(json("""
                {"type":"CHAT_MESSAGE_ROSHAN_KILL","time":608,"game_time_ms":608200,"player1":2,"player2":0}
                """));
        analysis.accept(json("""
                {"type":"CHAT_MESSAGE_AEGIS","time":609,"game_time_ms":609000,"player1":0,"player2":-1}
                """));
        analysis.accept(json("""
                {"type":"interval","slot":0,"time":609,"game_time_ms":609100,"unit":"CDOTA_Unit_Hero_Axe","x":98.56,"y":162.56,"life_state":0,"hero_inventory":[{"id":"item_aegis","slot":0}]}
                """));
        analysis.accept(json("""
                {"type":"interval","slot":0,"time":909,"game_time_ms":909100,"unit":"CDOTA_Unit_Hero_Axe","x":98.56,"y":162.56,"life_state":0,"hero_inventory":[]}
                """));

        JsonObject objectives = analysis.build(1000).getAsJsonObject("objectives");
        JsonObject attempt = objectives.getAsJsonArray("roshan_attempts").get(0).getAsJsonObject();
        JsonObject aegis = objectives.getAsJsonArray("aegis_lifecycles").get(0).getAsJsonObject();

        assertEquals("uncontested_roshan", attempt.get("classification").getAsString());
        assertTrue(attempt.get("completed").getAsBoolean());
        assertEquals(3, attempt.get("damage_events").getAsInt());
        assertEquals("northwest", attempt.get("pit").getAsString());
        assertTrue(aegis.get("inventory_confirmed").getAsBoolean());
        assertEquals("expired_or_reclaimed", aegis.get("state").getAsString());
        assertEquals("roshan-attempt-1", aegis.get("roshan_attempt_id").getAsString());
        assertTrue(aegis.get("held_seconds").getAsInt() >= 300);
    }

    @Test
    void labelsOnlyCombatCloseToTheRoshanPitWithoutDamageEvidence() {
        JsonObject closeFight = pitFight(28).build(700).getAsJsonObject("combat")
                .getAsJsonArray("fights").get(0).getAsJsonObject();
        assertEquals("roshan_pit_combat_without_roshan_damage",
                closeFight.getAsJsonObject("objective_context").get("kind").getAsString());

        JsonObject distantFight = pitFight(32).build(700).getAsJsonObject("combat")
                .getAsJsonArray("fights").get(0).getAsJsonObject();
        assertFalse(distantFight.has("objective_context"));
    }

    @Test
    void preservesMillisecondOrderingAndNegativePreparationEvents() {
        ProductAnalysis analysis = new ProductAnalysis("7.41");
        addCombatSnapshot(analysis, 0, "axe", 40, 50, 600);
        addCombatSnapshot(analysis, 5, "bane", 40, 50, 600);
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_PURCHASE","slot":0,"time":-13,"game_time_ms":-12345,"demo_tick":10,"event_seq":1,"targetname":"npc_dota_hero_axe","valuename":"item_tpscroll"}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":600,"game_time_ms":600100,"demo_tick":100,"event_seq":2,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_hero_bane","targethero":true,"value":420}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":600,"game_time_ms":600350,"demo_tick":104,"event_seq":3,"attackername":"npc_dota_hero_bane","targetname":"npc_dota_hero_axe","targethero":true,"value":360}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DEATH","time":600,"game_time_ms":600900,"demo_tick":120,"event_seq":4,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_hero_bane","attackerhero":true,"targethero":true}
                """));

        JsonObject modules = analysis.build(700);
        JsonObject purchase = modules.getAsJsonObject("build").getAsJsonObject("by_slot")
                .getAsJsonObject("0").getAsJsonArray("purchases").get(0).getAsJsonObject();
        JsonObject fight = modules.getAsJsonObject("combat").getAsJsonArray("fights")
                .get(0).getAsJsonObject();
        JsonArray events = fight.getAsJsonArray("events");

        assertEquals(-12345L, purchase.get("game_time_ms").getAsLong());
        assertEquals(600100L, fight.get("contact_start_ms").getAsLong());
        assertEquals(600900L, fight.get("contact_end_ms").getAsLong());
        assertEquals(600100L, events.get(0).getAsJsonObject().get("game_time_ms").getAsLong());
        assertEquals(600350L, events.get(1).getAsJsonObject().get("game_time_ms").getAsLong());
        assertEquals("game_time_ms,demo_tick,event_seq", modules.getAsJsonObject("time_contract")
                .get("ordering").getAsString());
    }

    @Test
    void splitsCombatPhasesAtTheFirstResponseAndScoresImportanceSeparatelyFromKind() {
        ProductAnalysis analysis = new ProductAnalysis("7.41");
        addCombatSnapshot(analysis, 0, "axe", 56, 48, 600);
        addCombatSnapshot(analysis, 1, "puck", 57, 48, 600);
        addCombatSnapshot(analysis, 5, "bane", 56, 49, 600);
        addCombatSnapshot(analysis, 6, "lion", 57, 49, 600);
        String[] events = {
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":600,\"game_time_ms\":600100,\"event_seq\":1,\"attackername\":\"npc_dota_hero_axe\",\"targetname\":\"npc_dota_hero_bane\",\"targethero\":true,\"value\":780}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":600,\"game_time_ms\":600420,\"event_seq\":2,\"attackername\":\"npc_dota_hero_bane\",\"targetname\":\"npc_dota_hero_axe\",\"targethero\":true,\"value\":640}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":602,\"game_time_ms\":602200,\"event_seq\":3,\"attackername\":\"npc_dota_hero_puck\",\"targetname\":\"npc_dota_hero_lion\",\"targethero\":true,\"value\":720}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":603,\"game_time_ms\":603100,\"event_seq\":4,\"attackername\":\"npc_dota_hero_lion\",\"targetname\":\"npc_dota_hero_puck\",\"targethero\":true,\"value\":590}",
                "{\"type\":\"DOTA_COMBATLOG_DEATH\",\"time\":607,\"game_time_ms\":607000,\"event_seq\":5,\"attackername\":\"npc_dota_hero_axe\",\"targetname\":\"npc_dota_hero_bane\",\"attackerhero\":true,\"targethero\":true}",
                "{\"type\":\"DOTA_COMBATLOG_DEATH\",\"time\":608,\"game_time_ms\":608000,\"event_seq\":6,\"attackername\":\"npc_dota_hero_lion\",\"targetname\":\"npc_dota_hero_puck\",\"attackerhero\":true,\"targethero\":true}",
                "{\"type\":\"CHAT_MESSAGE_ROSHAN_KILL\",\"time\":610,\"game_time_ms\":610000,\"event_seq\":7,\"player2\":0}"
        };
        for (String event : events) analysis.accept(json(event));

        JsonObject fight = analysis.build(700).getAsJsonObject("combat").getAsJsonArray("fights")
                .get(0).getAsJsonObject();
        JsonArray phases = fight.getAsJsonArray("phases");
        JsonObject initiation = phases.get(1).getAsJsonObject();
        JsonObject importance = fight.getAsJsonObject("importance");

        assertEquals("skirmish", fight.get("kind").getAsString());
        assertEquals(5, phases.size());
        assertEquals("setup", phases.get(0).getAsJsonObject().get("kind").getAsString());
        assertEquals("initiation", initiation.get("kind").getAsString());
        assertEquals(600420L, initiation.get("end_ms").getAsLong());
        assertEquals("conversion", phases.get(4).getAsJsonObject().get("kind").getAsString());
        assertTrue(importance.get("score").getAsInt() >= 40);
        assertTrue(importance.get("important").getAsBoolean());
        assertTrue(importance.getAsJsonArray("reasons").toString().contains("roshan_or_aegis_conversion"));
    }

    @Test
    void keepsTheSameReplayPointAcrossMapFarmVisionAndCombatModules() {
        ProductAnalysis analysis = new ProductAnalysis("7.41");
        analysis.accept(json("""
                {"type":"interval","slot":0,"time":600,"unit":"CDOTA_Unit_Hero_Axe","x":160,"y":80,"life_state":0,"networth":6000}
                """));
        analysis.accept(json("""
                {"type":"interval","slot":5,"time":600,"unit":"CDOTA_Unit_Hero_Bane","x":160,"y":80,"life_state":0,"networth":5500}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_GOLD","time":600,"targetname":"npc_dota_hero_axe","value":42,"gold_reason":13,"event_x":4096,"event_y":-6144}
                """));
        analysis.accept(json("""
                {"type":"obs","time":590,"ehandle":44,"team":2,"owner_slot":0,"x":160,"y":80,"day_vision_range":1600}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":600,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_hero_bane","targethero":true,"value":520}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DEATH","time":603,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_hero_bane","attackerhero":true,"targethero":true}
                """));

        JsonObject modules = analysis.build(700);
        JsonObject snapshot = snapshotAt(modules, 0, 0);
        JsonObject farm = modules.getAsJsonObject("farm").getAsJsonObject("gold_events_by_slot")
                .getAsJsonArray("0").get(0).getAsJsonObject();
        JsonObject ward = modules.getAsJsonObject("vision").getAsJsonArray("wards").get(0).getAsJsonObject();
        JsonObject fight = modules.getAsJsonObject("combat").getAsJsonArray("fights").get(0).getAsJsonObject();

        for (JsonObject point : new JsonObject[] { farm, ward, fight }) {
            assertEquals(snapshot.get("x").getAsDouble(), point.get("x").getAsDouble(), 0.01);
            assertEquals(snapshot.get("y").getAsDouble(), point.get("y").getAsDouble(), 0.01);
            assertEquals(snapshot.get("region").getAsString(), point.get("region").getAsString());
        }
    }

    @Test
    void marksOutOfBoundsReplayCoordinatesInvalidInsteadOfClampingThem() {
        ProductAnalysis analysis = new ProductAnalysis("7.41");
        analysis.accept(json("""
                {"type":"interval","slot":0,"time":10,"unit":"CDOTA_Unit_Hero_Axe","x":194,"y":128,"life_state":0}
                """));

        JsonObject modules = analysis.build(60);
        JsonObject snapshot = snapshotAt(modules, 0, 0);

        assertFalse(snapshot.has("x"));
        assertFalse(snapshot.has("y"));
        assertFalse(snapshot.get("coordinate_valid").getAsBoolean());
        assertTrue(modules.getAsJsonObject("coordinate_system").getAsJsonObject("diagnostics")
                .get("invalid_total").getAsLong() > 0);
    }

    @Test
    void skipsUnmappableWardsWhenBuildingFarmVisionContext() {
        ProductAnalysis analysis = new ProductAnalysis("7.41");
        analysis.accept(json("""
                {"type":"interval","slot":0,"time":60,"unit":"CDOTA_Unit_Hero_Axe","x":128,"y":128,"life_state":0,"level":5,"lh":20,"networth":2500}
                """));
        analysis.accept(json("""
                {"type":"obs","time":55,"ehandle":44,"team":2,"owner_slot":0,"x":193.3,"y":126.2,"day_vision_range":1600}
                """));

        JsonObject modules = assertDoesNotThrow(() -> analysis.build(180));
        JsonObject ward = modules.getAsJsonObject("vision").getAsJsonArray("wards")
                .get(0).getAsJsonObject();

        assertFalse(ward.get("coordinate_valid").getAsBoolean());
        assertFalse(ward.has("x"));
        assertFalse(ward.has("y"));
    }

    @Test
    void keepsWardEndOrderingExactOrExplicitlyDerived() {
        ProductAnalysis analysis = new ProductAnalysis("7.41");
        analysis.accept(json("""
                {"type":"obs","time":100,"game_time_ms":100100,"demo_tick":1000,"event_seq":10,"ehandle":44,"team":2,"owner_slot":0,"x":160,"y":80}
                """));
        analysis.accept(json("""
                {"type":"obs_left","time":210,"game_time_ms":210250,"demo_tick":4300,"event_seq":20,"ehandle":44,"team":2,"owner_slot":0,"x":160,"y":80}
                """));
        analysis.accept(json("""
                {"type":"sen","time":220,"game_time_ms":220500,"demo_tick":4600,"event_seq":30,"ehandle":45,"team":2,"owner_slot":0,"x":161,"y":80}
                """));

        JsonArray timeline = analysis.build(700).getAsJsonObject("timeline").getAsJsonArray("events");
        JsonObject exactEnd = null;
        JsonObject derivedEnd = null;
        for (JsonElement element : timeline) {
            JsonObject event = element.getAsJsonObject();
            if (!"ward_end".equals(event.get("kind").getAsString())) continue;
            if (event.get("game_time_ms").getAsLong() == 210250L) exactEnd = event;
            if ("derived_lifetime".equals(event.get("time_source").getAsString())) derivedEnd = event;
        }

        assertNotNull(exactEnd);
        assertEquals(4300, exactEnd.get("demo_tick").getAsInt());
        assertEquals(20L, exactEnd.get("event_seq").getAsLong());
        assertEquals("exact", exactEnd.get("ordering_quality").getAsString());
        assertNotNull(derivedEnd);
        assertEquals(-1, derivedEnd.get("demo_tick").getAsInt());
        assertEquals(-1L, derivedEnd.get("event_seq").getAsLong());
        assertEquals("derived", derivedEnd.get("evidence").getAsString());
    }

    @Test
    void packsPerSecondScalarStateAndKeepsInventoryTransitions() {
        ProductAnalysis analysis = new ProductAnalysis("7.41");
        analysis.accept(json("""
                {"type":"interval","slot":0,"time":10,"unit":"CDOTA_Unit_Hero_Axe","x":160,"y":80,"life_state":0,"move_speed":315,"visible_by_team":6,"day_vision_range":1800,"night_vision_range":800,"fow_team":2,"reveal_radius":450.5,"selection_ring_visible":true,"hero_abilities":[{"id":"axe_berserkers_call","ability_level":2,"cooldown":7.5,"cooldown_length":16.0,"current_charges":1,"mana_cost":90,"cast_range":300}],"hero_inventory":[{"id":"item_blink","slot":0,"num_charges":0,"num_secondary_charges":0,"cooldown":2.25,"cooldown_length":15.0}]}
                """));

        JsonObject modules = analysis.build(60);
        JsonObject snapshot = snapshotAt(modules, 0, 0);

        assertEquals(315, snapshot.get("move_speed").getAsInt());
        assertEquals(6, snapshot.get("visible_by_team").getAsInt());
        assertEquals(1800, snapshot.get("day_vision_range").getAsInt());
        assertEquals(800, snapshot.get("night_vision_range").getAsInt());
        assertEquals(2, snapshot.get("fow_team").getAsInt());
        assertTrue(snapshot.get("selection_ring_visible").getAsBoolean());
        JsonObject packedSnapshots = modules.getAsJsonObject("snapshots");
        assertEquals(AnalysisStorage.SNAPSHOT_SCHEMA, packedSnapshots.get("schema").getAsString());
        assertTrue(packedSnapshots.getAsJsonArray("omitted_repeated_fields")
                .toString().contains("hero_abilities"));
        JsonObject inventoryPoint = modules.getAsJsonObject("build").getAsJsonObject("by_slot")
                .getAsJsonObject("0").getAsJsonArray("inventory").get(0).getAsJsonObject();
        assertEquals(2.25, inventoryPoint.getAsJsonArray("items").get(0).getAsJsonObject()
                .get("cooldown").getAsDouble(), 0.001);
    }

    @Test
    void classifiesGoldReasonsWithoutPuttingUnknownIncomeIntoCombat() {
        ProductAnalysis analysis = new ProductAnalysis("7.41");
        analysis.accept(json("""
                {"type":"interval","slot":0,"time":10,"unit":"CDOTA_Unit_Hero_Axe","x":160,"y":80,"life_state":0,"networth":1000}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_GOLD","time":20,"targetname":"npc_dota_hero_axe","value":100,"gold_reason":13}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_GOLD","time":21,"targetname":"npc_dota_hero_axe","value":250,"gold_reason":11}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_GOLD","time":22,"targetname":"npc_dota_hero_axe","value":150,"gold_reason":999}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_GOLD","time":23,"targetname":"npc_dota_hero_axe","value":-75,"gold_reason":1}
                """));

        JsonObject farm = analysis.build(60).getAsJsonObject("farm");
        JsonArray events = farm.getAsJsonObject("gold_events_by_slot").getAsJsonArray("0");
        JsonObject unknown = null;
        JsonObject building = null;
        for (JsonElement element : events) {
            JsonObject event = element.getAsJsonObject();
            if (event.get("reason").getAsInt() == 999) unknown = event;
            if (event.get("reason").getAsInt() == 11) building = event;
        }

        assertNotNull(unknown);
        assertEquals("unknown_reason_999", unknown.get("source").getAsString());
        assertEquals("unknown", unknown.get("category").getAsString());
        assertFalse(unknown.get("mapped").getAsBoolean());
        assertNotNull(building);
        assertEquals("objective", building.get("category").getAsString());
        JsonObject summary = farm.getAsJsonObject("gold_source_summary");
        assertEquals(4, summary.get("event_count").getAsInt());
        assertEquals(1, summary.get("unmapped_events").getAsInt());
        assertTrue(summary.getAsJsonObject("conservation").get("matches").getAsBoolean());
        assertEquals(425, summary.getAsJsonObject("conservation").get("raw_total").getAsInt());
        assertEquals(150, summary.getAsJsonObject("by_source").getAsJsonObject("unknown_reason_999")
                .get("total").getAsInt());
    }

    @Test
    void upgradesAThreeSecondThreeVsThreeMultiKillBurstToTeamfight() {
        ProductAnalysis analysis = new ProductAnalysis("7.41");
        String[] heroes = { "axe", "puck", "mirana", "bane", "lion", "drow_ranger" };
        int[] slots = { 0, 1, 2, 5, 6, 7 };
        for (int index = 0; index < slots.length; index++) {
            addCombatSnapshot(analysis, slots[index], heroes[index], 50 + index * 0.2, 50, 600);
        }
        String[] events = {
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":600,\"attackername\":\"npc_dota_hero_axe\",\"targetname\":\"npc_dota_hero_bane\",\"targethero\":true,\"value\":800}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":600,\"attackername\":\"npc_dota_hero_puck\",\"targetname\":\"npc_dota_hero_lion\",\"targethero\":true,\"value\":700}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":601,\"attackername\":\"npc_dota_hero_mirana\",\"targetname\":\"npc_dota_hero_drow_ranger\",\"targethero\":true,\"value\":600}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":601,\"attackername\":\"npc_dota_hero_bane\",\"targetname\":\"npc_dota_hero_axe\",\"targethero\":true,\"value\":500}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":602,\"attackername\":\"npc_dota_hero_lion\",\"targetname\":\"npc_dota_hero_puck\",\"targethero\":true,\"value\":400}",
                "{\"type\":\"DOTA_COMBATLOG_DAMAGE\",\"time\":602,\"attackername\":\"npc_dota_hero_drow_ranger\",\"targetname\":\"npc_dota_hero_mirana\",\"targethero\":true,\"value\":300}",
                "{\"type\":\"DOTA_COMBATLOG_DEATH\",\"time\":603,\"attackername\":\"npc_dota_hero_axe\",\"targetname\":\"npc_dota_hero_bane\",\"attackerhero\":true,\"targethero\":true}",
                "{\"type\":\"DOTA_COMBATLOG_DEATH\",\"time\":603,\"attackername\":\"npc_dota_hero_lion\",\"targetname\":\"npc_dota_hero_puck\",\"attackerhero\":true,\"targethero\":true}"
        };
        for (String event : events) analysis.accept(json(event));

        JsonObject fight = analysis.build(700).getAsJsonObject("combat").getAsJsonArray("fights")
                .get(0).getAsJsonObject();
        JsonObject classification = fight.getAsJsonObject("classification");

        assertEquals("teamfight", fight.get("kind").getAsString());
        assertEquals("burst_teamfight_override", classification.getAsJsonArray("reasons")
                .get(0).getAsString());
        assertTrue(classification.getAsJsonObject("features").get("burst_override").getAsBoolean());
        assertTrue(classification.getAsJsonObject("features").get("teamfight_participant_gate").getAsBoolean());
    }

    @Test
    void splitsASevenSecondGapWhenTargetAndBattleCenterBothChange() {
        ProductAnalysis analysis = new ProductAnalysis("7.41");
        addCombatSnapshot(analysis, 0, "axe", 30, 50, 600);
        addCombatSnapshot(analysis, 5, "bane", 30, 50, 600);
        addCombatSnapshot(analysis, 0, "axe", 41.5, 50, 607);
        addCombatSnapshot(analysis, 6, "lion", 41.5, 50, 607);
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":600,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_hero_bane","targethero":true,"value":700}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":607,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_hero_lion","targethero":true,"value":700}
                """));

        JsonObject combat = analysis.build(700).getAsJsonObject("combat");

        assertEquals(1, combat.get("candidate_clusters").getAsInt());
        assertEquals(2, combat.get("segmented_clusters").getAsInt());
        assertEquals(2, combat.getAsJsonArray("fights").size());
    }

    @Test
    void separatesRelativeLowWindowsFromActualAnomalies() {
        ProductAnalysis analysis = new ProductAnalysis("7.41");
        analysis.accept(json("""
                {"type":"interval","slot":0,"time":60,"unit":"CDOTA_Unit_Hero_Axe","x":160,"y":80,"life_state":0,"networth":1000}
                """));
        analysis.accept(json("""
                {"type":"interval","slot":0,"time":179,"unit":"CDOTA_Unit_Hero_Axe","x":160,"y":80,"life_state":0,"networth":1400}
                """));
        for (int time : new int[] { 65, 95, 125, 155 }) {
            analysis.accept(json(String.format(java.util.Locale.ROOT,
                    "{\"type\":\"DOTA_COMBATLOG_GOLD\",\"time\":%d,\"targetname\":\"npc_dota_hero_axe\",\"value\":100,\"gold_reason\":13}",
                    time)));
        }

        JsonObject farm = analysis.build(180).getAsJsonObject("farm");
        JsonArray anomalies = farm.getAsJsonObject("anomalies_by_slot").getAsJsonArray("0");
        JsonArray relativeLows = farm.getAsJsonObject("relative_lows_by_slot").getAsJsonArray("0");

        assertEquals(0, anomalies.size());
        assertTrue(relativeLows.size() > 0);
        JsonObject sample = relativeLows.get(0).getAsJsonObject();
        assertEquals("relative_low", sample.get("diagnostic_class").getAsString());
        assertFalse(sample.get("review_required").getAsBoolean());
        assertFalse(sample.get("recommendation_enabled").getAsBoolean());
        assertTrue(sample.get("actionable_deprecated").getAsBoolean());
    }

    @Test
    void buildsObservedLaneWavesAndCampLifecycleWithoutTreatingPvsExitAsDeath() {
        ProductAnalysis analysis = new ProductAnalysis("7.41d");
        analysis.accept(json("""
                {"type":"unit_enter","time":-90,"ehandle":700,"unit":"CDOTA_NeutralSpawner","unit_kind":"neutral","team":4,"x":128,"y":128}
                """));
        analysis.accept(json("""
                {"type":"unit_enter","time":4,"ehandle":101,"unit":"CDOTA_BaseNPC_Creep_Lane","unit_kind":"lane_creep","team":3,"x":160,"y":80,"hp":550,"max_hp":550,"life_state":0}
                """));
        analysis.accept(json("""
                {"type":"unit_state","time":35,"ehandle":101,"unit":"CDOTA_BaseNPC_Creep_Lane","unit_kind":"lane_creep","team":3,"x":158,"y":82,"hp":0,"max_hp":550,"life_state":1}
                """));
        analysis.accept(json("""
                {"type":"unit_enter","time":71,"ehandle":201,"unit":"CDOTA_BaseNPC_Creep_Neutral","unit_kind":"neutral","team":4,"x":128.5,"y":128.5,"hp":700,"max_hp":700,"life_state":0}
                """));
        analysis.accept(json("""
                {"type":"unit_left","time":76,"ehandle":201,"unit":"CDOTA_BaseNPC_Creep_Neutral","unit_kind":"neutral","team":4,"x":128.5,"y":128.5,"hp":700,"max_hp":700,"life_state":0}
                """));

        JsonObject farm = analysis.build(120).getAsJsonObject("farm");
        JsonObject wave = farm.getAsJsonArray("lane_waves").get(0).getAsJsonObject();
        JsonObject camp = farm.getAsJsonArray("camp_states").get(0).getAsJsonObject();
        JsonObject cycle = camp.getAsJsonArray("observations").get(0).getAsJsonObject();

        assertEquals(0, wave.get("expected_spawn").getAsInt());
        assertEquals("observed_cleared", wave.get("state").getAsString());
        assertEquals("observed_cleared", wave.getAsJsonArray("transitions").get(1)
                .getAsJsonObject().get("state").getAsString());
        assertEquals(60, cycle.get("cycle_start").getAsInt());
        assertEquals("visibility_lost", cycle.get("state").getAsString());
        assertEquals("visibility_lost", cycle.getAsJsonArray("transitions").get(1)
                .getAsJsonObject().get("state").getAsString());
        assertEquals("observed-resource-state/1.1",
                farm.getAsJsonObject("resource_state_schema").get("schema").getAsString());
    }

    @Test
    void attributesEachLaneCreepDeathToOneCombatLogAndGoldEvent() {
        ProductAnalysis analysis = new ProductAnalysis("7.41d");
        analysis.accept(json("""
                {"type":"interval","slot":0,"time":34,"game_time_ms":34000,"event_seq":1,"unit":"CDOTA_Unit_Hero_Puck","x":158,"y":82,"life_state":0,"lh":0,"networth":900}
                """));
        analysis.accept(json("""
                {"type":"unit_enter","time":4,"game_time_ms":4000,"event_seq":10,"ehandle":101,"unit":"CDOTA_BaseNPC_Creep_Lane","unit_kind":"lane_creep","team":3,"x":160,"y":80,"hp":550,"max_hp":550,"life_state":0}
                """));
        analysis.accept(json("""
                {"type":"unit_state","time":35,"game_time_ms":35600,"event_seq":20,"ehandle":101,"unit":"CDOTA_BaseNPC_Creep_Lane","unit_kind":"lane_creep","team":3,"x":158,"y":82,"hp":0,"max_hp":550,"life_state":1}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DEATH","time":35,"game_time_ms":35600,"event_seq":25,"attackername":"npc_dota_hero_puck","targetname":"npc_dota_creep_badguys_melee","attackerhero":true,"targethero":false,"attacker_team":2,"target_team":3,"event_last_hits":1}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_GOLD","time":35,"game_time_ms":35600,"event_seq":26,"targetname":"npc_dota_hero_puck","value":38,"gold_reason":13}
                """));
        analysis.accept(json("""
                {"type":"unit_enter","time":5,"game_time_ms":5000,"event_seq":30,"ehandle":102,"unit":"CDOTA_BaseNPC_Creep_Lane","unit_kind":"lane_creep","team":3,"x":160,"y":80,"hp":550,"max_hp":550,"life_state":0}
                """));
        analysis.accept(json("""
                {"type":"unit_state","time":40,"game_time_ms":40000,"event_seq":31,"ehandle":102,"unit":"CDOTA_BaseNPC_Creep_Lane","unit_kind":"lane_creep","team":3,"x":158,"y":82,"hp":0,"max_hp":550,"life_state":1}
                """));

        JsonObject farm = analysis.build(60).getAsJsonObject("farm");
        JsonObject creep = farm.getAsJsonArray("creep_resolutions").get(0).getAsJsonObject();
        JsonObject wave = farm.getAsJsonArray("lane_waves").get(0).getAsJsonObject();

        assertEquals("confirmed_death_attributed", creep.get("resolution").getAsString());
        assertEquals("last_hit", creep.get("outcome").getAsString());
        assertEquals(0, creep.get("killer_slot").getAsInt());
        assertEquals(38, creep.get("observed_gold").getAsInt());
        assertEquals(1, wave.getAsJsonObject("last_hits_by_slot").get("0").getAsInt());
        assertEquals(38, wave.getAsJsonObject("observed_gold_by_slot").get("0").getAsInt());
        JsonObject unattributed = farm.getAsJsonArray("creep_resolutions").get(1).getAsJsonObject();
        assertEquals("confirmed_death_unattributed", unattributed.get("resolution").getAsString());
        assertEquals(38, unattributed.get("estimated_gold").getAsInt());
        assertEquals("same_match_observed_unit_kind_median",
                unattributed.get("gold_evidence").getAsString());
    }

    @Test
    void enablesRetrospectiveLaneRouteOnlyWhenUnitVisibilityAndRoleGatesPass() {
        ProductAnalysis analysis = new ProductAnalysis("7.41d");
        addLaneSnapshot(analysis, 0, "puck", 12, 28, 42, 4200);
        addLaneSnapshot(analysis, 1, "tusk", 15, 30, 6, 2100);
        addLaneSnapshot(analysis, 2, "bane", 84, 74, 5, 1900);
        addLaneSnapshot(analysis, 3, "axe", 47, 52, 46, 4700);
        addLaneSnapshot(analysis, 4, "drow_ranger", 82, 76, 51, 5000);
        addLaneSnapshot(analysis, 5, "centaur", 86, 72, 44, 4300);
        addLaneSnapshot(analysis, 6, "storm_spirit", 84, 70, 48, 4800);
        addLaneSnapshot(analysis, 7, "juggernaut", 82, 74, 55, 5200);
        addLaneSnapshot(analysis, 8, "crystal_maiden", 80, 72, 4, 1800);
        addLaneSnapshot(analysis, 9, "hoodwink", 78, 70, 7, 2200);
        for (int slot = 5; slot < 10; slot++) {
            analysis.accept(json(String.format(java.util.Locale.ROOT,
                    "{\"type\":\"interval\",\"slot\":%d,\"time\":60,\"unit\":\"CDOTA_Unit_Hero_%s\",\"x\":170,\"y\":95,\"life_state\":0,\"visible_by_team\":4,\"move_speed\":300}",
                    slot, List.of("centaur", "storm_spirit", "juggernaut", "crystal_maiden", "hoodwink").get(slot - 5))));
        }
        analysis.accept(json("""
                {"type":"unit_enter","time":20,"game_time_ms":20000,"event_seq":10,"ehandle":100,"unit":"CDOTA_BaseNPC_Creep_Lane","unit_kind":"lane_creep","team":3,"x":79.4,"y":156.2,"hp":550,"max_hp":550,"life_state":0}
                """));
        analysis.accept(json("""
                {"type":"unit_state","time":35,"game_time_ms":35000,"event_seq":20,"ehandle":100,"unit":"CDOTA_BaseNPC_Creep_Lane","unit_kind":"lane_creep","team":3,"x":79.4,"y":156.2,"hp":0,"max_hp":550,"life_state":1}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DEATH","time":35,"game_time_ms":35000,"event_seq":25,"attackername":"npc_dota_hero_puck","targetname":"npc_dota_creep_badguys_melee","attackerhero":true,"targethero":false,"attacker_team":2,"target_team":3}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_GOLD","time":35,"game_time_ms":35000,"event_seq":26,"targetname":"npc_dota_hero_puck","value":38,"gold_reason":13}
                """));
        analysis.accept(json("""
                {"type":"unit_enter","time":-90,"game_time_ms":-90000,"event_seq":60,"ehandle":300,"unit":"CDOTA_NeutralSpawner","unit_kind":"neutral","team":0,"x":81.92,"y":153.60}
                """));
        for (int index = 0; index < 2; index++) {
            int handle = 301 + index;
            int deathTime = 100 + index * 5;
            analysis.accept(json(String.format(java.util.Locale.ROOT,
                    "{\"type\":\"unit_enter\",\"time\":65,\"game_time_ms\":65000,\"event_seq\":%d,\"ehandle\":%d,\"unit\":\"CDOTA_BaseNPC_Creep_Neutral\",\"unit_kind\":\"neutral\",\"team\":4,\"x\":81.92,\"y\":153.60,\"hp\":400,\"max_hp\":400,\"life_state\":0}",
                    61 + index, handle)));
            analysis.accept(json(String.format(java.util.Locale.ROOT,
                    "{\"type\":\"unit_state\",\"time\":%d,\"game_time_ms\":%d000,\"event_seq\":%d,\"ehandle\":%d,\"unit\":\"CDOTA_BaseNPC_Creep_Neutral\",\"unit_kind\":\"neutral\",\"team\":4,\"x\":81.92,\"y\":153.60,\"hp\":0,\"max_hp\":400,\"life_state\":1}",
                    deathTime, deathTime, 63 + index, handle)));
            analysis.accept(json(String.format(java.util.Locale.ROOT,
                    "{\"type\":\"DOTA_COMBATLOG_DEATH\",\"time\":%d,\"game_time_ms\":%d000,\"event_seq\":%d,\"attackername\":\"npc_dota_hero_puck\",\"targetname\":\"npc_dota_neutral_centaur_outrunner\",\"attackerhero\":true,\"targethero\":false,\"attacker_team\":2,\"target_team\":4}",
                    deathTime, deathTime, 66 + index)));
            analysis.accept(json(String.format(java.util.Locale.ROOT,
                    "{\"type\":\"DOTA_COMBATLOG_GOLD\",\"time\":%d,\"game_time_ms\":%d000,\"event_seq\":%d,\"targetname\":\"npc_dota_hero_puck\",\"value\":25,\"gold_reason\":14}",
                    deathTime, deathTime, 68 + index)));
        }
        for (int index = 0; index < 2; index++) {
            int handle = 201 + index;
            int deathTime = 95 + index * 5;
            analysis.accept(json(String.format(java.util.Locale.ROOT,
                    "{\"type\":\"unit_enter\",\"time\":65,\"game_time_ms\":65000,\"event_seq\":%d,\"ehandle\":%d,\"unit\":\"CDOTA_BaseNPC_Creep_Lane\",\"unit_kind\":\"lane_creep\",\"team\":3,\"x\":79.4,\"y\":156.2,\"hp\":550,\"max_hp\":550,\"life_state\":0}",
                    30 + index, handle)));
            analysis.accept(json(String.format(java.util.Locale.ROOT,
                    "{\"type\":\"unit_state\",\"time\":%d,\"game_time_ms\":%d000,\"event_seq\":%d,\"ehandle\":%d,\"unit\":\"CDOTA_BaseNPC_Creep_Lane\",\"unit_kind\":\"lane_creep\",\"team\":3,\"x\":79.4,\"y\":156.2,\"hp\":0,\"max_hp\":550,\"life_state\":1}",
                    deathTime, deathTime, 40 + index, handle)));
            analysis.accept(json(String.format(java.util.Locale.ROOT,
                    "{\"type\":\"DOTA_COMBATLOG_DEATH\",\"time\":%d,\"game_time_ms\":%d000,\"event_seq\":%d,\"attackername\":\"npc_dota_goodguys_tower1_top\",\"targetname\":\"npc_dota_creep_badguys_melee\",\"attackerhero\":false,\"targethero\":false,\"attacker_team\":2,\"target_team\":3}",
                    deathTime, deathTime, 50 + index)));
        }

        JsonArray diagnostics = analysis.build(360).getAsJsonObject("farm")
                .getAsJsonObject("diagnostics_by_slot").getAsJsonArray("0");
        JsonObject enabled = null;
        for (JsonElement element : diagnostics) {
            JsonObject row = element.getAsJsonObject();
            if (row.get("recommendation_enabled").getAsBoolean()) {
                enabled = row;
                break;
            }
        }

        assertNotNull(enabled);
        assertEquals("complete", enabled.get("evidence_status").getAsString());
        assertEquals("retrospective-resource-route/1.2", enabled.get("route_model").getAsString());
        assertEquals("phase_baseline_then_hard_gates_then_highest_score",
                enabled.get("selection_policy").getAsString());
        assertEquals("collect_lane", enabled.get("recommendation").getAsString());
        assertEquals("none", enabled.get("route_blocker").getAsString());
        assertTrue(enabled.has("targetX"));
        boolean blockedEarlyCamp = false;
        for (JsonElement element : enabled.getAsJsonArray("candidates")) {
            JsonObject candidate = element.getAsJsonObject();
            if (candidate.get("kind").getAsString().equals("hold_jungle")
                    && candidate.has("blocker")
                    && candidate.get("blocker").getAsString().equals("pre10_jungle_clear_unproven")) {
                blockedEarlyCamp = true;
            }
        }
        assertTrue(blockedEarlyCamp);
    }

    @Test
    void extendsPhaseAwareRouteReviewToMatchEndForCorePositionsOnly() {
        ProductAnalysis analysis = new ProductAnalysis("7.41d");
        addLaneSnapshot(analysis, 0, "axe", 12, 28, 42, 4200);
        addLaneSnapshot(analysis, 1, "tusk", 15, 30, 6, 2100);
        addLaneSnapshot(analysis, 2, "bane", 84, 74, 5, 1900);
        addLaneSnapshot(analysis, 3, "puck", 47, 52, 46, 4700);
        addLaneSnapshot(analysis, 4, "drow_ranger", 82, 76, 51, 5000);
        addLaneSnapshot(analysis, 5, "centaur", 86, 72, 44, 4300);
        addLaneSnapshot(analysis, 6, "storm_spirit", 52, 47, 48, 4800);
        addLaneSnapshot(analysis, 7, "juggernaut", 14, 26, 55, 5200);
        addLaneSnapshot(analysis, 8, "crystal_maiden", 18, 24, 4, 1800);
        addLaneSnapshot(analysis, 9, "hoodwink", 83, 69, 7, 2200);
        addCombatSnapshot(analysis, 4, "drow_ranger", 55, 55, 1200);
        addCombatSnapshot(analysis, 5, "centaur", 56, 55, 1200);
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":1200,"attackername":"npc_dota_hero_drow_ranger","targetname":"npc_dota_hero_centaur","attackerhero":true,"targethero":true,"attacker_team":2,"target_team":3,"value":300}
                """));

        JsonObject farm = analysis.build(1500).getAsJsonObject("farm");
        JsonArray coreDiagnostics = farm.getAsJsonObject("diagnostics_by_slot").getAsJsonArray("4");
        JsonArray supportDiagnostics = farm.getAsJsonObject("diagnostics_by_slot").getAsJsonArray("2");
        JsonObject post20 = null;
        for (JsonElement element : coreDiagnostics) {
            JsonObject row = element.getAsJsonObject();
            if (row.get("time").getAsInt() >= 1200) {
                post20 = row;
                break;
            }
        }

        assertNotNull(post20);
        assertTrue(post20.get("post20_core_priority").getAsBoolean());
        assertEquals("core_route_20_30", post20.get("phase").getAsString());
        assertEquals(75, post20.get("route_lookahead_seconds").getAsInt());
        assertTrue(post20.get("benchmark_group").getAsString().startsWith("post20:"));
        assertEquals("context_exempt", post20.get("decision").getAsString());
        assertTrue(post20.get("strategic_commitment_exempt").getAsBoolean());
        assertFalse(post20.get("recommendation_enabled").getAsBoolean());
        for (JsonElement element : supportDiagnostics) {
            assertTrue(element.getAsJsonObject().get("time").getAsInt() < 1200);
        }
        assertEquals("match_end", farm.getAsJsonObject("route_analysis")
                .get("core_analysis_end").getAsString());
    }

    @Test
    void emitsSecondResolvedVisibilityAndHidesCurrentPositionAfterVisionIsLost() {
        ProductAnalysis analysis = new ProductAnalysis("7.41d");
        addCombatSnapshot(analysis, 0, "axe", 15, 85, 10);
        analysis.accept(json("""
                {"type":"interval","slot":5,"time":10,"unit":"CDOTA_Unit_Hero_Bane","x":128,"y":128,"life_state":0,"move_speed":300,"visible_by_team":4}
                """));
        analysis.accept(json("""
                {"type":"interval","slot":5,"time":11,"unit":"CDOTA_Unit_Hero_Bane","x":134,"y":128,"life_state":0,"move_speed":300,"visible_by_team":0}
                """));

        JsonObject vision = analysis.build(15).getAsJsonObject("vision");
        JsonArray intervals = vision.getAsJsonObject("visibility_by_team")
                .getAsJsonObject("radiant").getAsJsonObject("5").getAsJsonArray("intervals");

        assertTrue(intervals.toString().contains("confirmed"));
        assertTrue(intervals.toString().contains("last_seen"));
        assertFalse(vision.getAsJsonObject("visibility_schema")
                .get("hidden_current_position_exposed").getAsBoolean());
        JsonObject lastSeen = null;
        for (JsonElement element : intervals) {
            if (element.getAsJsonObject().get("state").getAsString().equals("last_seen")) {
                lastSeen = element.getAsJsonObject();
                break;
            }
        }
        assertNotNull(lastSeen);
        assertEquals(50.0, lastSeen.get("start_x").getAsDouble(), 0.1);
        assertTrue(lastSeen.get("uncertainty_end_pct").getAsDouble() > 0);
    }

    @Test
    void blocksGeometricVisionWhileSmokeIsActive() {
        ProductAnalysis analysis = new ProductAnalysis("7.41d");
        analysis.accept(json("""
                {"type":"interval","slot":0,"time":10,"unit":"CDOTA_Unit_Hero_Axe","x":128,"y":128,"z":128,"life_state":0,"day_vision_range":1800}
                """));
        analysis.accept(json("""
                {"type":"interval","slot":5,"time":10,"unit":"CDOTA_Unit_Hero_Bane","x":130,"y":128,"z":128,"life_state":0,"move_speed":300}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_MODIFIER_ADD","time":9,"event_seq":20,"targetname":"npc_dota_hero_bane","targethero":true,"inflictor":"modifier_smoke_of_deceit","invisibility_modifier":true}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_MODIFIER_REMOVE","time":11,"event_seq":30,"targetname":"npc_dota_hero_bane","targethero":true,"inflictor":"modifier_smoke_of_deceit","invisibility_modifier":true}
                """));

        JsonObject vision = analysis.build(12).getAsJsonObject("vision");
        JsonArray intervals = vision.getAsJsonObject("visibility_by_team")
                .getAsJsonObject("radiant").getAsJsonObject("5").getAsJsonArray("intervals");

        assertTrue(intervals.toString().contains("fog_state_unavailable"));
        assertTrue(intervals.toString().contains("allied_hero_vision_geometry"));
        assertEquals("continuous-enemy-visibility/1.1",
                vision.getAsJsonObject("visibility_schema").get("schema").getAsString());
        assertTrue(vision.getAsJsonObject("visibility_schema").get("smoke_modeled").getAsBoolean());
    }

    @Test
    void suppressesNoSpellBlameWhenCooldownBlocksEveryObservedOpportunity() {
        ProductAnalysis analysis = responsibilityFight(8.0, 100, 800);
        JsonObject contribution = contributionForSlot(analysis.build(610), 0);

        assertEquals("blocked", contribution.getAsJsonObject("responsibility_gate")
                .get("status").getAsString());
        assertFalse(contribution.getAsJsonArray("issues").toString().contains("no_spell_output"));
        assertTrue(contribution.getAsJsonObject("responsibility_gate")
                .getAsJsonObject("blockers").get("cooldown").getAsInt() > 0);
    }

    @Test
    void allowsNoSpellJudgmentOnlyWhenHardOpportunityGatesPass() {
        ProductAnalysis analysis = responsibilityFight(0.0, 100, 800);
        JsonObject contribution = contributionForSlot(analysis.build(610), 0);

        assertEquals("passed", contribution.getAsJsonObject("responsibility_gate")
                .get("status").getAsString());
        assertTrue(contribution.getAsJsonObject("responsibility_gate")
                .get("opportunity_seconds").getAsInt() >= 2);
        assertTrue(contribution.getAsJsonArray("issues").toString().contains("no_spell_output"));
    }

    @Test
    void marksResponsibilityEvidenceInsufficientWhenCastRangeIsUnknown() {
        ProductAnalysis analysis = responsibilityFight(0.0, 100, 0, "7.40c");
        JsonObject contribution = contributionForSlot(analysis.build(610), 0);

        assertEquals("insufficient_evidence", contribution.getAsJsonObject("responsibility_gate")
                .get("status").getAsString());
        assertFalse(contribution.getAsJsonArray("issues").toString().contains("no_spell_output"));
    }

    private static JsonObject json(String value) {
        return JsonParser.parseString(value).getAsJsonObject();
    }

    private static JsonObject snapshotAt(JsonObject modules, int slot, int index) {
        JsonObject packed = modules.getAsJsonObject("snapshots");
        JsonArray fields = packed.getAsJsonArray("fields");
        JsonArray regions = packed.getAsJsonArray("regions");
        JsonArray values = packed.getAsJsonObject("by_slot").getAsJsonArray(Integer.toString(slot))
                .get(index).getAsJsonArray();
        JsonObject row = new JsonObject();
        for (int fieldIndex = 0; fieldIndex < fields.size(); fieldIndex++) {
            String field = fields.get(fieldIndex).getAsString();
            JsonElement value = values.get(fieldIndex);
            if (value == null || value.isJsonNull()) continue;
            if (field.equals("region")) row.addProperty(field,
                    regions.get(value.getAsInt()).getAsString());
            else row.add(field, value.deepCopy());
        }
        row.addProperty("coordinate_valid", row.has("x") && row.has("y"));
        return row;
    }

    private static ProductAnalysis responsibilityFight(double cooldown, int mana, int castRange) {
        return responsibilityFight(cooldown, mana, castRange, "7.41d");
    }

    private static ProductAnalysis responsibilityFight(double cooldown, int mana, int castRange,
            String patch) {
        ProductAnalysis analysis = new ProductAnalysis(patch);
        for (int time = 600; time <= 603; time++) {
            analysis.accept(json(String.format(java.util.Locale.ROOT,
                    "{\"type\":\"interval\",\"slot\":0,\"time\":%d,\"unit\":\"CDOTA_Unit_Hero_Axe\",\"x\":128,\"y\":128,\"life_state\":0,\"mana\":%d,\"networth\":7000,\"hero_abilities\":[{\"id\":\"axe_battle_hunger\",\"ability_level\":1,\"cooldown\":%.1f,\"cooldown_length\":16,\"mana_cost\":80,\"cast_range\":%d}]} ",
                    time, mana, cooldown, castRange)));
            analysis.accept(json(String.format(java.util.Locale.ROOT,
                    "{\"type\":\"interval\",\"slot\":5,\"time\":%d,\"unit\":\"CDOTA_Unit_Hero_Bane\",\"x\":130,\"y\":128,\"life_state\":0,\"networth\":6500}",
                    time)));
        }
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":600,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_hero_bane","attackerhero":true,"targethero":true,"value":400}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":601,"attackername":"npc_dota_hero_bane","targetname":"npc_dota_hero_axe","attackerhero":true,"targethero":true,"value":320}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DEATH","time":603,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_hero_bane","attackerhero":true,"targethero":true}
                """));
        return analysis;
    }

    private static JsonObject contributionForSlot(JsonObject modules, int slot) {
        JsonArray contributions = modules.getAsJsonObject("combat").getAsJsonArray("fights")
                .get(0).getAsJsonObject().getAsJsonArray("contributions");
        for (JsonElement element : contributions) {
            JsonObject contribution = element.getAsJsonObject();
            if (contribution.get("slot").getAsInt() == slot) return contribution;
        }
        throw new AssertionError("contribution missing for slot " + slot);
    }

    private static ProductAnalysis towerFight(boolean towerHit) {
        ProductAnalysis analysis = new ProductAnalysis("7.41");
        addCombatSnapshot(analysis, 0, "axe", 84, 60, 600);
        addCombatSnapshot(analysis, 5, "bane", 84, 60, 600);
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":600,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_hero_bane","attackerhero":true,"targethero":true,"attacker_team":2,"target_team":3,"value":520}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":601,"attackername":"npc_dota_hero_bane","targetname":"npc_dota_hero_axe","attackerhero":true,"targethero":true,"attacker_team":3,"target_team":2,"value":340}
                """));
        if (towerHit) {
            analysis.accept(json("""
                    {"type":"DOTA_COMBATLOG_DAMAGE","time":601,"attackername":"npc_dota_badguys_tower1_bot","targetname":"npc_dota_hero_axe","attackerhero":false,"targethero":true,"attacker_team":3,"target_team":2,"value":96}
                    """));
        }
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DEATH","time":603,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_hero_bane","attackerhero":true,"targethero":true,"attacker_team":2,"target_team":3}
                """));
        return analysis;
    }

    private static ProductAnalysis pitFight(double y) {
        ProductAnalysis analysis = new ProductAnalysis("7.41");
        addCombatSnapshot(analysis, 0, "axe", 27, y, 600);
        addCombatSnapshot(analysis, 5, "bane", 27, y, 600);
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":600,"attackername":"npc_dota_hero_axe","targetname":"npc_dota_hero_bane","attackerhero":true,"targethero":true,"attacker_team":2,"target_team":3,"value":520}
                """));
        analysis.accept(json("""
                {"type":"DOTA_COMBATLOG_DAMAGE","time":601,"attackername":"npc_dota_hero_bane","targetname":"npc_dota_hero_axe","attackerhero":true,"targethero":true,"attacker_team":3,"target_team":2,"value":340}
                """));
        return analysis;
    }

    private static void addLaneSnapshot(ProductAnalysis analysis, int slot, String hero, double x, double y,
            int lastHits, int networth) {
        double rawX = 64 + x * 1.28;
        double rawY = 192 - y * 1.28;
        analysis.accept(json(String.format(java.util.Locale.ROOT,
                "{\"type\":\"interval\",\"slot\":%d,\"time\":60,\"unit\":\"CDOTA_Unit_Hero_%s\",\"x\":%.1f,\"y\":%.1f,\"life_state\":0,\"level\":2,\"lh\":%d,\"networth\":%d}",
                slot, hero, rawX, rawY, Math.max(0, lastHits / 10), Math.max(600, networth / 3))));
        analysis.accept(json(String.format(java.util.Locale.ROOT,
                "{\"type\":\"interval\",\"slot\":%d,\"time\":300,\"unit\":\"CDOTA_Unit_Hero_%s\",\"x\":%.1f,\"y\":%.1f,\"life_state\":0,\"level\":6,\"lh\":%d,\"networth\":%d}",
                slot, hero, rawX, rawY, lastHits, networth)));
    }

    private static void addCombatSnapshot(ProductAnalysis analysis, int slot, String hero,
            double x, double y, int time) {
        double rawX = 64 + x * 1.28;
        double rawY = 192 - y * 1.28;
        analysis.accept(json(String.format(java.util.Locale.ROOT,
                "{\"type\":\"interval\",\"slot\":%d,\"time\":%d,\"unit\":\"CDOTA_Unit_Hero_%s\",\"x\":%.2f,\"y\":%.2f,\"life_state\":0,\"level\":10,\"networth\":7000}",
                slot, time, hero, rawX, rawY)));
    }
}
