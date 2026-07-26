package opendota;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

final class PlayerReportAtomicTestFixture {
    private PlayerReportAtomicTestFixture() {
    }

    static JsonObject completeModulesForPosition(int position) {
        JsonObject modules = new JsonObject();
        JsonObject players = new JsonObject();
        JsonObject bySlot = new JsonObject();
        for (int slot = 0; slot < 10; slot++) {
            int assignedPosition = slot == 0 || slot == 5 ? position : slot % 5 + 1;
            JsonObject facts = new JsonObject();
            facts.addProperty("position", assignedPosition);
            facts.addProperty("role_confidence", 96);
            facts.addProperty("confidence", 92);
            facts.addProperty("lane_score", slot == 0 ? 24 : 0);
            facts.addProperty("lane_confidence", 90);
            facts.addProperty("gpm", 500 + slot * 10);
            facts.addProperty("xpm", 550 + slot * 10);
            facts.addProperty("networth", 15_000 + slot * 300);
            facts.addProperty("hero_damage", 12_000 + slot * 500);
            facts.addProperty("damage_taken", 10_000 + slot * 400);
            facts.addProperty("tower_damage", 1_500 + slot * 100);
            facts.addProperty("deaths", 2 + slot % 3);
            facts.addProperty("dead_seconds", 80 + slot * 5);
            facts.addProperty("actions_per_min", 120 + slot);
            facts.addProperty("ability_casts", 80 + slot);
            facts.addProperty("item_uses", 40 + slot);
            facts.addProperty("teleport_uses", 5 + slot % 2);
            facts.addProperty("aggregate_rune_pickups", 4 + slot % 3);
            facts.addProperty("teamfight_participation", 0.68);

            JsonObject opportunity = new JsonObject();
            opportunity.addProperty("recommendation_enabled", true);
            opportunity.addProperty("secured", 18);
            opportunity.addProperty("reviewable_misses", 6);
            facts.add("lane_opportunity_summary", opportunity);

            JsonObject stack = new JsonObject();
            stack.addProperty("stacked_camps", 2);
            stack.addProperty("created_gold_estimate", 240);
            facts.add("stack_value_summary", stack);
            bySlot.add(Integer.toString(slot), facts);
        }
        players.add("by_slot", bySlot);
        modules.add("players", players);

        JsonObject laning = new JsonObject();
        JsonObject reviews = new JsonObject();
        JsonObject matchups = new JsonObject();
        for (int slot = 0; slot < 10; slot++) {
            matchups.addProperty(Integer.toString(slot), slot < 5 ? slot + 5 : slot - 5);
            JsonObject review = new JsonObject();
            JsonObject supportRoute = new JsonObject();
            supportRoute.addProperty("score", 20);
            review.add("support_route", supportRoute);
            reviews.add(Integer.toString(slot), review);
        }
        laning.add("reviews_by_slot", reviews);
        laning.add("matchup_slot_by_slot", matchups);
        modules.add("laning", laning);

        JsonObject farm = new JsonObject();
        JsonObject diagnosticsBySlot = new JsonObject();
        JsonObject cyclesBySlot = new JsonObject();
        for (int slot = 0; slot < 10; slot++) {
            JsonArray diagnostics = new JsonArray();
            JsonObject matched = new JsonObject();
            matched.addProperty("recommendation_enabled", true);
            matched.addProperty("confidence", 90);
            matched.addProperty("matched_best_option", true);
            diagnostics.add(matched);
            JsonObject diagnostic = new JsonObject();
            diagnostic.addProperty("recommendation_enabled", true);
            diagnostic.addProperty("confidence", 90);
            diagnostic.addProperty("matched_best_option", false);
            diagnostic.addProperty("actualGold", 100);
            diagnostic.addProperty("suggestedGold", 340);
            diagnostics.add(diagnostic);
            diagnosticsBySlot.add(Integer.toString(slot), diagnostics);

            JsonArray cycles = new JsonArray();
            cycles.add(new JsonObject());
            cycles.add(new JsonObject());
            cyclesBySlot.add(Integer.toString(slot), cycles);
        }
        farm.add("diagnostics_by_slot", diagnosticsBySlot);
        farm.add("lane_jungle_cycles_by_slot", cyclesBySlot);
        modules.add("farm", farm);

        JsonObject combat = new JsonObject();
        JsonArray fights = new JsonArray();
        JsonObject fight = new JsonObject();
        fight.addProperty("id", "fixture-teamfight");
        fight.addProperty("kind", "teamfight");
        JsonArray contributions = new JsonArray();
        for (int slot = 0; slot < 10; slot++) {
            JsonObject contribution = new JsonObject();
            contribution.addProperty("slot", slot);
            contribution.addProperty("teamDamageShare", 20);
            contribution.addProperty("killConversion", 70);
            contribution.addProperty("presencePct", 68);
            contribution.addProperty("responsibilityScore", 75);
            contribution.addProperty("confidence", 90);
            JsonObject gate = new JsonObject();
            gate.addProperty("status", "passed");
            contribution.add("responsibility_gate", gate);
            contributions.add(contribution);
        }
        fight.add("contributions", contributions);
        fights.add(fight);
        combat.add("fights", fights);
        modules.add("combat", combat);

        JsonObject vision = new JsonObject();
        JsonArray wards = new JsonArray();
        JsonObject ward = new JsonObject();
        ward.addProperty("playerSlot", 0);
        ward.addProperty("detections", 1);
        ward.addProperty("duration", 120);
        ward.addProperty("score", 80);
        wards.add(ward);
        vision.add("wards", wards);
        modules.add("vision", vision);

        JsonObject evidence = new JsonObject();
        for (String key : new String[] {
                "players", "laning", "farm", "combat", "vision", "objectives", "timeline" }) {
            JsonObject entry = new JsonObject();
            entry.addProperty("confidence", 90);
            evidence.add(key, entry);
        }
        modules.add("module_evidence", evidence);
        return modules;
    }

    static JsonObject player(JsonObject modules, int slot) {
        return modules.getAsJsonObject("players").getAsJsonObject("by_slot")
                .getAsJsonObject(Integer.toString(slot));
    }

    static void blockEveryFightDutyGate(JsonObject modules) {
        for (var fight : modules.getAsJsonObject("combat").getAsJsonArray("fights")) {
            for (var contribution : fight.getAsJsonObject().getAsJsonArray("contributions")) {
                contribution.getAsJsonObject().getAsJsonObject("responsibility_gate")
                        .addProperty("status", "blocked");
            }
        }
    }
}
