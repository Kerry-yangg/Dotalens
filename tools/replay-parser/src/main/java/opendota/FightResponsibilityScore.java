package opendota;

import com.google.gson.JsonObject;
import java.util.LinkedHashMap;
import java.util.Map;

final class FightResponsibilityScore {
    record Input(
            int position,
            double damageShare,
            double killConversionShare,
            double damageTakenShare,
            int abilityCasts,
            int itemUses,
            double controlSeconds,
            int healing,
            int setupObservers,
            int setupSentries,
            int presencePct,
            int arrivalDelay,
            int deaths) {}

    record Component(double points, double maxPoints, double rawValue, String rawUnit) {
        JsonObject toJson(boolean judgmentSuppressed) {
            JsonObject row = new JsonObject();
            row.addProperty("points", round3(points));
            row.addProperty("max_points", round3(maxPoints));
            row.addProperty("raw_value", round3(rawValue));
            row.addProperty("raw_unit", rawUnit);
            row.addProperty("status", "applicable");
            row.addProperty("judgment_suppressed", judgmentSuppressed);
            return row;
        }
    }

    record Result(int score, Map<String, Component> components) {
        JsonObject toJson(boolean judgmentSuppressed) {
            JsonObject row = new JsonObject();
            components.forEach((key, value) -> row.add(key, value.toJson(judgmentSuppressed)));
            return row;
        }
    }

    static Result calculate(Input input) {
        Map<String, Component> components = new LinkedHashMap<>();
        int wards = input.setupObservers() + input.setupSentries();
        double base = input.position() <= 3 ? 24 : 26;
        put(components, "base", base, base, base, "points");

        switch (input.position()) {
            case 1 -> {
                put(components, "damage_share", Math.min(38, input.damageShare() * 100), 38,
                        input.damageShare() * 100, "percent");
                put(components, "kill_conversion", Math.min(12, input.killConversionShare() * 14), 12,
                        input.killConversionShare() * 100, "percent");
                put(components, "ability_casts", Math.min(10, input.abilityCasts() * 2.5), 10,
                        input.abilityCasts(), "casts");
                put(components, "presence", input.presencePct() * 0.14, 14,
                        input.presencePct(), "percent");
                put(components, "death_penalty", -input.deaths() * 7.0, 0,
                        input.deaths(), "deaths");
            }
            case 2 -> {
                put(components, "damage_share", Math.min(34, input.damageShare() * 100), 34,
                        input.damageShare() * 100, "percent");
                put(components, "ability_casts", Math.min(14, input.abilityCasts() * 3.0), 14,
                        input.abilityCasts(), "casts");
                put(components, "control", Math.min(10, input.controlSeconds() * 2.0), 10,
                        input.controlSeconds(), "seconds");
                put(components, "arrival", Math.max(0, 10 - input.arrivalDelay() * 2.0), 10,
                        input.arrivalDelay(), "seconds");
                put(components, "presence", input.presencePct() * 0.12, 12,
                        input.presencePct(), "percent");
                put(components, "death_penalty", -input.deaths() * 6.0, 0,
                        input.deaths(), "deaths");
            }
            case 3 -> {
                put(components, "damage_share", Math.min(24, input.damageShare() * 100), 24,
                        input.damageShare() * 100, "percent");
                put(components, "damage_taken_share", Math.min(18, input.damageTakenShare() * 100), 18,
                        input.damageTakenShare() * 100, "percent");
                put(components, "control", Math.min(18, input.controlSeconds() * 3.0), 18,
                        input.controlSeconds(), "seconds");
                put(components, "ability_casts", Math.min(8, input.abilityCasts() * 2.0), 8,
                        input.abilityCasts(), "casts");
                put(components, "presence", input.presencePct() * 0.12, 12,
                        input.presencePct(), "percent");
                put(components, "death_penalty", -input.deaths() * 4.0, 0,
                        input.deaths(), "deaths");
            }
            case 4 -> addSupportComponents(components, input, wards,
                    20, 20, 10, 10, 8, 220.0, 5.0);
            default -> addSupportComponents(components, input, wards,
                    18, 18, 16, 12, 8, 180.0, 6.0);
        }

        double total = components.values().stream().mapToDouble(Component::points).sum();
        return new Result((int) Math.round(Math.max(0, Math.min(100, total))), components);
    }

    private static void addSupportComponents(
            Map<String, Component> components, Input input, int wards,
            double castMax, double controlMax, double healMax, double wardMax,
            double itemMax, double healDivisor, double wardMultiplier) {
        put(components, "ability_casts", Math.min(castMax, input.abilityCasts() * 4.0), castMax,
                input.abilityCasts(), "casts");
        put(components, "control", Math.min(controlMax, input.controlSeconds() * 3.0), controlMax,
                input.controlSeconds(), "seconds");
        put(components, "healing", Math.min(healMax, input.healing() / healDivisor), healMax,
                input.healing(), "health");
        put(components, "vision_setup", Math.min(wardMax, wards * wardMultiplier), wardMax,
                wards, "wards");
        put(components, "item_uses", Math.min(itemMax, input.itemUses() * 2.0), itemMax,
                input.itemUses(), "uses");
        put(components, "presence", input.presencePct() * 0.10, 10,
                input.presencePct(), "percent");
        put(components, "death_penalty", -input.deaths() * 5.0, 0,
                input.deaths(), "deaths");
    }

    private static void put(Map<String, Component> target, String key, double points,
            double maxPoints, double rawValue, String rawUnit) {
        target.put(key, new Component(points, maxPoints, rawValue, rawUnit));
    }

    private static double round3(double value) {
        return Math.round(value * 1000.0) / 1000.0;
    }
}
