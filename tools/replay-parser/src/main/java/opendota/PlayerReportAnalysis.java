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
    static final String SCHEMA = "player-report/1.0";

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
            JsonObject opponent = object(bySlot, Integer.toString(counterpart));
            BaseScores base = baseScores(facts, opponent, bySlot, slot, position, duration);
            Profile profile = profile(position);

            List<DimensionResult> dimensions = new ArrayList<>();
            int weightedScore = 0;
            for (DimensionSpec spec : profile.dimensions) {
                int score = base.score(spec.source);
                dimensions.add(new DimensionResult(spec.key, spec.source, spec.weight, score));
                weightedScore += score * spec.weight;
            }
            int overall = clamp((int) Math.round(weightedScore / 100.0), 0, 100);
            dimensions.sort(Comparator.comparingInt(DimensionResult::score).reversed());

            JsonObject report = new JsonObject();
            report.addProperty("model", SCHEMA);
            report.addProperty("scope", "single_match_relative");
            report.addProperty("position", position);
            report.addProperty("role_code", "position_" + position);
            report.addProperty("counterpart_slot", counterpart);
            report.addProperty("overall_score", overall);
            report.addProperty("grade", grade(overall));
            report.addProperty("confidence", confidence(facts));
            report.addProperty("evidence_level", confidence(facts) >= 75 ? "full" : "partial");

            JsonArray dimensionRows = new JsonArray();
            for (DimensionSpec spec : profile.dimensions) {
                DimensionResult result = dimensions.stream()
                        .filter(item -> item.key.equals(spec.key)).findFirst().orElseThrow();
                JsonObject row = new JsonObject();
                row.addProperty("key", result.key);
                row.addProperty("source", result.source);
                row.addProperty("weight", result.weight);
                row.addProperty("score", result.score);
                row.addProperty("status", result.score >= 75 ? "strength"
                        : result.score >= 55 ? "stable" : "improve");
                row.add("evidence", evidence(result.source, facts, opponent, bySlot, slot, duration));
                dimensionRows.add(row);
            }
            report.add("dimensions", dimensionRows);
            report.add("phase_scores", scorePhases(facts, opponent, bySlot, slot, position, base));

            JsonArray strengths = new JsonArray();
            dimensions.stream().limit(2).forEach(item -> strengths.add(item.key));
            report.add("strengths", strengths);
            JsonArray improvements = new JsonArray();
            dimensions.stream().sorted(Comparator.comparingInt(DimensionResult::score)).limit(2)
                    .forEach(item -> improvements.add(item.key));
            report.add("improvements", improvements);
            facts.add("report", report);
        }

        playerModule.addProperty("schema", SCHEMA);
        playerModule.add("role_profiles", roleProfiles());
        JsonArray caveats = new JsonArray();
        caveats.add("no_cross_match_percentile");
        caveats.add("role_inferred_from_first_10_minutes");
        caveats.add("missing_exact_cast_opportunity_context");
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

    private static BaseScores baseScores(JsonObject own, JsonObject opponent, JsonObject bySlot,
            int slot, int position, int duration) {
        int teamStart = slot < 5 ? 0 : 5;
        double teamDamage = teamTotal(bySlot, teamStart, "hero_damage", "damage_dealt");
        double teamTaken = teamTotal(bySlot, teamStart, "damage_taken", null);
        double teamTower = teamTotal(bySlot, teamStart, "tower_damage", null);
        double teamVision = teamActivity(bySlot, teamStart, "vision");
        double teamUtility = teamActivity(bySlot, teamStart, "utility");
        double teamTempo = teamActivity(bySlot, teamStart, "tempo");
        double teamNetworth = teamTotal(bySlot, teamStart, "networth", null);

        int lane = clamp((int) Math.round(50 + number(own, "lane_score") * 0.5), 0, 100);
        int economy = average(
                relativeScore(number(own, "gpm"), number(opponent, "gpm")),
                relativeScore(number(own, "networth"), number(opponent, "networth")));
        double damageTarget = switch (position) {
            case 1 -> 0.27;
            case 2 -> 0.25;
            case 3 -> 0.19;
            case 4 -> 0.14;
            default -> 0.09;
        };
        int fightScore = fightValue(own, "average_score", 50);
        int fightPresence = fightValue(own, "average_presence", 50);
        int participation = percent(number(own, "teamfight_participation"));
        int combat = weighted(
                shareScore(preferred(own, "hero_damage", "damage_dealt"), teamDamage, damageTarget), 45,
                fightScore, 30,
                participation > 0 ? participation : fightPresence, 25);

        double ownUtility = utilityValue(own);
        double utilityTarget = position >= 4 ? 0.30 : position == 3 ? 0.18 : 0.11;
        int utility = weighted(
                shareScore(ownUtility, teamUtility, utilityTarget), 45,
                fightScore, 30,
                participation > 0 ? participation : fightPresence, 25);

        double ownVision = visionValue(own);
        double visionTarget = position == 5 ? 0.42 : position == 4 ? 0.34 : 0.08;
        int vision = weighted(
                shareScore(ownVision, teamVision, visionTarget), 70,
                clamp(45 + intValue(own, "dewards", 0) * 10, 0, 100), 30);

        int deaths = intValue(own, "deaths", 0);
        int opponentDeaths = intValue(opponent, "deaths", deaths);
        double deadPct = duration <= 0 ? 0 : number(own, "dead_seconds") * 100.0 / duration;
        int survival = weighted(relativeScore(opponentDeaths, deaths), 65,
                clamp((int) Math.round(88 - deadPct * 2.2), 0, 100), 35);

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

        int tempo = weighted(shareScore(tempoValue(own), teamTempo, position >= 4 ? 0.24 : 0.18), 45,
                participation > 0 ? participation : fightPresence, 35,
                clamp(45 + intValue(own, "teleport_uses", 0) * 3
                        + preferredInt(own, "aggregate_rune_pickups", "rune_pickups") * 3, 0, 100), 20);

        double pressureTarget = position == 3 ? 0.27 : position == 1 ? 0.20 : 0.17;
        int pressure = weighted(shareScore(number(own, "damage_taken"), teamTaken, pressureTarget), 45,
                objective, 30,
                fightPresence, 25);

        double networthShare = teamNetworth <= 0 ? 0 : number(own, "networth") / teamNetworth;
        double disciplineTarget = position == 5 ? 0.10 : position == 4 ? 0.13 : 0.20;
        int resourceDiscipline = weighted(
                clamp((int) Math.round(62 + (disciplineTarget - networthShare) * 220), 0, 100), 55,
                utility, 45);
        return new BaseScores(Map.of(
                "lane", lane,
                "economy", economy,
                "combat", combat,
                "survival", survival,
                "objective", objective,
                "tempo", tempo,
                "utility", utility,
                "vision", vision,
                "pressure", pressure,
                "discipline", resourceDiscipline));
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

    private static JsonArray evidence(String source, JsonObject own, JsonObject opponent,
            JsonObject bySlot, int slot, int duration) {
        JsonArray rows = new JsonArray();
        switch (source) {
            case "lane" -> {
                rows.add(metric("lane_score", number(own, "lane_score"), number(opponent, "lane_score"), "model_points"));
                rows.add(metric("lane_confidence", number(own, "lane_confidence"), 0, "percent"));
            }
            case "economy", "discipline" -> {
                rows.add(metric("gpm", number(own, "gpm"), number(opponent, "gpm"), "per_minute"));
                rows.add(metric("networth", number(own, "networth"), number(opponent, "networth"), "gold"));
            }
            case "combat" -> {
                rows.add(metric("hero_damage", preferred(own, "hero_damage", "damage_dealt"),
                        preferred(opponent, "hero_damage", "damage_dealt"), "damage"));
                rows.add(metric("fight_score", fightValue(own, "average_score", 0),
                        fightValue(opponent, "average_score", 0), "score"));
            }
            case "survival" -> {
                rows.add(metric("deaths", number(own, "deaths"), number(opponent, "deaths"), "count"));
                rows.add(metric("dead_seconds", number(own, "dead_seconds"), duration, "seconds"));
            }
            case "objective", "pressure" -> {
                rows.add(metric("tower_damage", number(own, "tower_damage"),
                        number(opponent, "tower_damage"), "damage"));
                rows.add(metric("damage_taken", number(own, "damage_taken"),
                        number(opponent, "damage_taken"), "damage"));
            }
            case "vision" -> {
                rows.add(metric("observer_wards", preferred(own, "aggregate_observer_wards", "observer_wards"), 0, "count"));
                rows.add(metric("sentry_wards", preferred(own, "aggregate_sentry_wards", "sentry_wards"), 0, "count"));
                rows.add(metric("dewards", number(own, "dewards"), 0, "count"));
            }
            default -> {
                rows.add(metric("teamfight_participation", percent(number(own, "teamfight_participation")),
                        percent(number(opponent, "teamfight_participation")), "percent"));
                rows.add(metric("control_seconds", number(own, "control_seconds"),
                        number(opponent, "control_seconds"), "seconds"));
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
        return switch (position) {
            case 1 -> new Profile(List.of(
                    new DimensionSpec("lane_execution", "lane", 20),
                    new DimensionSpec("resource_conversion", "economy", 30),
                    new DimensionSpec("core_output", "combat", 25),
                    new DimensionSpec("survival_uptime", "survival", 15),
                    new DimensionSpec("objective_finish", "objective", 10)));
            case 2 -> new Profile(List.of(
                    new DimensionSpec("mid_lane", "lane", 25),
                    new DimensionSpec("tempo_control", "tempo", 25),
                    new DimensionSpec("combat_output", "combat", 25),
                    new DimensionSpec("resource_conversion", "economy", 15),
                    new DimensionSpec("objective_pressure", "objective", 10)));
            case 3 -> new Profile(List.of(
                    new DimensionSpec("offlane_result", "lane", 20),
                    new DimensionSpec("initiation_utility", "utility", 30),
                    new DimensionSpec("space_pressure", "pressure", 20),
                    new DimensionSpec("survival_trade", "survival", 15),
                    new DimensionSpec("resource_efficiency", "economy", 15)));
            case 4 -> new Profile(List.of(
                    new DimensionSpec("lane_support", "lane", 15),
                    new DimensionSpec("roam_tempo", "tempo", 25),
                    new DimensionSpec("combat_utility", "utility", 25),
                    new DimensionSpec("vision_control", "vision", 20),
                    new DimensionSpec("resource_discipline", "discipline", 15)));
            default -> new Profile(List.of(
                    new DimensionSpec("lane_protection", "lane", 20),
                    new DimensionSpec("vision_control", "vision", 25),
                    new DimensionSpec("combat_utility", "utility", 25),
                    new DimensionSpec("team_tempo", "tempo", 20),
                    new DimensionSpec("resource_discipline", "discipline", 10)));
        };
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

    private static int confidence(JsonObject facts) {
        int role = intValue(facts, "role_confidence", 0);
        int lane = intValue(facts, "lane_confidence", 0);
        int fights = fightValue(facts, "fights", 0);
        int score = 42 + (int) Math.round(role * 0.24) + (int) Math.round(lane * 0.16)
                + Math.min(10, fights * 2)
                + (number(facts, "hero_damage") > 0 ? 5 : 0)
                + (number(facts, "actions_per_min") > 0 ? 4 : 0);
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
        return preferred(row, "aggregate_observer_wards", "observer_wards") * 2
                + preferred(row, "aggregate_sentry_wards", "sentry_wards") * 1.5
                + number(row, "dewards") * 3;
    }

    private static double utilityValue(JsonObject row) {
        return number(row, "control_seconds") * 2
                + preferred(row, "hero_healing", "healing") / 120.0
                + number(row, "assists") * 3
                + visionValue(row) * 2;
    }

    private static double tempoValue(JsonObject row) {
        return number(row, "assists") * 3
                + number(row, "teleport_uses") * 2
                + preferred(row, "aggregate_rune_pickups", "rune_pickups") * 2
                + preferred(row, "aggregate_camps_stacked", "camps_stacked") * 2
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

    private record DimensionSpec(String key, String source, int weight) {
    }

    private record DimensionResult(String key, String source, int weight, int score) {
    }

    private record Profile(List<DimensionSpec> dimensions) {
    }

    private record BaseScores(Map<String, Integer> values) {
        int score(String key) {
            return values.getOrDefault(key, 50);
        }
    }
}
