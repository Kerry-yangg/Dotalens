package opendota;

import java.util.LinkedHashMap;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/** Patch-scoped interpretation of Source 2 gold reason values. */
final class GoldReasonCatalog {
    static final String CATALOG_VERSION = "source2-gold-reasons/1.0";

    private final String patchProfile;
    private final Map<Integer, Entry> entries = new LinkedHashMap<>();

    GoldReasonCatalog(String patchName) {
        patchProfile = patchName == null || patchName.isBlank() ? "unknown" : patchName;
        register(1, "death_loss", "loss", false, false);
        register(2, "buyback", "loss", false, false);
        register(3, "purchase_consumable", "spending", false, false);
        register(4, "purchase_item", "spending", false, false);
        register(5, "abandoned_redistribute", "transfer", true, false);
        register(6, "sell_item", "conversion", false, false);
        register(7, "ability_cost", "spending", false, false);
        register(8, "cheat", "system", true, false);
        register(9, "selection_penalty", "loss", false, false);
        register(10, "passive_gold", "system", true, false);
        register(11, "building", "objective", true, true);
        register(12, "hero_kill", "combat", true, true);
        register(13, "lane_creep", "farm", true, true);
        register(14, "neutral", "farm", true, true);
        register(15, "roshan", "objective", true, true);
        register(16, "courier", "combat", true, true);
        register(17, "bounty_rune", "map_resource", true, true);
        register(18, "shared_gold", "transfer", true, false);
        register(19, "ability_gold", "system", true, false);
        register(20, "ward", "combat", true, true);
    }

    Entry classify(int reason) {
        Entry entry = entries.get(reason);
        if (entry != null) return entry;
        return new Entry(reason, "unknown_reason_" + reason, "unknown", false, false, false,
                "unmapped");
    }

    Entry contextual(Entry base, String source, String category, boolean countsAsIncome,
            boolean spatial) {
        return new Entry(base.reason, source, category, true, countsAsIncome, spatial,
                "event_context");
    }

    JsonObject manifest() {
        JsonObject result = new JsonObject();
        result.addProperty("schema", CATALOG_VERSION);
        result.addProperty("patch_profile", patchProfile);
        result.addProperty("unknown_policy", "preserve_as_unknown_reason_id");
        JsonArray mappings = new JsonArray();
        entries.values().forEach(entry -> mappings.add(entry.toJson()));
        result.add("mappings", mappings);
        return result;
    }

    private void register(int reason, String source, String category, boolean countsAsIncome,
            boolean spatial) {
        entries.put(reason, new Entry(reason, source, category, true, countsAsIncome, spatial,
                "source2_enum"));
    }

    record Entry(int reason, String source, String category, boolean mapped, boolean countsAsIncome,
            boolean spatial, String evidence) {
        JsonObject toJson() {
            JsonObject row = new JsonObject();
            row.addProperty("reason", reason);
            row.addProperty("source", source);
            row.addProperty("category", category);
            row.addProperty("mapped", mapped);
            row.addProperty("counts_as_income", countsAsIncome);
            row.addProperty("spatial", spatial);
            row.addProperty("evidence", evidence);
            return row;
        }
    }
}
