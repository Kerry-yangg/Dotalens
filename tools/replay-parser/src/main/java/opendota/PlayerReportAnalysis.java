package opendota;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

final class PlayerReportAnalysis {
    static final String SCHEMA = "player-report/3.0";

    private PlayerReportAnalysis() {
    }

    static void enrich(JsonObject modules, JsonObject match, int duration) {
        JsonObject playerModule = object(modules, "players");
        JsonObject bySlot = object(playerModule, "by_slot");
        if (bySlot == null) return;

        mergeMatchPlayers(bySlot, match == null ? null : match.getAsJsonArray("players"));
        JsonObject laning = object(modules, "laning");
        JsonObject matchups = laning == null ? null : object(laning, "matchup_slot_by_slot");

        for (int slot = 0; slot < 10; slot++) {
            JsonObject facts = object(bySlot, Integer.toString(slot));
            if (facts == null) continue;
            int position = clamp(intValue(facts, "position", slot % 5 + 1), 1, 5);
            int counterpart = matchupSlot(matchups, slot, position);
            int roleCounterpart = roleCounterpartSlot(bySlot, slot, position);
            JsonObject opponent = object(bySlot, Integer.toString(counterpart));
            JsonObject roleOpponent = object(bySlot, Integer.toString(roleCounterpart));
            BaseScores base = baseScores(modules, facts, opponent, roleOpponent, bySlot,
                    slot, position, duration);
            Profile profile = profile(position);

            List<DimensionResult> dimensions = new ArrayList<>();
            int weightedScore = 0;
            int availableWeight = 0;
            int weightedConfidence = 0;
            for (DimensionSpec spec : profile.dimensions) {
                DimensionScore score = base.dimension(spec.source);
                dimensions.add(new DimensionResult(spec.key, spec.source, spec.weight, score));
                if (!score.available) continue;
                weightedScore += score.score * spec.weight;
                weightedConfidence += score.confidence * spec.weight;
                availableWeight += spec.weight;
            }
            int overall = availableWeight == 0 ? 0
                    : clamp((int) Math.round(weightedScore / (double) availableWeight), 0, 100);
            int dimensionConfidence = availableWeight == 0 ? 0
                    : clamp((int) Math.round(weightedConfidence / (double) availableWeight), 0, 100);
            int reportConfidence = availableWeight == 0 ? 0
                    : Math.min(confidence(facts), dimensionConfidence);
            int availableDimensions = (int) dimensions.stream()
                    .filter(item -> item.score.available).count();
            List<DimensionResult> rankedDimensions = dimensions.stream()
                    .filter(item -> item.score.available)
                    .sorted(Comparator.comparingInt((DimensionResult item) -> item.score.score).reversed())
                    .toList();

            JsonObject report = new JsonObject();
            report.addProperty("model", SCHEMA);
            report.addProperty("scope", "single_match_relative");
            report.addProperty("slot", slot);
            report.addProperty("position", position);
            report.addProperty("role_code", "position_" + position);
            report.addProperty("role_confidence", intValue(facts, "role_confidence", 0));
            report.addProperty("counterpart_slot", counterpart);
            report.addProperty("role_counterpart_slot", roleCounterpart);
            report.addProperty("overall_score", overall);
            report.addProperty("grade", intValue(facts, "role_confidence", 0) >= 65
                    && availableWeight > 0 ? grade(overall) : "-");
            report.addProperty("confidence", reportConfidence);
            report.addProperty("evidence_level", availableDimensions == 10 && reportConfidence >= 75
                    ? "full" : availableDimensions > 0 ? "partial" : "missing");
            report.addProperty("dimension_coverage", availableDimensions);
            report.addProperty("dimension_target", 10);
            report.addProperty("available_weight", availableWeight);
            report.addProperty("combat_responsibility_basis", "position_specific_hard_gated_fight_scores");
            report.addProperty("farm_responsibility_basis", position <= 3
                    ? "secured_and_reviewable_lane_units" : "team_value_and_resource_discipline");

            JsonArray dimensionRows = new JsonArray();
            for (DimensionSpec spec : profile.dimensions) {
                DimensionResult result = dimensions.stream()
                        .filter(item -> item.key.equals(spec.key)).findFirst().orElseThrow();
                JsonObject row = new JsonObject();
                row.addProperty("key", result.key);
                row.addProperty("source", result.source);
                row.addProperty("weight", result.weight);
                row.addProperty("effective_weight", result.score.available && availableWeight > 0
                        ? round1(result.weight * 100.0 / availableWeight) : 0);
                row.addProperty("available", result.score.available);
                row.addProperty("confidence", result.score.confidence);
                row.addProperty("evidence_level", result.score.evidenceLevel);
                if (result.score.available) {
                    row.addProperty("score", result.score.score);
                    row.addProperty("status", result.score.score >= 75 ? "strength"
                            : result.score.score >= 55 ? "stable" : "improve");
                } else {
                    row.addProperty("status", "missing");
                }
                JsonArray missing = new JsonArray();
                result.score.missing.forEach(missing::add);
                row.add("missing", missing);
                row.add("evidence", evidence(result.source, modules, facts, opponent,
                        roleOpponent, bySlot, slot, position, duration));
                dimensionRows.add(row);
            }
            report.add("dimensions", dimensionRows);
            JsonArray phaseScores = scorePhases(facts, opponent, bySlot, slot, position, base);
            report.add("phase_scores", phaseScores);

            JsonArray strengths = new JsonArray();
            rankedDimensions.stream().limit(2).forEach(item -> strengths.add(item.key));
            report.add("strengths", strengths);
            JsonArray improvements = new JsonArray();
            rankedDimensions.stream()
                    .sorted(Comparator.comparingInt(item -> item.score.score)).limit(2)
                    .forEach(item -> improvements.add(item.key));
            report.add("improvements", improvements);
            PlayerReportNarrativeV3.enrich(modules, report, facts, slot, position, counterpart,
                    reportConfidence, overall, dimensionRows, phaseScores);
            facts.add("report", report);
        }

        playerModule.addProperty("schema", SCHEMA);
        playerModule.add("role_profiles", roleProfiles());
        JsonArray caveats = new JsonArray();
        caveats.add("no_cross_match_percentile");
        caveats.add("role_inferred_from_first_10_minutes");
        caveats.add("ability_opportunities_require_exact_patch_metadata");
        caveats.add("route_scores_are_retrospective_not_live_navigation");
        caveats.add("score_requires_human_review_for_hero_specific_duties");
        playerModule.add("caveats", caveats);
    }

    private static void mergeMatchPlayers(JsonObject bySlot, JsonArray players) {
        if (players == null) return;
        for (JsonElement element : players) {
            if (!element.isJsonObject()) continue;
            JsonObject player = element.getAsJsonObject();
            int slot = normalizedSlot(intValue(player, "player_slot", -1));
            JsonObject facts = object(bySlot, Integer.toString(slot));
            if (slot < 0 || facts == null) continue;
            copy(facts, player, "account_id", "account_id");
            copy(facts, player, "hero_id", "hero_id");
            copy(facts, player, "personaname", "personaname");
            copy(facts, player, "kills", "kills");
            copy(facts, player, "deaths", "deaths");
            copy(facts, player, "assists", "assists");
            copy(facts, player, "last_hits", "last_hits");
            copy(facts, player, "denies", "denies");
            copy(facts, player, "gold_per_min", "gpm");
            copy(facts, player, "xp_per_min", "xpm");
            copy(facts, player, "net_worth", "networth");
            copy(facts, player, "hero_damage", "hero_damage");
            copy(facts, player, "hero_healing", "hero_healing");
            copy(facts, player, "tower_damage", "tower_damage");
            copy(facts, player, "level", "level");
            if (number(facts, "actions_per_min") <= 0) {
                copy(facts, player, "actions_per_min", "actions_per_min");
            }
            copy(facts, player, "stuns", "stuns");
            copy(facts, player, "teamfight_participation", "teamfight_participation");
            copy(facts, player, "obs_placed", "aggregate_observer_wards");
            copy(facts, player, "sen_placed", "aggregate_sentry_wards");
            copy(facts, player, "camps_stacked", "aggregate_camps_stacked");
            copy(facts, player, "creeps_stacked", "creeps_stacked");
            copy(facts, player, "rune_pickups", "aggregate_rune_pickups");
            copy(facts, player, "tower_kills", "tower_kills");
            copy(facts, player, "roshan_kills", "roshan_kills");
            copy(facts, player, "buyback_count", "buyback_count");
            copy(facts, player, "gold_spent", "gold_spent");
            copy(facts, player, "total_gold", "total_gold");
            copy(facts, player, "total_xp", "total_xp");
        }
    }

    private static BaseScores baseScores(JsonObject modules, JsonObject own, JsonObject opponent,
            JsonObject roleOpponent, JsonObject bySlot, int slot, int position, int duration) {
        int teamStart = slot < 5 ? 0 : 5;
        double teamDamage = teamTotal(bySlot, teamStart, "hero_damage", "damage_dealt");
        double teamTaken = teamTotal(bySlot, teamStart, "damage_taken", null);
        double teamTower = teamTotal(bySlot, teamStart, "tower_damage", null);
        double teamVision = teamActivity(bySlot, teamStart, "vision");
        double teamUtility = teamActivity(bySlot, teamStart, "utility");
        double teamTempo = teamActivity(bySlot, teamStart, "tempo");
        Map<String, DimensionScore> scores = new LinkedHashMap<>();

        int laneModelScore = clamp((int) Math.round(50 + number(own, "lane_score") * 0.5), 0, 100);
        JsonObject laneOpportunity = object(own, "lane_opportunity_summary");
        int securedUnits = intValue(laneOpportunity, "secured", 0);
        int reviewableMisses = intValue(laneOpportunity, "reviewable_misses", 0);
        int opportunityScore = securedUnits + reviewableMisses == 0 ? 50
                : clamp((int) Math.round(securedUnits * 100.0 / (securedUnits + reviewableMisses)), 0, 100);
        JsonObject supportRoute = supportRoute(modules, slot);
        boolean laneOpportunityEnabled = booleanValue(laneOpportunity, "recommendation_enabled", false);
        int lane = laneModelScore;
        List<String> laneMissing = new ArrayList<>();
        if (position <= 3 && laneOpportunityEnabled && securedUnits + reviewableMisses > 0) {
            lane = weighted(laneModelScore, 75, opportunityScore, 25);
        } else if (position >= 4 && supportRoute != null) {
            int supportRouteScore = clamp(50 + (int) Math.round(number(supportRoute, "score") * 1.2), 0, 100);
            lane = weighted(laneModelScore, 65, supportRouteScore, 35);
        } else {
            laneMissing.add(position <= 3 ? "reviewable_lane_unit_outcomes" : "support_route_outcomes");
        }
        int laneConfidence = Math.min(intValue(own, "lane_confidence", 0),
                moduleConfidence(modules, "laning", 72));
        scores.put("lane", dimension(lane, laneConfidence, "derived", laneMissing));

        List<Integer> economyParts = new ArrayList<>();
        List<String> economyMissing = new ArrayList<>();
        addRelativeMetric(economyParts, economyMissing, own, roleOpponent, "gpm");
        addRelativeMetric(economyParts, economyMissing, own, roleOpponent, "xpm");
        addRelativeMetric(economyParts, economyMissing, own, roleOpponent, "networth");
        int economyConfidence = economyParts.size() < 2 ? 45
                : Math.min(moduleConfidence(modules, "farm", 78), 60 + economyParts.size() * 8);
        scores.put("economy", economyParts.size() < 2
                ? missing(economyConfidence, economyMissing)
                : dimension(average(economyParts), economyConfidence,
                        economyMissing.isEmpty() ? "derived" : "partial", economyMissing));

        ResourceSignals resource = resourceSignals(modules, own, slot);
        List<Integer> resourceParts = new ArrayList<>();
        List<Integer> resourceWeights = new ArrayList<>();
        List<String> resourceMissing = new ArrayList<>();
        if (position <= 3) {
            if (resource.laneRecommendationEnabled && resource.secured + resource.reviewableMisses > 0) {
                resourceParts.add(clamp((int) Math.round(resource.secured * 100.0
                        / (resource.secured + resource.reviewableMisses)), 0, 100));
                resourceWeights.add(35);
            } else {
                resourceMissing.add("hard_gated_lane_opportunity_windows");
            }
            if (resource.enabledWindows > 0) {
                int routeScore = clamp(65 + resource.matchedWindows * 8
                        - resource.missedWindows * 8
                        - Math.min(24, resource.estimatedLoss / 120)
                        + Math.min(8, resource.cycles * 2), 0, 100);
                resourceParts.add(routeScore);
                resourceWeights.add(50);
            } else {
                resourceMissing.add("hard_gated_route_windows");
            }
            if (resource.cycles > 0) {
                resourceParts.add(clamp(55 + resource.cycles * 6, 0, 100));
                resourceWeights.add(15);
            } else {
                resourceMissing.add("confirmed_lane_jungle_cycles");
            }
        } else {
            if (supportRoute != null) {
                resourceParts.add(clamp(50 + (int) Math.round(number(supportRoute, "score") * 1.2),
                        0, 100));
                resourceWeights.add(65);
            } else {
                resourceMissing.add("support_route_outcomes");
            }
            if (resource.stackSummaryPresent) {
                int stackScore = clamp(55 + resource.stackedCamps * 5
                        + Math.min(25, resource.stackValue / 60), 0, 100);
                resourceParts.add(stackScore);
                resourceWeights.add(35);
            } else {
                resourceMissing.add("stack_team_value");
            }
            resourceMissing.add("team_resource_claims");
        }
        int resourceConfidence = resourceParts.isEmpty() ? 40
                : Math.min(moduleConfidence(modules, "farm", 78),
                        position <= 3 ? 68 + Math.min(18, resource.enabledWindows * 3)
                                : supportRoute == null ? 60 : 74);
        scores.put("resource", resourceParts.isEmpty()
                ? missing(resourceConfidence, resourceMissing)
                : dimension(weightedLists(resourceParts, resourceWeights), resourceConfidence,
                        resourceMissing.isEmpty() ? "gated" : "partial", resourceMissing));

        CombatSignals fight = combatSignals(modules, slot);
        double damageTarget = switch (position) {
            case 1 -> 0.27;
            case 2 -> 0.25;
            case 3 -> 0.19;
            case 4 -> 0.14;
            default -> 0.09;
        };
        List<Integer> combatParts = new ArrayList<>();
        List<Integer> combatWeights = new ArrayList<>();
        if (teamDamage > 0) {
            combatParts.add(shareScore(preferred(own, "hero_damage", "damage_dealt"),
                    teamDamage, damageTarget));
            combatWeights.add(55);
        }
        if (fight.reviewableFights > 0) {
            combatParts.add(clamp(50 + (int) Math.round(
                    (fight.averageDamageShare - damageTarget * 100) * 1.4), 0, 100));
            combatWeights.add(25);
            combatParts.add(clamp(fight.averageKillConversion, 0, 100));
            combatWeights.add(20);
        }
        List<String> combatMissing = new ArrayList<>();
        if (fight.reviewableFights == 0) combatMissing.add("classified_combat_contributions");
        int combatConfidence = combatParts.isEmpty() ? 35
                : Math.min(moduleConfidence(modules, "combat", 80),
                        fight.reviewableFights > 0 ? 72 + Math.min(18, fight.reviewableFights) : 60);
        scores.put("combat", combatParts.isEmpty()
                ? missing(combatConfidence, combatMissing)
                : dimension(weightedLists(combatParts, combatWeights), combatConfidence,
                        combatMissing.isEmpty() ? "derived" : "partial", combatMissing));

        double ownUtility = utilityValue(own);
        double utilityTarget = position >= 4 ? 0.30 : position == 3 ? 0.18 : 0.11;
        List<String> dutyMissing = new ArrayList<>();
        dutyMissing.add("hero_specific_duty_context");
        DimensionScore duty;
        if (fight.passedDutyFights == 0) {
            dutyMissing.add("passed_responsibility_gate_fights");
            duty = missing(Math.min(50, fight.averageDutyConfidence), dutyMissing);
        } else {
            int utility = weighted(fight.averageDutyScore, 75,
                    shareScore(ownUtility, teamUtility, utilityTarget), 25);
            int utilityConfidence = Math.min(moduleConfidence(modules, "combat", 80),
                    fight.averageDutyConfidence);
            duty = dimension(utility, utilityConfidence, "gated", dutyMissing);
        }
        scores.put("utility", duty);

        double ownVision = visionValue(own);
        double visionTarget = switch (position) {
            case 5 -> 0.42;
            case 4 -> 0.34;
            case 3 -> 0.08;
            case 2 -> 0.06;
            default -> 0.04;
        };
        VisionSignals visionFacts = visionSignals(modules, slot);
        List<String> visionMissing = new ArrayList<>();
        if (!visionFacts.modulePresent) visionMissing.add("ward_lifecycle_module");
        if (!visionFacts.hasDetectionEvidence) visionMissing.add("enemy_detection_events");
        int visionConfidence = !visionFacts.modulePresent || teamVision <= 0 ? 40
                : Math.min(moduleConfidence(modules, "vision", 76), 82);
        int vision = weighted(shareScore(ownVision, teamVision, visionTarget), 65,
                visionFacts.wards > 0 ? clamp(visionFacts.averageScore, 0, 100) : 50, 35);
        scores.put("vision", visionConfidence < 55
                ? missing(visionConfidence, visionMissing)
                : dimension(vision, visionConfidence,
                        visionMissing.isEmpty() ? "derived" : "partial", visionMissing));

        int deaths = intValue(own, "deaths", 0);
        int opponentDeaths = intValue(roleOpponent, "deaths", deaths);
        double deadPct = duration <= 0 ? 0 : number(own, "dead_seconds") * 100.0 / duration;
        int survival = weighted(relativeScore(opponentDeaths, deaths), 65,
                clamp((int) Math.round(88 - deadPct * 2.2), 0, 100), 35);
        List<String> survivalMissing = List.of("death_context_quality", "retreat_decision_context");
        int survivalConfidence = duration <= 0 ? 35
                : Math.min(moduleConfidence(modules, "players", 74), 72);
        scores.put("survival", survivalConfidence < 55
                ? missing(survivalConfidence, survivalMissing)
                : dimension(survival, survivalConfidence, "partial", survivalMissing));

        double towerTarget = switch (position) {
            case 1 -> 0.30;
            case 2 -> 0.22;
            case 3 -> 0.24;
            case 4 -> 0.14;
            default -> 0.10;
        };
        int objective = weighted(shareScore(number(own, "tower_damage"), teamTower, towerTarget), 75,
                clamp(50 + intValue(own, "tower_kills", 0) * 12
                        + intValue(own, "roshan_kills", 0) * 14, 0, 100), 25);
        List<String> objectiveMissing = new ArrayList<>();
        objectiveMissing.add("objective_setup_attribution");
        int objectiveConfidence = teamTower <= 0
                && intValue(own, "tower_kills", 0) == 0 && intValue(own, "roshan_kills", 0) == 0
                        ? 45
                        : Math.min(moduleConfidence(modules, "objectives", 74),
                                position >= 4 ? 68 : 78);
        scores.put("objective", objectiveConfidence < 55
                ? missing(objectiveConfidence, objectiveMissing)
                : dimension(objective, objectiveConfidence, "partial", objectiveMissing));

        double tempoTarget = switch (position) {
            case 1 -> 0.12;
            case 2 -> 0.22;
            case 3 -> 0.20;
            default -> 0.24;
        };
        List<Integer> activationParts = new ArrayList<>();
        if (number(roleOpponent, "teleport_uses") > 0 || number(own, "teleport_uses") > 0) {
            activationParts.add(relativeScore(number(own, "teleport_uses"),
                    number(roleOpponent, "teleport_uses")));
        }
        if (preferred(roleOpponent, "aggregate_rune_pickups", "rune_pickups") > 0
                || preferred(own, "aggregate_rune_pickups", "rune_pickups") > 0) {
            activationParts.add(relativeScore(
                    preferred(own, "aggregate_rune_pickups", "rune_pickups"),
                    preferred(roleOpponent, "aggregate_rune_pickups", "rune_pickups")));
        }
        int presenceTarget = position == 1 ? 55 : position <= 3 ? 65 : 72;
        List<Integer> tempoParts = new ArrayList<>();
        List<Integer> tempoWeights = new ArrayList<>();
        if (teamTempo > 0) {
            tempoParts.add(shareScore(tempoValue(own), teamTempo, tempoTarget));
            tempoWeights.add(45);
        }
        if (!activationParts.isEmpty()) {
            tempoParts.add(average(activationParts));
            tempoWeights.add(25);
        }
        if (fight.reviewableFights > 0) {
            tempoParts.add(clamp(50 + (int) Math.round(
                    (fight.averagePresence - presenceTarget) * 0.8), 0, 100));
            tempoWeights.add(30);
        }
        List<String> tempoMissing = new ArrayList<>();
        if (fight.reviewableFights == 0) tempoMissing.add("classified_fight_arrival_windows");
        tempoMissing.add("key_item_activation_windows");
        int tempoConfidence = tempoParts.isEmpty() ? 40
                : Math.min(moduleConfidence(modules, "timeline", 80),
                        fight.reviewableFights > 0 ? 78 : 65);
        scores.put("tempo", tempoParts.isEmpty()
                ? missing(tempoConfidence, tempoMissing)
                : dimension(weightedLists(tempoParts, tempoWeights), tempoConfidence,
                        "partial", tempoMissing));

        double minutes = duration <= 0 ? 0 : duration / 60.0;
        double apm = number(own, "actions_per_min");
        List<String> executionMissing = new ArrayList<>();
        executionMissing.add("invalid_order_rate");
        executionMissing.add("camera_movement");
        executionMissing.add("hero_specific_combo_windows");
        if (minutes < 5 || apm <= 0) {
            scores.put("execution", missing(35, executionMissing));
        } else {
            int actionContinuity = clamp((int) Math.round(40 + Math.max(0, apm - 60) * 0.2),
                    30, 85);
            double ownUses = (number(own, "ability_casts") + number(own, "item_uses")) / minutes;
            double opponentUses = (number(roleOpponent, "ability_casts")
                    + number(roleOpponent, "item_uses")) / minutes;
            int execution = opponentUses > 0
                    ? weighted(actionContinuity, 60, relativeScore(ownUses, opponentUses), 40)
                    : actionContinuity;
            int executionConfidence = Math.min(moduleConfidence(modules, "players", 76),
                    opponentUses > 0 ? 72 : 62);
            scores.put("execution", dimension(execution, executionConfidence,
                    "partial", executionMissing));
        }

        return new BaseScores(scores);
    }

    private static JsonArray scorePhases(JsonObject own, JsonObject opponent, JsonObject bySlot,
            int slot, int position, BaseScores base) {
        JsonArray result = new JsonArray();
        JsonArray phases = own.getAsJsonArray("phases");
        if (phases == null) return result;
        for (JsonElement element : phases) {
            if (!element.isJsonObject()) continue;
            JsonObject facts = element.getAsJsonObject();
            String phase = stringValue(facts, "phase", "unknown");
            JsonObject opponentPhase = phase(opponent, phase);
            double teamDamage = teamPhaseTotal(bySlot, slot, phase, "damage_dealt");
            int income = relativeScore(number(facts, "networth_gain"), number(opponentPhase, "networth_gain"));
            double damageTarget = position <= 2 ? 0.25 : position == 3 ? 0.19 : position == 4 ? 0.14 : 0.09;
            int combat = shareScore(number(facts, "damage_dealt"), teamDamage, damageTarget);
            int survival = clamp(70 - intValue(facts, "deaths", 0) * 16
                    + intValue(facts, "kills", 0) * 6 + intValue(facts, "assists", 0) * 2, 0, 100);
            int score = phase.equals("laning") ? base.score("lane")
                    : position <= 3 ? weighted(income, 35, combat, 40, survival, 25)
                    : weighted(income, 15, combat, 30, survival, 25, base.score("utility"), 30);
            JsonObject row = facts.deepCopy();
            row.addProperty("score", score);
            row.addProperty("income_score", income);
            row.addProperty("combat_score", combat);
            row.addProperty("survival_score", survival);
            result.add(row);
        }
        return result;
    }

    private static JsonArray evidence(String source, JsonObject modules, JsonObject own,
            JsonObject opponent, JsonObject roleOpponent, JsonObject bySlot, int slot,
            int position, int duration) {
        JsonArray rows = new JsonArray();
        switch (source) {
            case "lane" -> {
                rows.add(metric("lane_score", number(own, "lane_score"), number(opponent, "lane_score"), "model_points"));
                rows.add(metric("lane_confidence", number(own, "lane_confidence"), 0, "percent"));
                rows.add(metric("last_hits", number(own, "last_hits"), number(opponent, "last_hits"), "count"));
                rows.add(metric("denies", number(own, "denies"), number(opponent, "denies"), "count"));
                rows.add(metric("level", number(own, "level"), number(opponent, "level"), "level"));
            }
            case "economy" -> {
                rows.add(metric("gpm", number(own, "gpm"), number(roleOpponent, "gpm"), "per_minute"));
                rows.add(metric("xpm", number(own, "xpm"), number(roleOpponent, "xpm"), "per_minute"));
                rows.add(metric("networth", number(own, "networth"), number(roleOpponent, "networth"), "gold"));
                rows.add(metric("lane_gold", number(own, "lane_gold"), number(roleOpponent, "lane_gold"), "gold"));
                rows.add(metric("neutral_gold", number(own, "neutral_gold"), number(roleOpponent, "neutral_gold"), "gold"));
            }
            case "resource" -> {
                ResourceSignals resource = resourceSignals(modules, own, slot);
                rows.add(metric("resource_review_windows", resource.enabledWindows, 0, "count"));
                rows.add(metric("resource_missed_windows", resource.missedWindows, 0, "count"));
                rows.add(metric("resource_estimated_loss", resource.estimatedLoss, 0, "gold"));
                rows.add(metric("lane_jungle_cycles", resource.cycles, 0, "count"));
                rows.add(metric("stack_team_value_estimate", resource.stackValue, 0, "gold"));
            }
            case "tempo" -> {
                CombatSignals fight = combatSignals(modules, slot);
                rows.add(metric("teleport_uses", number(own, "teleport_uses"),
                        number(roleOpponent, "teleport_uses"), "count"));
                rows.add(metric("rune_pickups",
                        preferred(own, "aggregate_rune_pickups", "rune_pickups"),
                        preferred(roleOpponent, "aggregate_rune_pickups", "rune_pickups"), "count"));
                rows.add(metric("fight_presence", fight.averagePresence, 0, "percent"));
                rows.add(metric("reviewable_fights", fight.reviewableFights, 0, "count"));
            }
            case "combat" -> {
                CombatSignals fight = combatSignals(modules, slot);
                rows.add(metric("hero_damage", preferred(own, "hero_damage", "damage_dealt"),
                        preferred(roleOpponent, "hero_damage", "damage_dealt"), "damage"));
                rows.add(metric("fight_damage_share", fight.averageDamageShare, 0, "percent"));
                rows.add(metric("kill_conversion", fight.averageKillConversion, 0, "percent"));
                rows.add(metric("fight_presence", fight.averagePresence, 0, "percent"));
            }
            case "utility" -> {
                CombatSignals fight = combatSignals(modules, slot);
                rows.add(metric("passed_duty_fights", fight.passedDutyFights, 0, "count"));
                rows.add(metric("fight_score", fight.averageDutyScore, 0, "score"));
                rows.add(metric("control_seconds", number(own, "control_seconds"),
                        number(roleOpponent, "control_seconds"), "seconds"));
                rows.add(metric("healing", preferred(own, "hero_healing", "healing"),
                        preferred(roleOpponent, "hero_healing", "healing"), "healing"));
                rows.add(metric("damage_taken", number(own, "damage_taken"),
                        number(roleOpponent, "damage_taken"), "damage"));
            }
            case "survival" -> {
                rows.add(metric("deaths", number(own, "deaths"), number(roleOpponent, "deaths"), "count"));
                rows.add(metric("dead_seconds", number(own, "dead_seconds"),
                        number(roleOpponent, "dead_seconds"), "seconds"));
                rows.add(metric("buyback_count", number(own, "buyback_count"),
                        number(roleOpponent, "buyback_count"), "count"));
            }
            case "objective" -> {
                rows.add(metric("tower_damage", number(own, "tower_damage"),
                        number(roleOpponent, "tower_damage"), "damage"));
                rows.add(metric("tower_kills", number(own, "tower_kills"),
                        number(roleOpponent, "tower_kills"), "count"));
                rows.add(metric("roshan_kills", number(own, "roshan_kills"),
                        number(roleOpponent, "roshan_kills"), "count"));
            }
            case "vision" -> {
                VisionSignals vision = visionSignals(modules, slot);
                rows.add(metric("observer_wards", preferred(own, "aggregate_observer_wards", "observer_wards"), 0, "count"));
                rows.add(metric("sentry_wards", preferred(own, "aggregate_sentry_wards", "sentry_wards"), 0, "count"));
                rows.add(metric("dewards", number(own, "dewards"), 0, "count"));
                rows.add(metric("vision_score", number(own, "vision_score"), 0, "score"));
                rows.add(metric("ward_detections", vision.detections, 0, "count"));
            }
            case "execution" -> {
                double minutes = duration <= 0 ? 0 : duration / 60.0;
                rows.add(metric("actions_per_min", number(own, "actions_per_min"),
                        number(roleOpponent, "actions_per_min"), "per_minute"));
                rows.add(metric("ability_casts", number(own, "ability_casts"),
                        number(roleOpponent, "ability_casts"), "count"));
                rows.add(metric("item_uses", number(own, "item_uses"),
                        number(roleOpponent, "item_uses"), "count"));
                rows.add(metric("observable_uses_per_min",
                        minutes <= 0 ? 0 : (number(own, "ability_casts") + number(own, "item_uses")) / minutes,
                        minutes <= 0 ? 0 : (number(roleOpponent, "ability_casts")
                                + number(roleOpponent, "item_uses")) / minutes,
                        "per_minute"));
            }
            default -> {
                JsonObject opportunities = object(own, "lane_opportunity_summary");
                rows.add(metric("secured_lane_units", number(opportunities, "secured"), 0, "count"));
                rows.add(metric("reviewable_misses", number(opportunities, "reviewable_misses"), 0, "count"));
                rows.add(metric("estimated_reviewable_gold", number(opportunities, "estimated_reviewable_gold"), 0, "gold"));
            }
        }
        return rows;
    }

    private static JsonObject metric(String key, double own, double counterpart, String unit) {
        JsonObject row = new JsonObject();
        row.addProperty("key", key);
        row.addProperty("value", Math.round(own * 10) / 10.0);
        row.addProperty("counterpart", Math.round(counterpart * 10) / 10.0);
        row.addProperty("unit", unit);
        return row;
    }

    private static Profile profile(int position) {
        int[][] weights = {
                { 15, 20, 15, 5, 15, 8, 10, 7, 2, 3 },
                { 17, 12, 8, 15, 14, 10, 8, 7, 3, 6 },
                { 15, 8, 7, 15, 8, 20, 10, 8, 5, 4 },
                { 12, 3, 5, 20, 5, 20, 7, 5, 16, 7 },
                { 15, 2, 4, 15, 3, 18, 7, 5, 23, 8 }
        };
        String[][] dimensions = {
                { "lane_execution", "lane" },
                { "farm_efficiency", "economy" },
                { "resource_decision", "resource" },
                { "map_tempo", "tempo" },
                { "combat_output", "combat" },
                { "combat_duty", "utility" },
                { "survival_risk", "survival" },
                { "objective_conversion", "objective" },
                { "vision_team", "vision" },
                { "observable_execution", "execution" }
        };
        List<DimensionSpec> result = new ArrayList<>();
        int[] roleWeights = weights[clamp(position, 1, 5) - 1];
        for (int index = 0; index < dimensions.length; index++) {
            result.add(new DimensionSpec(dimensions[index][0], dimensions[index][1],
                    roleWeights[index]));
        }
        return new Profile(List.copyOf(result));
    }

    private static JsonObject roleProfiles() {
        JsonObject result = new JsonObject();
        for (int position = 1; position <= 5; position++) {
            JsonObject row = new JsonObject();
            JsonArray dimensions = new JsonArray();
            for (DimensionSpec spec : profile(position).dimensions) {
                JsonObject dimension = new JsonObject();
                dimension.addProperty("key", spec.key);
                dimension.addProperty("source", spec.source);
                dimension.addProperty("weight", spec.weight);
                dimensions.add(dimension);
            }
            row.add("dimensions", dimensions);
            result.add(Integer.toString(position), row);
        }
        return result;
    }

    private static ResourceSignals resourceSignals(JsonObject modules, JsonObject own, int slot) {
        JsonObject farm = object(modules, "farm");
        JsonArray diagnostics = array(object(farm, "diagnostics_by_slot"), Integer.toString(slot));
        int reviewWindows = 0;
        int enabledWindows = 0;
        int matchedWindows = 0;
        int missedWindows = 0;
        int estimatedLoss = 0;
        if (diagnostics != null) {
            for (JsonElement element : diagnostics) {
                if (!element.isJsonObject()) continue;
                JsonObject row = element.getAsJsonObject();
                reviewWindows++;
                if (!booleanValue(row, "recommendation_enabled", false)
                        || intValue(row, "confidence", 0) < 70) {
                    continue;
                }
                enabledWindows++;
                if (booleanValue(row, "matched_best_option", false)) {
                    matchedWindows++;
                } else {
                    int loss = Math.max(0,
                            intValue(row, "suggestedGold", 0) - intValue(row, "actualGold", 0));
                    if (loss > 0) {
                        missedWindows++;
                        estimatedLoss += loss;
                    }
                }
            }
        }

        JsonArray cycles = array(object(farm, "lane_jungle_cycles_by_slot"), Integer.toString(slot));
        JsonObject opportunity = object(own, "lane_opportunity_summary");
        JsonObject stack = object(own, "stack_value_summary");
        return new ResourceSignals(
                reviewWindows,
                enabledWindows,
                matchedWindows,
                missedWindows,
                estimatedLoss,
                cycles == null ? 0 : cycles.size(),
                intValue(opportunity, "secured", 0),
                intValue(opportunity, "reviewable_misses", 0),
                booleanValue(opportunity, "recommendation_enabled", false),
                stack != null,
                intValue(stack, "stacked_camps", 0),
                intValue(stack, "created_gold_estimate", 0));
    }

    private static CombatSignals combatSignals(JsonObject modules, int slot) {
        JsonObject combat = object(modules, "combat");
        JsonArray fights = array(combat, "fights");
        if (fights == null) return new CombatSignals(0, 0, 0, 0, 0, 0, 0);

        int reviewableFights = 0;
        int passedDutyFights = 0;
        int damageShareTotal = 0;
        int killConversionTotal = 0;
        int presenceTotal = 0;
        int dutyScoreTotal = 0;
        int dutyConfidenceTotal = 0;
        for (JsonElement element : fights) {
            if (!element.isJsonObject()) continue;
            JsonObject fight = element.getAsJsonObject();
            if (!isReviewableFight(stringValue(fight, "kind", ""))) continue;
            JsonObject contribution = contribution(fight, slot);
            if (contribution == null) continue;
            reviewableFights++;
            damageShareTotal += intValue(contribution, "teamDamageShare", 0);
            killConversionTotal += intValue(contribution, "killConversion", 0);
            presenceTotal += intValue(contribution, "presencePct", 0);
            JsonObject gate = object(contribution, "responsibility_gate");
            if (!"passed".equals(stringValue(gate, "status", ""))) continue;
            passedDutyFights++;
            dutyScoreTotal += intValue(contribution, "responsibilityScore", 0);
            dutyConfidenceTotal += intValue(contribution, "confidence", 0);
        }
        return new CombatSignals(
                reviewableFights,
                passedDutyFights,
                averageOrZero(damageShareTotal, reviewableFights),
                averageOrZero(killConversionTotal, reviewableFights),
                averageOrZero(presenceTotal, reviewableFights),
                averageOrZero(dutyScoreTotal, passedDutyFights),
                averageOrZero(dutyConfidenceTotal, passedDutyFights));
    }

    private static VisionSignals visionSignals(JsonObject modules, int slot) {
        JsonObject vision = object(modules, "vision");
        JsonArray wards = array(vision, "wards");
        if (wards == null) return new VisionSignals(false, false, 0, 0, 0, 0);

        int ownWards = 0;
        int score = 0;
        int duration = 0;
        int detections = 0;
        boolean detectionSchemaPresent = false;
        for (JsonElement element : wards) {
            if (!element.isJsonObject()) continue;
            JsonObject ward = element.getAsJsonObject();
            if (ward.has("detections")) detectionSchemaPresent = true;
            if (intValue(ward, "playerSlot", -1) != slot) continue;
            ownWards++;
            score += intValue(ward, "score", 0);
            duration += intValue(ward, "duration", 0);
            detections += intValue(ward, "detections", 0);
        }
        return new VisionSignals(true, detectionSchemaPresent, ownWards,
                averageOrZero(score, ownWards), averageOrZero(duration, ownWards), detections);
    }

    private static JsonObject supportRoute(JsonObject modules, int slot) {
        JsonObject laning = object(modules, "laning");
        JsonObject reviews = object(laning, "reviews_by_slot");
        return object(object(reviews, Integer.toString(slot)), "support_route");
    }

    private static int moduleConfidence(JsonObject modules, String module, int fallback) {
        JsonObject evidence = object(object(modules, "module_evidence"), module);
        if (evidence == null || "missing".equals(stringValue(evidence, "status", ""))) return fallback;
        return clamp(intValue(evidence, "confidence", fallback), 0, 100);
    }

    private static void addRelativeMetric(List<Integer> scores, List<String> missing,
            JsonObject own, JsonObject counterpart, String key) {
        double ownValue = number(own, key);
        double counterpartValue = number(counterpart, key);
        if (ownValue <= 0 || counterpartValue <= 0) {
            missing.add(key);
            return;
        }
        scores.add(relativeScore(ownValue, counterpartValue));
    }

    private static DimensionScore dimension(int score, int confidence, String evidenceLevel,
            List<String> missing) {
        int normalizedConfidence = clamp(confidence, 0, 100);
        boolean available = normalizedConfidence >= 55;
        return new DimensionScore(clamp(score, 0, 100), normalizedConfidence, available,
                available ? evidenceLevel : "partial", List.copyOf(missing));
    }

    private static DimensionScore missing(int confidence, List<String> missing) {
        List<String> reasons = missing.isEmpty() ? List.of("minimum_evidence_not_met") : List.copyOf(missing);
        return new DimensionScore(50, clamp(confidence, 0, 54), false, "missing", reasons);
    }

    private static int weightedLists(List<Integer> values, List<Integer> weights) {
        int total = 0;
        int weight = 0;
        for (int index = 0; index < values.size(); index++) {
            int itemWeight = index < weights.size() ? weights.get(index) : 1;
            total += values.get(index) * itemWeight;
            weight += itemWeight;
        }
        return weight == 0 ? 50 : clamp((int) Math.round(total / (double) weight), 0, 100);
    }

    private static int average(List<Integer> values) {
        if (values.isEmpty()) return 50;
        return clamp((int) Math.round(values.stream().mapToInt(Integer::intValue).average().orElse(50)),
                0, 100);
    }

    private static int averageOrZero(int total, int count) {
        return count <= 0 ? 0 : (int) Math.round(total / (double) count);
    }

    private static boolean isReviewableFight(String kind) {
        return "teamfight".equals(kind) || "skirmish".equals(kind)
                || "small_skirmish".equals(kind) || "pickoff".equals(kind);
    }

    private static JsonObject contribution(JsonObject fight, int slot) {
        JsonArray contributions = array(fight, "contributions");
        if (contributions == null) return null;
        for (JsonElement element : contributions) {
            if (element.isJsonObject()
                    && intValue(element.getAsJsonObject(), "slot", -1) == slot) {
                return element.getAsJsonObject();
            }
        }
        return null;
    }

    private static int confidence(JsonObject facts) {
        int role = intValue(facts, "role_confidence", 0);
        int lane = intValue(facts, "lane_confidence", 0);
        int fights = fightValue(facts, "fights", 0);
        int score = 42 + (int) Math.round(role * 0.24) + (int) Math.round(lane * 0.16)
                + Math.min(10, fights * 2)
                + (number(facts, "hero_damage") > 0 ? 5 : 0)
                + (number(facts, "actions_per_min") > 0 ? 4 : 0)
                + (object(facts, "lane_opportunity_summary") != null ? 3 : 0)
                + (object(facts, "stack_value_summary") != null ? 2 : 0);
        return clamp(score, 35, 95);
    }

    private static double teamTotal(JsonObject bySlot, int start, String primary, String fallback) {
        double total = 0;
        for (int slot = start; slot < start + 5; slot++) {
            JsonObject row = object(bySlot, Integer.toString(slot));
            total += fallback == null ? number(row, primary) : preferred(row, primary, fallback);
        }
        return total;
    }

    private static double teamActivity(JsonObject bySlot, int start, String type) {
        double total = 0;
        for (int slot = start; slot < start + 5; slot++) {
            JsonObject row = object(bySlot, Integer.toString(slot));
            total += switch (type) {
                case "vision" -> visionValue(row);
                case "utility" -> utilityValue(row);
                default -> tempoValue(row);
            };
        }
        return total;
    }

    private static double teamPhaseTotal(JsonObject bySlot, int slot, String phase, String key) {
        double total = 0;
        int start = slot < 5 ? 0 : 5;
        for (int candidate = start; candidate < start + 5; candidate++) {
            total += number(phase(object(bySlot, Integer.toString(candidate)), phase), key);
        }
        return total;
    }

    private static double visionValue(JsonObject row) {
        return number(row, "vision_score")
                + preferred(row, "aggregate_observer_wards", "observer_wards") * 15
                + preferred(row, "aggregate_sentry_wards", "sentry_wards") * 8
                + number(row, "dewards") * 25;
    }

    private static double utilityValue(JsonObject row) {
        JsonObject stack = object(row, "stack_value_summary");
        return number(row, "control_seconds") * 2
                + preferred(row, "hero_healing", "healing") / 120.0
                + number(row, "assists") * 3
                + visionValue(row) * 2
                + number(stack, "created_gold_estimate") / 45.0
                + number(stack, "stacked_camps") * 2;
    }

    private static double tempoValue(JsonObject row) {
        JsonObject stack = object(row, "stack_value_summary");
        return number(row, "assists") * 3
                + number(row, "teleport_uses") * 2
                + preferred(row, "aggregate_rune_pickups", "rune_pickups") * 2
                + preferred(row, "aggregate_camps_stacked", "camps_stacked") * 2
                + number(stack, "created_gold_estimate") / 70.0
                + percent(number(row, "teamfight_participation")) * 0.5;
    }

    private static int shareScore(double own, double team, double target) {
        if (team <= 0) return 50;
        return clamp((int) Math.round(50 + (own / team - target) * 180), 0, 100);
    }

    private static int relativeScore(double own, double counterpart) {
        if (own <= 0 && counterpart <= 0) return 50;
        double denominator = Math.max(1, (Math.abs(own) + Math.abs(counterpart)) / 2.0);
        return clamp((int) Math.round(50 + 45 * Math.tanh((own - counterpart) / denominator)), 0, 100);
    }

    private static int weighted(Object... values) {
        int total = 0;
        int weight = 0;
        for (int index = 0; index + 1 < values.length; index += 2) {
            total += ((Number) values[index]).intValue() * ((Number) values[index + 1]).intValue();
            weight += ((Number) values[index + 1]).intValue();
        }
        return weight == 0 ? 50 : clamp((int) Math.round(total / (double) weight), 0, 100);
    }

    private static int average(int... values) {
        if (values.length == 0) return 50;
        int total = 0;
        for (int value : values) total += value;
        return clamp((int) Math.round(total / (double) values.length), 0, 100);
    }

    private static int percent(double value) {
        return clamp((int) Math.round(value <= 1.0 ? value * 100 : value), 0, 100);
    }

    private static int fightValue(JsonObject row, String key, int fallback) {
        JsonObject fight = object(row, "fight_summary");
        return fight == null ? fallback : intValue(fight, key, fallback);
    }

    private static JsonObject phase(JsonObject row, String phase) {
        if (row == null) return null;
        JsonArray phases = row.getAsJsonArray("phases");
        if (phases == null) return null;
        for (JsonElement element : phases) {
            if (element.isJsonObject() && phase.equals(stringValue(element.getAsJsonObject(), "phase", ""))) {
                return element.getAsJsonObject();
            }
        }
        return null;
    }

    private static int matchupSlot(JsonObject matchups, int slot, int position) {
        if (matchups != null) {
            JsonElement value = matchups.get(Integer.toString(slot));
            if (value != null && !value.isJsonNull()) return value.getAsInt();
        }
        return slot < 5 ? 5 + Math.max(0, position - 1) : Math.max(0, position - 1);
    }

    private static int roleCounterpartSlot(JsonObject bySlot, int slot, int position) {
        int start = slot < 5 ? 5 : 0;
        for (int candidate = start; candidate < start + 5; candidate++) {
            JsonObject row = object(bySlot, Integer.toString(candidate));
            if (intValue(row, "position", -1) == position) return candidate;
        }
        return slot < 5 ? 5 + Math.max(0, position - 1) : Math.max(0, position - 1);
    }

    private static void copy(JsonObject target, JsonObject source, String sourceKey, String targetKey) {
        JsonElement value = source.get(sourceKey);
        if (value != null && !value.isJsonNull()) target.add(targetKey, value.deepCopy());
    }

    private static double preferred(JsonObject row, String primary, String fallback) {
        double value = number(row, primary);
        return value > 0 ? value : number(row, fallback);
    }

    private static int preferredInt(JsonObject row, String primary, String fallback) {
        return (int) Math.round(preferred(row, primary, fallback));
    }

    private static double number(JsonObject object, String key) {
        if (object == null) return 0;
        JsonElement value = object.get(key);
        if (value == null || value.isJsonNull()) return 0;
        try {
            return value.getAsDouble();
        } catch (RuntimeException ignored) {
            return 0;
        }
    }

    private static int intValue(JsonObject object, String key, int fallback) {
        if (object == null) return fallback;
        JsonElement value = object.get(key);
        if (value == null || value.isJsonNull()) return fallback;
        try {
            return value.getAsInt();
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static String stringValue(JsonObject object, String key, String fallback) {
        if (object == null) return fallback;
        JsonElement value = object.get(key);
        return value == null || value.isJsonNull() ? fallback : value.getAsString();
    }

    private static JsonObject object(JsonObject parent, String key) {
        if (parent == null) return null;
        JsonElement value = parent.get(key);
        return value != null && value.isJsonObject() ? value.getAsJsonObject() : null;
    }

    private static JsonArray array(JsonObject parent, String key) {
        if (parent == null) return null;
        JsonElement value = parent.get(key);
        return value != null && value.isJsonArray() ? value.getAsJsonArray() : null;
    }

    private static boolean booleanValue(JsonObject object, String key, boolean fallback) {
        if (object == null) return fallback;
        JsonElement value = object.get(key);
        if (value == null || value.isJsonNull()) return fallback;
        try {
            return value.getAsBoolean();
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static int normalizedSlot(int playerSlot) {
        if (playerSlot >= 128 && playerSlot <= 132) return playerSlot - 123;
        return playerSlot >= 0 && playerSlot <= 9 ? playerSlot : -1;
    }

    private static String grade(int score) {
        if (score >= 88) return "S";
        if (score >= 78) return "A";
        if (score >= 68) return "B";
        if (score >= 58) return "C";
        if (score >= 45) return "D";
        return "E";
    }

    private static int clamp(int value, int minimum, int maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    private static double round1(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private record DimensionSpec(String key, String source, int weight) {
    }

    private record DimensionResult(String key, String source, int weight, DimensionScore score) {
    }

    private record Profile(List<DimensionSpec> dimensions) {
    }

    private record DimensionScore(int score, int confidence, boolean available,
            String evidenceLevel, List<String> missing) {
    }

    private record ResourceSignals(int reviewWindows, int enabledWindows, int matchedWindows,
            int missedWindows, int estimatedLoss, int cycles, int secured, int reviewableMisses,
            boolean laneRecommendationEnabled, boolean stackSummaryPresent, int stackedCamps,
            int stackValue) {
    }

    private record CombatSignals(int reviewableFights, int passedDutyFights,
            int averageDamageShare, int averageKillConversion, int averagePresence,
            int averageDutyScore, int averageDutyConfidence) {
    }

    private record VisionSignals(boolean modulePresent, boolean hasDetectionEvidence,
            int wards, int averageScore, int averageDuration, int detections) {
    }

    private record BaseScores(Map<String, DimensionScore> values) {
        int score(String key) {
            DimensionScore dimension = values.get(key);
            return dimension == null || !dimension.available ? 50 : dimension.score;
        }

        DimensionScore dimension(String key) {
            return values.getOrDefault(key,
                    new DimensionScore(50, 0, false, "missing",
                            List.of("dimension_not_implemented")));
        }
    }
}
