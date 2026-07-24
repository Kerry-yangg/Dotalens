package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;

import org.junit.jupiter.api.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

class PlayerReportNarrativeV3Test {
    @Test
    void keepsSupportAdviceOnSupportResponsibilitiesEvenWhenFarmRouteExists() {
        JsonObject modules = new JsonObject();
        JsonObject players = new JsonObject();
        JsonObject bySlot = new JsonObject();
        bySlot.add("0", playerFacts(0, 4, -22, 390, 10_500));
        bySlot.add("5", playerFacts(5, 4, 22, 410, 11_000));
        players.add("by_slot", bySlot);
        modules.add("players", players);

        JsonObject laning = new JsonObject();
        JsonObject matchups = new JsonObject();
        matchups.addProperty("0", 5);
        matchups.addProperty("5", 0);
        laning.add("matchup_slot_by_slot", matchups);
        JsonObject reviews = new JsonObject();
        reviews.add("0", supportLaneReview());
        laning.add("reviews_by_slot", reviews);
        modules.add("laning", laning);

        JsonObject farm = new JsonObject();
        JsonObject diagnostics = new JsonObject();
        JsonArray supportDiagnostics = new JsonArray();
        JsonObject route = new JsonObject();
        route.addProperty("id", "diagnostic-support-must-not-use");
        route.addProperty("time", 1260);
        route.addProperty("end", 1290);
        route.addProperty("recommendation_enabled", true);
        route.addProperty("confidence", 92);
        route.addProperty("actual", "hold_jungle");
        route.addProperty("recommendation", "collect_lane");
        route.addProperty("actualGold", 90);
        route.addProperty("suggestedGold", 360);
        supportDiagnostics.add(route);
        diagnostics.add("0", supportDiagnostics);
        farm.add("diagnostics_by_slot", diagnostics);
        modules.add("farm", farm);

        PlayerReportAnalysis.enrich(modules, null, 1800);

        JsonObject report = bySlot.getAsJsonObject("0").getAsJsonObject("report");
        assertNotNull(report);
        assertEquals("player-report/3.0", report.get("model").getAsString());
        assertEquals(10, report.getAsJsonArray("dimensions").size());
        JsonObject supportAdvice = findInsight(report, "lane_support_route", "improvement");
        assertNotNull(supportAdvice);
        assertTrue(supportAdvice.get("action").getAsString().contains("3号位"));
        assertTrue(supportAdvice.get("fact").getAsString().contains("离线收益"));
        assertFalse(hasInsight(report, "farm_route"));
        assertFalse(report.toString().contains("先收会消失的安全兵线"));
        assertTrue(supportAdvice.getAsJsonArray("evidence_refs").size() > 0);
        assertTrue(report.getAsJsonObject("brief").getAsJsonArray("priorities")
                .contains(supportAdvice.get("id")));
    }

    @Test
    void excludesMissingDimensionsFromTheWeightedOverallScore() {
        JsonObject modules = new JsonObject();
        JsonObject players = new JsonObject();
        JsonObject bySlot = new JsonObject();
        bySlot.add("0", playerFacts(0, 1, 24, 620, 21_000));
        bySlot.add("5", playerFacts(5, 1, -24, 520, 17_000));
        players.add("by_slot", bySlot);
        modules.add("players", players);

        JsonObject laning = new JsonObject();
        JsonObject matchups = new JsonObject();
        matchups.addProperty("0", 5);
        matchups.addProperty("5", 0);
        laning.add("matchup_slot_by_slot", matchups);
        modules.add("laning", laning);

        PlayerReportAnalysis.enrich(modules, null, 1800);

        JsonObject report = bySlot.getAsJsonObject("0").getAsJsonObject("report");
        JsonObject duty = findDimension(report, "combat_duty");
        assertNotNull(duty);
        assertFalse(duty.get("available").getAsBoolean());
        assertFalse(duty.has("score"));
        assertFalse(duty.has("score_impact"));

        int weighted = 0;
        int availableWeight = 0;
        for (JsonElement element : report.getAsJsonArray("dimensions")) {
            JsonObject dimension = element.getAsJsonObject();
            if (!dimension.get("available").getAsBoolean()) continue;
            int weight = dimension.get("weight").getAsInt();
            weighted += dimension.get("score").getAsInt() * weight;
            availableWeight += weight;
        }
        assertTrue(availableWeight < 100);
        assertEquals(availableWeight, report.get("available_weight").getAsInt());
        assertEquals(Math.round(weighted / (float) availableWeight),
                report.get("overall_score").getAsInt());
        assertEquals(availableWeight,
                report.getAsJsonObject("score_card").get("available_weight").getAsInt());
    }

    @Test
    void scoresCombatDutyOnlyFromPassedResponsibilityGates() {
        JsonObject modules = new JsonObject();
        JsonObject players = new JsonObject();
        JsonObject bySlot = new JsonObject();
        bySlot.add("0", playerFacts(0, 3, 12, 510, 17_500));
        bySlot.add("5", playerFacts(5, 3, -12, 500, 17_000));
        players.add("by_slot", bySlot);
        modules.add("players", players);

        JsonObject combat = new JsonObject();
        JsonArray fights = new JsonArray();
        fights.add(fight("fight-blocked", "blocked", 15, 95));
        fights.add(fight("fight-passed", "passed", 82, 88));
        combat.add("fights", fights);
        modules.add("combat", combat);

        PlayerReportAnalysis.enrich(modules, null, 1800);

        JsonObject report = bySlot.getAsJsonObject("0").getAsJsonObject("report");
        JsonObject duty = findDimension(report, "combat_duty");
        assertNotNull(duty);
        assertTrue(duty.get("available").getAsBoolean());
        JsonObject passedMetric = findMetric(duty, "passed_duty_fights");
        JsonObject scoreMetric = findMetric(duty, "fight_score");
        assertEquals(1, passedMetric.get("value").getAsInt());
        assertEquals(82, scoreMetric.get("value").getAsInt());
        JsonArray components = duty.getAsJsonArray("behavior_components");
        assertFalse(components.isEmpty());
        JsonObject component = components.get(0).getAsJsonObject();
        assertTrue(component.get("impact").getAsDouble() > 0);
        assertEquals("combat:fight-passed:0", component.get("root_cause_id").getAsString());
        JsonObject linkedInsight = findInsight(report, "combat_duty", "strength");
        assertNotNull(linkedInsight);
        assertEquals(linkedInsight.get("id").getAsString(), component.get("insight_id").getAsString());
        assertEquals(component.get("root_cause_id").getAsString(),
                linkedInsight.get("root_cause_id").getAsString());
    }

    @Test
    void mergesDeathItemObjectiveAndVisionConsequencesIntoOneCombatRootCause() {
        JsonObject modules = new JsonObject();
        JsonObject players = new JsonObject();
        JsonObject bySlot = new JsonObject();
        bySlot.add("0", playerFacts(0, 4, -8, 390, 12_500));
        bySlot.add("5", playerFacts(5, 4, 8, 410, 13_000));
        players.add("by_slot", bySlot);
        modules.add("players", players);

        JsonObject combat = new JsonObject();
        JsonArray fights = new JsonArray();
        JsonObject fight = fight("fight-root", "passed", 28, 92);
        fight.addProperty("radiant_deaths", 3);
        fight.addProperty("dire_deaths", 0);
        fight.addProperty("total_damage", 14_000);
        fight.addProperty("region", "roshan_pit");
        JsonObject importance = new JsonObject();
        importance.addProperty("important", true);
        fight.add("importance", importance);
        JsonObject teamVision = new JsonObject();
        teamVision.addProperty("observer_coverage", false);
        teamVision.addProperty("setup_observers", 0);
        teamVision.addProperty("nearby_observers", 0);
        teamVision.addProperty("combat_log_visibility_pct", 62);
        JsonObject enemyVision = new JsonObject();
        enemyVision.addProperty("observer_coverage", true);
        JsonObject vision = new JsonObject();
        vision.add("radiant", teamVision);
        vision.add("dire", enemyVision);
        fight.add("vision", vision);
        fight.getAsJsonArray("contributions").get(0).getAsJsonObject()
                .addProperty("sentryCheckRequired", true);
        fights.add(fight);
        combat.add("fights", fights);
        modules.add("combat", combat);

        JsonObject timeline = new JsonObject();
        JsonArray events = new JsonArray();
        events.add(timelineEvent("timeline-death", "hero_death", 908, 5, 0, 0));
        JsonObject deathLoss = timelineEvent("timeline-death-loss", "gold", 908, 0, -1, -260);
        deathLoss.addProperty("source", "death_loss");
        events.add(deathLoss);
        JsonObject objective = timelineEvent("timeline-roshan", "objective", 950, -1, -1, 0);
        objective.addProperty("attackerTeam", 3);
        objective.addProperty("objective_kind", "roshan");
        objective.addProperty("region", "roshan_pit");
        events.add(objective);
        timeline.add("events", events);
        modules.add("timeline", timeline);

        JsonObject build = new JsonObject();
        JsonObject buildBySlot = new JsonObject();
        JsonObject playerBuild = new JsonObject();
        JsonArray purchases = new JsonArray();
        JsonObject purchase = timelineEvent("", "purchase", 1180, 0, -1, 0);
        purchase.addProperty("key", "force_staff");
        purchases.add(purchase);
        playerBuild.add("purchases", purchases);
        buildBySlot.add("0", playerBuild);
        build.add("by_slot", buildBySlot);
        modules.add("build", build);

        PlayerReportAnalysis.enrich(modules, null, 1800);

        JsonObject report = bySlot.getAsJsonObject("0").getAsJsonObject("report");
        JsonObject root = findRootCause(report, "combat:fight-root:0");
        assertNotNull(root);
        assertEquals(4, root.get("consequence_count").getAsInt());
        assertNotNull(findConsequence(root, "death"));
        assertNotNull(findConsequence(root, "item_delay"));
        assertNotNull(findConsequence(root, "objective_loss"));
        JsonObject visionGap = findConsequence(root, "vision_gap");
        assertNotNull(visionGap);
        assertTrue(visionGap.get("personal_penalty_applied").getAsBoolean());
        assertEquals(1, report.getAsJsonObject("score_card").getAsJsonObject("root_cause_summary")
                .get("improvement_root_count").getAsInt());

        JsonObject insight = findInsight(report, "combat_duty", "improvement");
        assertNotNull(insight);
        assertEquals(root.get("id").getAsString(), insight.get("root_cause_id").getAsString());
        assertEquals(4, insight.getAsJsonArray("consequence_types").size());
        assertTrue(insight.getAsJsonObject("dimension_impacts").has("survival_risk"));
        assertTrue(insight.getAsJsonObject("dimension_impacts").has("map_tempo"));
        assertTrue(insight.getAsJsonObject("dimension_impacts").has("objective_conversion"));
        assertTrue(insight.getAsJsonObject("dimension_impacts").has("vision_team"));
    }

    @Test
    void capsOneRootCauseWeightedPenaltyAtSixOverallPoints() {
        JsonObject impacts = new JsonObject();
        impacts.addProperty("combat_duty", -25);
        impacts.addProperty("survival_risk", -25);
        impacts.addProperty("objective_conversion", -25);
        impacts.addProperty("vision_team", -25);
        Map<String, Double> weights = Map.of(
                "combat_duty", 0.4,
                "survival_risk", 0.3,
                "objective_conversion", 0.2,
                "vision_team", 0.1);

        PlayerReportRootCauseAnalysis.CapResult result =
                PlayerReportRootCauseAnalysis.capDimensionImpacts(impacts, weights);

        assertTrue(result.summary().get("applied").getAsBoolean());
        assertEquals(25.0, result.summary().get("raw_negative_overall").getAsDouble(), 0.001);
        assertEquals(6.0, result.summary().get("capped_negative_overall").getAsDouble(), 0.001);
        assertTrue(Math.abs(result.cappedImpacts().get("combat_duty").getAsDouble()) < 25);
    }

    private static JsonObject playerFacts(int slot, int position, int laneScore, int gpm, int networth) {
        JsonObject facts = new JsonObject();
        facts.addProperty("slot", slot);
        facts.addProperty("position", position);
        facts.addProperty("role_confidence", 94);
        facts.addProperty("lane_score", laneScore);
        facts.addProperty("lane_confidence", 88);
        facts.addProperty("gpm", gpm);
        facts.addProperty("networth", networth);
        facts.addProperty("hero_damage", 12_000);
        facts.addProperty("damage_taken", 18_000);
        facts.addProperty("control_seconds", 8);
        facts.addProperty("assists", 14);
        facts.addProperty("deaths", 5);
        facts.addProperty("actions_per_min", 180);
        facts.addProperty("aggregate_observer_wards", 5);
        facts.addProperty("aggregate_sentry_wards", 8);
        facts.addProperty("dewards", 3);
        facts.addProperty("teleport_uses", 6);
        facts.addProperty("aggregate_rune_pickups", 2);
        facts.addProperty("aggregate_camps_stacked", 1);
        facts.add("lane_opportunity_summary", new JsonObject());
        facts.add("stack_value_summary", new JsonObject());

        JsonArray phases = new JsonArray();
        phases.add(phase("laning", 0, 600, 1500, 3, 1, 4));
        phases.add(phase("mid_game", 600, 1200, 2300, 2, 2, 7));
        phases.add(phase("late_game", 1200, 1800, 3500, 2, 2, 9));
        facts.add("phases", phases);
        return facts;
    }

    private static JsonObject phase(String name, int start, int end, int networthGain,
            int kills, int deaths, int assists) {
        JsonObject phase = new JsonObject();
        phase.addProperty("phase", name);
        phase.addProperty("start", start);
        phase.addProperty("end", end);
        phase.addProperty("networth_gain", networthGain);
        phase.addProperty("xp_gain", networthGain * 2);
        phase.addProperty("last_hits", 12);
        phase.addProperty("kills", kills);
        phase.addProperty("deaths", deaths);
        phase.addProperty("assists", assists);
        phase.addProperty("damage_dealt", networthGain);
        phase.addProperty("damage_taken", networthGain * 2);
        return phase;
    }

    private static JsonObject supportLaneReview() {
        JsonObject review = new JsonObject();
        review.addProperty("slot", 0);
        review.addProperty("position", 4);
        review.addProperty("lane", "bottom");
        review.addProperty("score", -22);
        review.addProperty("verdict", "disadvantage");
        review.addProperty("confidence", 88);

        JsonObject route = new JsonObject();
        route.addProperty("away_seconds", 120);
        route.addProperty("core_deaths_away", 1);
        route.addProperty("wards", 1);
        route.addProperty("away_assists", 2);
        route.addProperty("stacks", 0);
        route.addProperty("runes", 0);
        route.addProperty("away_kills", 0);
        review.add("support_route", route);

        JsonObject checkpoint = new JsonObject();
        checkpoint.addProperty("time", 600);
        checkpoint.addProperty("score", -18);
        checkpoint.addProperty("verdict", "disadvantage");
        checkpoint.addProperty("last_hits_diff", -5);
        checkpoint.addProperty("level_diff", -1);
        checkpoint.addProperty("core_xp_diff", -700);
        checkpoint.addProperty("pair_xp_diff", -300);
        checkpoint.addProperty("support_xp_diff", 400);
        checkpoint.addProperty("networth_diff", -450);
        JsonArray checkpoints = new JsonArray();
        checkpoints.add(checkpoint);
        review.add("checkpoints", checkpoints);
        return review;
    }

    private static JsonObject fight(String id, String gateStatus, int score, int confidence) {
        JsonObject fight = new JsonObject();
        fight.addProperty("id", id);
        fight.addProperty("kind", "teamfight");
        fight.addProperty("start", 900);
        fight.addProperty("end", 920);
        fight.addProperty("contact_start", 902);
        fight.addProperty("contact_end", 918);
        JsonObject contribution = new JsonObject();
        contribution.addProperty("slot", 0);
        contribution.addProperty("teamDamageShare", 28);
        contribution.addProperty("killConversion", 70);
        contribution.addProperty("presencePct", 85);
        contribution.addProperty("responsibilityScore", score);
        contribution.addProperty("confidence", confidence);
        JsonObject gate = new JsonObject();
        gate.addProperty("status", gateStatus);
        contribution.add("responsibility_gate", gate);
        JsonArray contributions = new JsonArray();
        contributions.add(contribution);
        fight.add("contributions", contributions);
        return fight;
    }

    private static JsonObject timelineEvent(String id, String kind, int time, int actorSlot,
            int targetSlot, int value) {
        JsonObject event = new JsonObject();
        if (!id.isBlank()) event.addProperty("id", id);
        event.addProperty("kind", kind);
        event.addProperty("time", time);
        event.addProperty("game_time_ms", time * 1000L);
        event.addProperty("event_seq", time);
        if (actorSlot >= 0) event.addProperty("actor_slot", actorSlot);
        if (targetSlot >= 0) event.addProperty("target_slot", targetSlot);
        event.addProperty("value", value);
        return event;
    }

    private static JsonObject findRootCause(JsonObject report, String id) {
        for (JsonElement element : report.getAsJsonArray("root_causes")) {
            JsonObject root = element.getAsJsonObject();
            if (id.equals(root.get("id").getAsString())) return root;
        }
        return null;
    }

    private static JsonObject findConsequence(JsonObject root, String type) {
        for (JsonElement element : root.getAsJsonArray("consequences")) {
            JsonObject consequence = element.getAsJsonObject();
            if (type.equals(consequence.get("type").getAsString())) return consequence;
        }
        return null;
    }

    private static JsonObject findDimension(JsonObject report, String key) {
        for (JsonElement element : report.getAsJsonArray("dimensions")) {
            JsonObject dimension = element.getAsJsonObject();
            if (key.equals(dimension.get("key").getAsString())) return dimension;
        }
        return null;
    }

    private static JsonObject findMetric(JsonObject dimension, String key) {
        for (JsonElement element : dimension.getAsJsonArray("evidence")) {
            JsonObject metric = element.getAsJsonObject();
            if (key.equals(metric.get("key").getAsString())) return metric;
        }
        return null;
    }

    private static JsonObject findInsight(JsonObject report, String category, String kind) {
        for (JsonElement element : report.getAsJsonArray("insights")) {
            JsonObject insight = element.getAsJsonObject();
            if (category.equals(insight.get("category").getAsString())
                    && kind.equals(insight.get("kind").getAsString())) {
                return insight;
            }
        }
        return null;
    }

    private static boolean hasInsight(JsonObject report, String category) {
        return findInsight(report, category, "improvement") != null
                || findInsight(report, category, "strength") != null;
    }
}
