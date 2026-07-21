package opendota;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import skadistats.clarity.model.Entity;
import skadistats.clarity.model.FieldPath;

final class SchemaProbe {
    static final String ENV_ENABLED = "DOTA_LENS_SCHEMA_PROBE";

    private static final String[] CANDIDATE_PROPERTIES = {
            "CBodyComponent.m_cellX",
            "CBodyComponent.m_cellY",
            "CBodyComponent.m_cellZ",
            "CBodyComponent.m_vecX",
            "CBodyComponent.m_vecY",
            "CBodyComponent.m_vecZ",
            "m_lifeState",
            "m_iHealth",
            "m_iMaxHealth",
            "m_flHealth",
            "m_flMaxHealth",
            "m_flMana",
            "m_flMaxMana",
            "m_iMoveSpeed",
            "m_iTeamNum",
            "m_iTaggedAsVisibleByTeam",
            "m_iDayTimeVisionRange",
            "m_iNightTimeVisionRange",
            "m_nFoWTeam",
            "m_fRevealRadius",
            "m_bSelectionRingVisible",
            "m_bPrevProvidesVision",
            "m_hOwnerEntity",
            "m_hOwnerNPC",
            "m_nPlayerOwnerID",
            "m_iPlayerOwnerID",
            "m_iPlayerID",
            "m_nPlayerID",
            "m_fCooldown",
            "m_flCooldownLength",
            "m_iManaCost",
            "m_nAbilityCurrentCharges",
            "m_iCurrentCharges",
            "m_iSecondaryCharges",
            "m_iPlayerOwnerID",
            "m_hItems.0000",
            "m_hAbilities.0000",
            "m_vecAbilities.0000"
    };

    private static final String[] DISCOVERY_TOKENS = {
            "visible", "vision", "fog", "fow", "reveal", "tagged"
    };

    private final boolean enabled;
    private final Set<String> emittedClasses = new LinkedHashSet<>();

    SchemaProbe() {
        String value = System.getenv(ENV_ENABLED);
        enabled = value != null && (value.equals("1") || Boolean.parseBoolean(value));
    }

    Entry inspect(Entity entity, int time) {
        if (!enabled || entity == null) {
            return null;
        }
        String dtName = entity.getDtClass().getDtName();
        String category = classifyEntity(dtName);
        if (category == null || !emittedClasses.add(dtName)) {
            return null;
        }

        Map<String, Object> properties = new LinkedHashMap<>();
        for (String property : CANDIDATE_PROPERTIES) {
            if (!entity.hasProperty(property)) {
                continue;
            }
            properties.put(property, readProperty(entity, property));
        }
        var fieldPaths = entity.getState().fieldPathIterator();
        while (fieldPaths.hasNext()) {
            FieldPath fieldPath = fieldPaths.next();
            String property = entity.getDtClass().getNameForFieldPath(fieldPath);
            if (property == null || properties.containsKey(property) || !isDiscoveryField(property)) {
                continue;
            }
            Object value = null;
            try {
                value = entity.getPropertyForFieldPath(fieldPath);
            } catch (RuntimeException ignored) {
                // The path itself is the important schema evidence.
            }
            properties.put(property, value);
        }

        Entry entry = new Entry(time);
        entry.type = "schema_probe";
        entry.schema_category = category;
        entry.unit = dtName;
        entry.ehandle = entity.getHandle();
        entry.entity_index = entity.getIndex();
        entry.fields = properties;
        return entry;
    }

    private static Object readProperty(Entity entity, String property) {
        try {
            return entity.getProperty(property);
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static boolean isDiscoveryField(String property) {
        String normalized = property.toLowerCase(Locale.ROOT);
        for (String token : DISCOVERY_TOKENS) {
            if (normalized.contains(token)) {
                return true;
            }
        }
        return false;
    }

    static String classifyEntity(String dtName) {
        if (dtName == null) {
            return null;
        }
        if (dtName.startsWith("CDOTA_Unit_Hero_")) {
            return "hero";
        }
        if (dtName.startsWith("CDOTA_Item_")) {
            return "item";
        }
        if (dtName.contains("TrueSight") || dtName.contains("Sentry")) {
            return "sentry_ward";
        }
        if (dtName.contains("ObserverWard") || dtName.contains("Observer_Ward")) {
            return "observer_ward";
        }
        if (dtName.equals("CDOTA_Item")) {
            return "item";
        }
        if (dtName.contains("Ability") || dtName.startsWith("CDOTA_Ability_")) {
            return "ability";
        }
        if (dtName.contains("Creep_Lane") || dtName.contains("CreepLane")) {
            return "lane_creep";
        }
        if (dtName.contains("Neutral") || dtName.contains("Roshan")) {
            return "neutral";
        }
        if (dtName.contains("Courier")) {
            return "courier";
        }
        if (dtName.contains("Tower") || dtName.contains("Barracks") || dtName.contains("Building")
                || dtName.contains("Fort")) {
            return "building";
        }
        if (dtName.contains("Creep") || dtName.contains("Summon") || dtName.contains("Thinker")) {
            return "controlled_unit";
        }
        return null;
    }

    static boolean isTrackedUnit(String category) {
        return category != null && !category.equals("item") && !category.equals("ability");
    }
}
