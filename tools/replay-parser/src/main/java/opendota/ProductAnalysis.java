package opendota;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NavigableMap;
import java.util.Set;
import java.util.TreeMap;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

/**
 * Builds the compact, UI-facing analysis index while the raw JSONL is scanned.
 * Raw replay events stay on disk; this object only retains fields needed by the
 * desktop product.
 */
final class ProductAnalysis {
    static final String CURRENT_SCHEMA = "product-modules/2.10";
    private static final int RADIANT = 2;
    private static final int DIRE = 3;
    private static final double ROSHAN_PIT_CONTEXT_RADIUS_PCT = 6.0;

    private final MapCoordinateService coordinates;
    private final GoldReasonCatalog goldReasons;
    private final PatchAbilityMetadata abilityMetadata;
    private final Map<String, Integer> heroSlots = new HashMap<>();
    private final Map<Integer, NavigableMap<Integer, Snapshot>> snapshots = new TreeMap<>();
    private final Map<Integer, Integer> actionCounts = new HashMap<>();
    private final Map<Integer, List<InventoryPoint>> inventoryPoints = new TreeMap<>();
    private final Map<Integer, String> inventorySignatures = new HashMap<>();
    private final List<ActorEvent> purchases = new ArrayList<>();
    private final List<ActorEvent> abilityLevels = new ArrayList<>();
    private final List<ActorEvent> usages = new ArrayList<>();
    private final List<GoldPoint> goldPoints = new ArrayList<>();
    private final List<DeathPoint> deaths = new ArrayList<>();
    private final List<DamagePoint> damages = new ArrayList<>();
    private final List<HealPoint> heals = new ArrayList<>();
    private final List<ControlPoint> controls = new ArrayList<>();
    private final List<TeleportChannelPoint> teleportChannels = new ArrayList<>();
    private final List<StealthModifierEvent> stealthModifierEvents = new ArrayList<>();
    private final List<ObjectivePoint> objectives = new ArrayList<>();
    private final Map<Integer, WardPoint> wards = new LinkedHashMap<>();
    private final Map<Integer, UnitTrack> unitTracks = new LinkedHashMap<>();
    private final List<HeroVisibilityEvent> heroVisibilityEvents = new ArrayList<>();
    private final Map<Integer, Map<Integer, NavigableMap<Integer, VisibilitySample>>> visibilityIndex = new LinkedHashMap<>();
    private int eventId;

    ProductAnalysis() {
        this("unknown");
    }

    ProductAnalysis(String patchName) {
        coordinates = new MapCoordinateService(patchName);
        goldReasons = new GoldReasonCatalog(patchName);
        abilityMetadata = PatchAbilityMetadata.load(patchName);
    }

    void accept(JsonObject event) {
        String type = stringValue(event, "type");
        if (type == null) {
            return;
        }
        switch (type) {
            case "interval" -> acceptInterval(event);
            case "unit_enter", "unit_state", "unit_left", "visibility" -> acceptUnitEvent(event, type);
            case "actions" -> acceptAction(event);
            case "DOTA_COMBATLOG_PURCHASE" -> acceptPurchase(event);
            case "DOTA_ABILITY_LEVEL" -> acceptAbilityLevel(event);
            case "DOTA_COMBATLOG_ITEM", "DOTA_COMBATLOG_ABILITY" -> acceptUsage(event, type);
            case "DOTA_COMBATLOG_GOLD" -> acceptGold(event);
            case "DOTA_COMBATLOG_DEATH" -> acceptDeath(event);
            case "DOTA_COMBATLOG_DAMAGE" -> acceptDamage(event);
            case "DOTA_COMBATLOG_HEAL" -> acceptHeal(event);
            case "DOTA_COMBATLOG_MODIFIER_ADD" -> {
                acceptControl(event);
                acceptSpecialModifier(event, false);
                acceptStealthModifier(event, false);
            }
            case "DOTA_COMBATLOG_MODIFIER_REMOVE" -> {
                acceptSpecialModifier(event, true);
                acceptStealthModifier(event, true);
            }
            case "obs", "sen", "obs_left", "sen_left" -> acceptWard(event, type);
            case "DOTA_COMBATLOG_TEAM_BUILDING_KILL" -> acceptBuilding(event);
            case "CHAT_MESSAGE_ROSHAN_KILL", "CHAT_MESSAGE_AEGIS", "CHAT_MESSAGE_COURIER_LOST" ->
                acceptChatObjective(event, type);
            default -> {
                // The product index intentionally omits low-value raw event types.
            }
        }
    }

    JsonObject build(int duration) {
        int safeDuration = Math.max(1, duration);
        ensureAnalysisActive();
        resolveActorSlots();
        resolveGoldClassifications();
        resolveUnitLifecycleAttribution();

        List<JsonObject> wardRows = buildWards(safeDuration);
        List<JsonObject> objectiveRows = buildObjectives(safeDuration);
        List<RoshanAttempt> roshanAttempts = buildRoshanAttempts();
        Map<Integer, LaneAssignment> laneAssignments = inferLaneAssignments(Math.min(safeDuration, 600));
        JsonArray laneWaves = buildLaneWaves(safeDuration);
        JsonArray campStates = buildCampStates(safeDuration);
        rebuildVisibilityIndex(safeDuration, wardRows);
        ensureAnalysisActive();
        JsonObject buildModule = buildBuildModule();
        JsonObject farmModule = buildFarmModule(safeDuration, wardRows, laneAssignments, laneWaves, campStates);
        ensureAnalysisActive();
        JsonObject laningModule = buildLaningModule(safeDuration, wardRows, laneAssignments);
        ensureAnalysisActive();
        JsonObject combatModule = buildCombatModule(safeDuration, wardRows, roshanAttempts, laneAssignments);
        ensureAnalysisActive();
        JsonObject objectiveModule = buildObjectiveAnalysis(safeDuration, wardRows, roshanAttempts);
        JsonObject mapModule = buildMapModule(objectiveRows);
        JsonObject timelineModule = buildTimelineModule(wardRows, objectiveRows);
        ensureAnalysisActive();

        JsonObject modules = new JsonObject();
        modules.addProperty("schema", CURRENT_SCHEMA);
        JsonObject timeContract = new JsonObject();
        timeContract.addProperty("schema", "event-time/1.1");
        timeContract.addProperty("canonical_field", "game_time_ms");
        timeContract.addProperty("ordering", "game_time_ms,demo_tick,event_seq");
        timeContract.addProperty("alignment", "pause_adjusted_demo_tick_anchor");
        timeContract.addProperty("negative_time_preserved", true);
        timeContract.addProperty("legacy_second_compatible", true);
        modules.add("time_contract", timeContract);
        modules.add("snapshots", buildSnapshots());
        modules.add("development", buildDevelopmentModule(safeDuration));
        modules.add("build", buildModule);
        modules.add("farm", farmModule);
        modules.add("laning", laningModule);
        modules.add("vision", buildVisionModule(safeDuration, wardRows));
        modules.add("combat", combatModule);
        modules.add("objectives", objectiveModule);
        modules.add("map", mapModule);
        modules.add("timeline", timelineModule);
        modules.add("players", buildPlayerMetrics(safeDuration, wardRows, laneAssignments,
                laningModule, combatModule, farmModule));
        modules.add("module_evidence", buildModuleEvidence(wardRows, objectiveRows, combatModule,
                objectiveModule, timelineModule));
        modules.add("coordinate_system", coordinates.manifest());
        modules.add("ability_metadata", abilityMetadata.manifest());
        return modules;
    }

    private static void ensureAnalysisActive() {
        if (Thread.currentThread().isInterrupted()) {
            throw new IllegalStateException("Analysis canceled");
        }
    }

    private JsonObject buildModuleEvidence(List<JsonObject> wardRows, List<JsonObject> objectiveRows,
            JsonObject combatModule, JsonObject objectiveModule, JsonObject timelineModule) {
        long snapshotRows = snapshots.values().stream().mapToLong(Map::size).sum();
        long snapshotSlots = snapshots.values().stream().filter(rows -> !rows.isEmpty()).count();
        long farmRows = goldPoints.stream()
                .filter(point -> point.value > 0 && point.classification.countsAsIncome()).count();
        long laneUnitTracks = unitTracks.values().stream().filter(track -> track.kind.equals("lane_creep")).count();
        long neutralUnitTracks = unitTracks.values().stream().filter(track -> track.kind.equals("neutral")).count();
        boolean directVisibility = !heroVisibilityEvents.isEmpty() || snapshots.values().stream()
                .flatMap(rows -> rows.values().stream()).anyMatch(snapshot -> snapshot.visibleByTeam != null);
        int fights = combatModule.getAsJsonArray("fights").size();
        int timelineEvents = timelineModule.getAsJsonArray("events").size();

        JsonObject result = new JsonObject();
        result.add("snapshots", moduleEvidence("fact", snapshotSlots == 10 ? "available" : snapshotRows > 0 ? "partial" : "missing",
                snapshotSlots == 10 ? 99 : snapshotRows > 0 ? 55 : 0,
                List.of("Replay interval"), snapshotSlots == 10 ? List.of() : List.of("ten_player_snapshots")));
        result.add("development", moduleEvidence("derived", snapshotRows > 0 ? "available" : "missing",
                snapshotRows > 0 ? 88 : 0, List.of("Replay interval", "CombatLog gold"),
                snapshotRows > 0 ? List.of("lane_unit_trajectories") : List.of("player_snapshots")));
        result.add("build", moduleEvidence("fact", purchases.isEmpty() && abilityLevels.isEmpty() ? "partial" : "available",
                purchases.isEmpty() && abilityLevels.isEmpty() ? 45 : 96,
                List.of("CombatLog purchases", "Replay inventory"),
                purchases.isEmpty() ? List.of("purchase_events") : List.of()));
        List<String> farmMissing = new ArrayList<>();
        if (farmRows == 0) farmMissing.add("gold_events");
        if (laneUnitTracks == 0) farmMissing.add("lane_creep_positions");
        if (neutralUnitTracks == 0) farmMissing.add("camp_occupancy");
        farmMissing.add("team_resource_claims");
        result.add("farm", moduleEvidence("derived", farmRows > 0 || laneUnitTracks > 0 ? "available" : "missing",
                farmRows > 0 && laneUnitTracks > 0 && neutralUnitTracks > 0 ? 94
                        : farmRows > 0 || laneUnitTracks > 0 ? 72 : 0,
                List.of("CombatLog gold", "Replay interval", "Replay unit lifecycle"), farmMissing));
        result.add("laning", moduleEvidence("derived", snapshotSlots == 10 ? "available" : "partial",
                snapshotSlots == 10 ? 86 : 48, List.of("Replay interval"),
                List.of("lane_creep_positions", "tower_health_timeline", "exact_pull_state")));
        List<String> visionMissing = new ArrayList<>();
        if (wardRows.isEmpty()) visionMissing.add("ward_lifecycle");
        if (!directVisibility) visionMissing.add("exact_fog_of_war_mask");
        result.add("vision", moduleEvidence("derived", snapshotRows > 0 ? "available" : "missing",
                snapshotRows > 0 ? directVisibility ? 94 : 82 : 0,
                List.of("Replay ward entities", "CombatLog visibility", "Replay interval geometry"),
                visionMissing));
        result.add("combat", moduleEvidence("derived", fights > 0 ? "available"
                        : damages.isEmpty() ? "missing" : "partial",
                fights > 0 ? 90 : damages.isEmpty() ? 0 : 52,
                List.of("CombatLog", "Replay interval"), fights > 0 ? List.of()
                        : List.of("qualified_combat_clusters")));
        int roshanAttempts = objectiveModule.getAsJsonArray("roshan_attempts").size();
        result.add("objectives", moduleEvidence("derived", roshanAttempts > 0 ? "available" : "partial",
                roshanAttempts > 0 ? 91 : 45,
                List.of("CombatLog Roshan damage", "Game objective events", "Replay inventory"),
                roshanAttempts > 0 ? List.of("continuous_roshan_alive_state")
                        : List.of("roshan_damage_events")));
        result.add("map", moduleEvidence("derived", snapshotRows > 0 ? "available" : "missing",
                snapshotRows > 0 ? 92 : 0, List.of("Replay interval", "Map static data"),
                objectiveRows.isEmpty() ? List.of("objective_events") : List.of()));
        result.add("timeline", moduleEvidence("fact", timelineEvents > 0 ? "available" : "missing",
                timelineEvents > 0 ? 97 : 0, List.of("Replay event sequence"),
                timelineEvents > 0 ? List.of() : List.of("timeline_events")));
        result.add("players", moduleEvidence("derived", snapshotSlots == 10 ? "available" : "partial",
                snapshotSlots == 10 ? 88 : 52,
                List.of("Replay interval", "CombatLog", "OpenDota match aggregates"),
                List.of("hero_specific_cast_opportunities", "cross_match_rank_benchmark")));
        return result;
    }

    private static JsonObject moduleEvidence(String level, String status, int confidence,
            List<String> sources, List<String> missing) {
        JsonObject row = new JsonObject();
        row.addProperty("level", level);
        row.addProperty("status", status);
        row.addProperty("confidence", confidence);
        JsonArray reasons = new JsonArray();
        reasons.add(status.equals("available") ? "minimum_evidence_met"
                : status.equals("partial") ? "evidence_incomplete" : "required_records_missing");
        row.add("reasons", reasons);
        JsonArray sourceRows = new JsonArray();
        sources.forEach(sourceRows::add);
        row.add("sources", sourceRows);
        JsonArray missingRows = new JsonArray();
        missing.forEach(missingRows::add);
        row.add("missing", missingRows);
        return row;
    }

    private void acceptInterval(JsonObject event) {
        Integer slot = normalizedSlot(integerValue(event, "slot"));
        EventStamp stamp = eventStamp(event);
        if (slot == null || stamp == null) {
            return;
        }
        int time = stamp.gameSecond;
        String unit = stringValue(event, "unit");
        if (unit != null) {
            heroSlots.put(heroKey(unit), slot);
        }
        JsonArray abilities = compactAbilities(event.get("hero_abilities"));
        JsonArray inventory = compactInventory(event.get("hero_inventory"));
        if (!hasValue(event, "x") && !hasValue(event, "networth")
                && !hasValue(event, "move_speed") && !hasValue(event, "visible_by_team")
                && abilities == null && inventory == null) {
            return;
        }

        Snapshot snapshot = new Snapshot(
                stamp,
                slot,
                integerValue(event, "gold"),
                integerValue(event, "networth"),
                integerValue(event, "xp"),
                integerValue(event, "lh"),
                floatValue(event, "x"),
                floatValue(event, "y"),
                floatValue(event, "z"),
                floatValue(event, "hp"),
                floatValue(event, "max_hp"),
                floatValue(event, "mana"),
                floatValue(event, "max_mana"),
                integerValue(event, "level"),
                integerValue(event, "kills"),
                integerValue(event, "deaths"),
                integerValue(event, "assists"),
                integerValue(event, "denies"),
                integerValue(event, "life_state"),
                integerValue(event, "camps_stacked"),
                integerValue(event, "creeps_stacked"),
                integerValue(event, "rune_pickups"),
                integerValue(event, "obs_placed"),
                integerValue(event, "sen_placed"),
                integerValue(event, "move_speed"),
                integerValue(event, "visible_by_team"),
                integerValue(event, "day_vision_range"),
                integerValue(event, "night_vision_range"),
                integerValue(event, "fow_team"),
                floatValue(event, "reveal_radius"),
                booleanValue(event, "selection_ring_visible"),
                abilities,
                inventory);
        snapshots.computeIfAbsent(slot, ignored -> new TreeMap<>()).put(time, snapshot);

        if (inventory != null) {
            String signature = inventoryStructureSignature(inventory);
            if (!signature.equals(inventorySignatures.put(slot, signature))) {
                inventoryPoints.computeIfAbsent(slot, ignored -> new ArrayList<>())
                        .add(new InventoryPoint(stamp, inventory));
            }
        }
    }

    private void acceptUnitEvent(JsonObject event, String type) {
        EventStamp stamp = eventStamp(event);
        Integer handle = firstInteger(event, "ehandle", "entity_index");
        String unit = stringValue(event, "unit");
        String kind = stringValue(event, "unit_kind");
        if (stamp == null || handle == null || unit == null || kind == null) return;

        Float rawX = floatValue(event, "x");
        Float rawY = floatValue(event, "y");
        MapCoordinateService.Point point = rawX == null || rawY == null
                ? null : coordinates.fromEntity(rawX, rawY);
        Integer team = integerValue(event, "team");
        coordinates.observeEntity(handle, unit, kind, team, point, stamp.gameSecond);

        if (kind.equals("hero")) {
            Integer slot = normalizedSlot(firstInteger(event, "owner_slot", "slot"));
            if (slot == null) slot = heroSlots.get(heroKey(unit));
            Integer visibleByTeam = integerValue(event, "visible_by_team");
            if (visibleByTeam != null) {
                heroVisibilityEvents.add(new HeroVisibilityEvent(stamp.gameSecond, slot,
                        heroKey(unit), visibleByTeam));
            }
            return;
        }

        String normalizedUnit = unit.toLowerCase(Locale.ROOT);
        boolean laneCreep = kind.equals("lane_creep");
        boolean farmNeutral = kind.equals("neutral")
                && !normalizedUnit.contains("neutralspawner") && !normalizedUnit.contains("roshan");
        if (!laneCreep && !farmNeutral) return;

        UnitTrack track = unitTracks.computeIfAbsent(handle,
                ignored -> new UnitTrack(handle, unit, kind, team, stamp));
        track.observe(type, stamp, team, point == null ? null : position(point),
                floatValue(event, "hp"), floatValue(event, "max_hp"), integerValue(event, "life_state"));
    }

    private void acceptAction(JsonObject event) {
        Integer slot = normalizedSlot(integerValue(event, "slot"));
        EventStamp stamp = eventStamp(event);
        if (slot == null || stamp == null || stamp.gameSecond < 0) return;
        actionCounts.merge(slot, 1, Integer::sum);
    }

    private void acceptPurchase(JsonObject event) {
        String key = stripPrefix(stringValue(event, "valuename"), "item_");
        if (key == null || key.isBlank()) {
            return;
        }
        EventStamp stamp = eventStamp(event);
        if (stamp == null) return;
        purchases.add(new ActorEvent(
                stamp,
                "purchase",
                normalizedSlot(integerValue(event, "slot")),
                heroKey(stringValue(event, "targetname")),
                null,
                key,
                intValue(event, "event_networth", 0),
                intValue(event, "value", 0)));
    }

    private void acceptAbilityLevel(JsonObject event) {
        int level = intValue(event, "abilitylevel", 0);
        String key = stringValue(event, "valuename");
        if (level <= 0 || key == null || key.equals("generic_hidden")) {
            return;
        }
        EventStamp stamp = eventStamp(event);
        if (stamp == null) return;
        abilityLevels.add(new ActorEvent(
                stamp,
                "ability_level",
                normalizedSlot(integerValue(event, "slot")),
                heroKey(stringValue(event, "targetname")),
                null,
                key,
                level,
                0));
    }

    private void acceptUsage(JsonObject event, String type) {
        EventStamp stamp = eventStamp(event);
        String key = stringValue(event, "inflictor");
        if (stamp == null || key == null || key.equals("null")) {
            return;
        }
        boolean item = type.equals("DOTA_COMBATLOG_ITEM");
        usages.add(new ActorEvent(
                stamp,
                item ? "item_use" : "ability_use",
                null,
                heroKey(stringValue(event, "attackername")),
                heroKey(stringValue(event, "targetname")),
                item ? stripPrefix(key, "item_") : key,
                intValue(event, "value", 0),
                0));
    }

    private void acceptGold(JsonObject event) {
        EventStamp stamp = eventStamp(event);
        int value = intValue(event, "value", 0);
        if (stamp == null || value == 0) {
            return;
        }
        int reason = intValue(event, "gold_reason", 0);
        goldPoints.add(new GoldPoint(
                stamp,
                heroKey(stringValue(event, "targetname")),
                value,
                reason,
                goldReasons.classify(reason),
                floatValue(event, "event_x"),
                floatValue(event, "event_y")));
    }

    private void acceptDeath(JsonObject event) {
        EventStamp stamp = eventStamp(event);
        if (stamp == null) return;
        deaths.add(new DeathPoint(
                stamp,
                heroKey(stringValue(event, "attackername")),
                heroKey(stringValue(event, "targetname")),
                stringValue(event, "attackername"),
                stringValue(event, "targetname"),
                Boolean.TRUE.equals(booleanValue(event, "targethero")),
                Boolean.TRUE.equals(booleanValue(event, "attackerhero")),
                intValue(event, "value", 0),
                integerValue(event, "event_last_hits"),
                integerValue(event, "neutral_camp_type"),
                integerValue(event, "attacker_team"),
                integerValue(event, "target_team"),
                stringValue(event, "inflictor")));
    }

    private void acceptDamage(JsonObject event) {
        EventStamp stamp = eventStamp(event);
        int value = intValue(event, "value", 0);
        String attackerName = stringValue(event, "attackername");
        String targetName = stringValue(event, "targetname");
        boolean targetHero = Boolean.TRUE.equals(booleanValue(event, "targethero"));
        boolean roshanTarget = "npc_dota_roshan".equals(targetName);
        if (stamp == null || value <= 0 || !targetHero && !roshanTarget) {
            return;
        }
        damages.add(new DamagePoint(
                stamp,
                heroKey(attackerName),
                heroKey(targetName),
                attackerName,
                targetName,
                stringValue(event, "inflictor"),
                value,
                Boolean.TRUE.equals(booleanValue(event, "visible_radiant")),
                Boolean.TRUE.equals(booleanValue(event, "visible_dire")),
                Boolean.TRUE.equals(booleanValue(event, "attackerhero")),
                targetHero,
                integerValue(event, "attacker_team"),
                integerValue(event, "target_team"),
                integerValue(event, "event_health")));
    }

    private void acceptSpecialModifier(JsonObject event, boolean removed) {
        if (!"modifier_teleporting".equals(stringValue(event, "inflictor"))) return;
        EventStamp stamp = eventStamp(event);
        if (stamp == null || !Boolean.TRUE.equals(booleanValue(event, "targethero"))) return;
        teleportChannels.add(new TeleportChannelPoint(
                stamp,
                heroKey(stringValue(event, "targetname")),
                removed,
                floatNumber(event, "modifier_duration", 0.0f),
                floatNumber(event, "modifier_elapsed_duration", 0.0f),
                Boolean.TRUE.equals(booleanValue(event, "modifier_purged")),
                stringValue(event, "sourcename")));
    }

    private void acceptStealthModifier(JsonObject event, boolean removed) {
        EventStamp stamp = eventStamp(event);
        String modifier = stringValue(event, "inflictor");
        if (stamp == null || modifier == null || !Boolean.TRUE.equals(booleanValue(event, "targethero"))) {
            return;
        }
        boolean smoke = modifier.contains("smoke_of_deceit");
        boolean invisibility = Boolean.TRUE.equals(booleanValue(event, "invisibility_modifier"))
                || modifier.contains("rune_invis") || modifier.contains("invisible");
        if (!smoke && !invisibility) return;
        stealthModifierEvents.add(new StealthModifierEvent(
                stamp,
                heroKey(stringValue(event, "targetname")),
                modifier,
                removed,
                smoke ? StealthKind.SMOKE : StealthKind.INVISIBLE,
                !modifier.contains("slark_shadow_dance") && !modifier.contains("depth_shroud")));
    }

    private void acceptHeal(JsonObject event) {
        EventStamp stamp = eventStamp(event);
        int value = intValue(event, "value", 0);
        if (stamp == null || value <= 0 || !Boolean.TRUE.equals(booleanValue(event, "targethero"))) {
            return;
        }
        heals.add(new HealPoint(
                stamp,
                heroKey(stringValue(event, "attackername")),
                heroKey(stringValue(event, "targetname")),
                stringValue(event, "inflictor"),
                value,
                Boolean.TRUE.equals(booleanValue(event, "heal_from_regen")),
                Boolean.TRUE.equals(booleanValue(event, "heal_from_lifesteal"))));
    }

    private void acceptControl(JsonObject event) {
        EventStamp stamp = eventStamp(event);
        if (stamp == null || !Boolean.TRUE.equals(booleanValue(event, "targethero"))) {
            return;
        }
        float stun = floatNumber(event, "stun_duration", 0.0f);
        boolean silence = Boolean.TRUE.equals(booleanValue(event, "silence_modifier"));
        boolean root = Boolean.TRUE.equals(booleanValue(event, "root_modifier"));
        float duration = stun > 0 ? stun : (silence || root ? floatNumber(event, "modifier_duration", 0.0f) : 0.0f);
        if (duration <= 0 || duration > 30) {
            return;
        }
        controls.add(new ControlPoint(
                stamp,
                heroKey(stringValue(event, "attackername")),
                heroKey(stringValue(event, "targetname")),
                stringValue(event, "inflictor"),
                stun > 0 ? "stun" : root ? "root" : "silence",
                duration));
    }

    private void acceptWard(JsonObject event, String type) {
        Integer handle = integerValue(event, "ehandle");
        if (handle == null) {
            return;
        }
        boolean leaving = type.endsWith("_left");
        WardPoint ward = wards.computeIfAbsent(handle, ignored -> new WardPoint(handle));
        EventStamp stamp = eventStamp(event);
        if (stamp == null) return;
        if (!leaving) {
            ward.placedStamp = stamp;
            ward.placedAt = stamp.gameSecond;
            ward.type = type.equals("obs") ? "observer" : "sentry";
            ward.team = integerValue(event, "team");
            ward.ownerSlot = normalizedSlot(firstInteger(event, "owner_slot", "slot"));
            ward.rawX = floatValue(event, "x");
            ward.rawY = floatValue(event, "y");
            ward.visionRange = integerValue(event, "day_vision_range");
        } else {
            if (ward.placedStamp == null) {
                ward.placedStamp = stamp;
                ward.placedAt = stamp.gameSecond;
            }
            ward.endedStamp = stamp;
            ward.endedAt = stamp.gameSecond;
            ward.lifetimeMs = longValue(event, "ward_lifetime_ms");
            ward.endReason = stringValue(event, "ward_end_reason");
            ward.killerKey = heroKey(stringValue(event, "attackername"));
            if (ward.rawX == null) ward.rawX = floatValue(event, "x");
            if (ward.rawY == null) ward.rawY = floatValue(event, "y");
            if (ward.ownerSlot == null) ward.ownerSlot = normalizedSlot(firstInteger(event, "owner_slot", "slot"));
            if (ward.team == null) ward.team = integerValue(event, "team");
            if (ward.type == null) ward.type = type.startsWith("obs") ? "observer" : "sentry";
        }
    }

    private void acceptBuilding(JsonObject event) {
        EventStamp stamp = eventStamp(event);
        String target = stringValue(event, "targetname");
        if (stamp == null || target == null || (!target.contains("tower") && !target.contains("rax")
                && !target.contains("fort"))) {
            return;
        }
        objectives.add(new ObjectivePoint(stamp, "building", target, null,
                integerValue(event, "attacker_team"), integerValue(event, "target_team")));
    }

    private void acceptChatObjective(JsonObject event, String type) {
        EventStamp stamp = eventStamp(event);
        if (stamp == null) return;
        String kind = switch (type) {
            case "CHAT_MESSAGE_ROSHAN_KILL" -> "roshan";
            case "CHAT_MESSAGE_AEGIS" -> "aegis";
            default -> "courier";
        };
        Integer actorSlot = type.equals("CHAT_MESSAGE_ROSHAN_KILL")
                ? integerValue(event, "player2")
                : integerValue(event, "player1");
        objectives.add(new ObjectivePoint(stamp, kind, null,
                normalizedSlot(actorSlot), null, null));
    }

    private void resolveActorSlots() {
        purchases.forEach(event -> event.resolve(heroSlots));
        abilityLevels.forEach(event -> event.resolve(heroSlots));
        usages.forEach(event -> event.resolve(heroSlots));
        goldPoints.forEach(event -> event.slot = heroSlots.get(event.actorKey));
        deaths.forEach(event -> {
            event.attackerSlot = heroSlots.get(event.attackerKey);
            event.targetSlot = heroSlots.get(event.targetKey);
        });
        damages.forEach(event -> {
            event.attackerSlot = heroSlots.get(event.attackerKey);
            event.targetSlot = heroSlots.get(event.targetKey);
        });
        heals.forEach(event -> {
            event.attackerSlot = heroSlots.get(event.attackerKey);
            event.targetSlot = heroSlots.get(event.targetKey);
        });
        controls.forEach(event -> {
            event.attackerSlot = heroSlots.get(event.attackerKey);
            event.targetSlot = heroSlots.get(event.targetKey);
        });
        teleportChannels.forEach(event -> event.slot = heroSlots.get(event.targetKey));
        stealthModifierEvents.forEach(event -> event.slot = heroSlots.get(event.targetKey));
        heroVisibilityEvents.forEach(event -> {
            if (event.slot == null) event.slot = heroSlots.get(event.heroKey);
        });
        wards.values().forEach(ward -> ward.killerSlot = heroSlots.get(ward.killerKey));
    }

    private void resolveGoldClassifications() {
        for (GoldPoint point : goldPoints) {
            GoldReasonCatalog.Entry base = goldReasons.classify(point.reason);
            if (point.reason == 12) {
                DeathPoint heroDeath = deaths.stream()
                        .filter(death -> death.targetHero && Math.abs(death.time - point.time) <= 1)
                        .filter(death -> death.attackerSlot != null && point.slot != null
                                && teamForSlot(death.attackerSlot) == teamForSlot(point.slot))
                        .min(Comparator.comparingInt(death -> Math.abs(death.time - point.time)))
                        .orElse(null);
                if (heroDeath != null && !point.slot.equals(heroDeath.attackerSlot)) {
                    point.classification = goldReasons.contextual(base, "hero_assist", "combat", true, true);
                    continue;
                }
            }
            if (point.reason == 13 || point.reason == 14) {
                DeathPoint unitDeath = deaths.stream()
                        .filter(death -> !death.targetHero && death.attackerSlot != null
                                && death.attackerSlot.equals(point.slot) && Math.abs(death.time - point.time) <= 1)
                        .min(Comparator.comparingInt(death -> Math.abs(death.time - point.time)))
                        .orElse(null);
                if (unitDeath != null) {
                    String kind = unitKind(unitDeath);
                    if (kind.equals("ancient")) {
                        point.classification = goldReasons.contextual(base, "ancient", "farm", true, true);
                        continue;
                    }
                    if (kind.equals("necro") || kind.equals("other") && point.reason == 13
                            && unitDeath.targetName != null && !unitDeath.targetName.contains("creep")) {
                        point.classification = goldReasons.contextual(base, "summoned_unit", "combat", true, true);
                        continue;
                    }
                }
            }
            point.classification = base;
        }
    }

    private void resolveUnitLifecycleAttribution() {
        Set<Integer> matchedHandles = new HashSet<>();
        List<DeathPoint> unitDeaths = deaths.stream()
                .filter(death -> !death.targetHero)
                .sorted(Comparator.comparingLong((DeathPoint death) -> death.stamp.gameTimeMs)
                        .thenComparingLong(death -> death.stamp.eventSequence))
                .toList();
        for (DeathPoint death : unitDeaths) {
            String deathKind = unitKind(death);
            if (!(deathKind.equals("lane") || deathKind.equals("neutral") || deathKind.equals("ancient"))) {
                continue;
            }
            UnitTrack best = null;
            long bestTimeDelta = Long.MAX_VALUE;
            long bestSequenceDelta = Long.MAX_VALUE;
            for (UnitTrack track : unitTracks.values()) {
                if (matchedHandles.contains(track.handle) || track.deathStamp == null) continue;
                if (deathKind.equals("lane") != track.kind.equals("lane_creep")) continue;
                if (!deathKind.equals("lane") && !track.kind.equals("neutral")) continue;
                if (death.targetTeam != null && track.team != null && !death.targetTeam.equals(track.team)) continue;
                long timeDelta = Math.abs(track.deathStamp.gameTimeMs - death.stamp.gameTimeMs);
                if (timeDelta > 1_500) continue;
                long sequenceDelta = Math.abs(track.deathStamp.eventSequence - death.stamp.eventSequence);
                if (timeDelta < bestTimeDelta || timeDelta == bestTimeDelta && sequenceDelta < bestSequenceDelta) {
                    best = track;
                    bestTimeDelta = timeDelta;
                    bestSequenceDelta = sequenceDelta;
                }
            }
            if (best != null && (bestTimeDelta == 0 || bestSequenceDelta <= 96)) {
                best.combatDeath = death;
                death.unitHandle = best.handle;
                matchedHandles.add(best.handle);
            }
        }

        Set<GoldPoint> matchedGold = Collections.newSetFromMap(new java.util.IdentityHashMap<>());
        for (UnitTrack track : unitTracks.values()) {
            DeathPoint death = track.combatDeath;
            if (death == null || death.attackerSlot == null) continue;
            GoldPoint best = goldPoints.stream()
                    .filter(point -> !matchedGold.contains(point) && point.slot != null
                            && point.slot.equals(death.attackerSlot) && point.value > 0
                            && Math.abs(point.stamp.gameTimeMs - death.stamp.gameTimeMs) <= 1_500)
                    .filter(point -> track.kind.equals("lane_creep")
                            ? point.classification.source().equals("lane_creep")
                            : point.classification.source().equals("neutral")
                                    || point.classification.source().equals("ancient"))
                    .min(Comparator.comparingLong(point -> Math.abs(
                            point.stamp.eventSequence - death.stamp.eventSequence)))
                    .orElse(null);
            if (best != null) {
                track.observedGold = best.value;
                matchedGold.add(best);
            }
        }
    }

    private JsonObject buildSnapshots() {
        JsonObject result = new JsonObject();
        snapshots.forEach((slot, rows) -> {
            JsonArray array = new JsonArray();
            rows.values().forEach(snapshot -> array.add(snapshot.toJson(coordinates, positionOf(snapshot))));
            result.add(Integer.toString(slot), array);
        });
        return AnalysisStorage.packSnapshots(result);
    }

    private JsonObject buildBuildModule() {
        JsonObject bySlot = new JsonObject();
        for (int slot = 0; slot < 10; slot++) {
            final int currentSlot = slot;
            JsonObject player = new JsonObject();
            player.add("purchases", actorEvents(purchases, currentSlot));
            player.add("abilities", actorEvents(uniqueAbilityLevels(), currentSlot));
            player.add("usage", actorEvents(usages, currentSlot));
            JsonArray inventory = new JsonArray();
            inventoryPoints.getOrDefault(slot, List.of()).forEach(point -> inventory.add(point.toJson()));
            player.add("inventory", inventory);
            bySlot.add(Integer.toString(slot), player);
        }
        JsonObject module = new JsonObject();
        module.add("by_slot", bySlot);
        return module;
    }

    private List<ActorEvent> uniqueAbilityLevels() {
        Set<String> seen = new HashSet<>();
        List<ActorEvent> result = new ArrayList<>();
        abilityLevels.stream()
                .sorted((left, right) -> compareEventStamps(left.stamp, right.stamp))
                .forEach(event -> {
                    String key = event.slot + ":" + event.key + ":" + event.value;
                    if (seen.add(key)) result.add(event);
                });
        return result;
    }

    private JsonArray actorEvents(List<ActorEvent> source, int slot) {
        JsonArray result = new JsonArray();
        source.stream()
                .filter(event -> event.slot != null && event.slot == slot)
                .sorted((left, right) -> compareEventStamps(left.stamp, right.stamp))
                .forEach(event -> result.add(event.toJson()));
        return result;
    }

    private JsonObject buildDevelopmentModule(int duration) {
        JsonObject segmentsBySlot = new JsonObject();
        for (int slot = 0; slot < 10; slot++) {
            segmentsBySlot.add(Integer.toString(slot), buildSegments(slot, duration));
        }
        JsonObject module = new JsonObject();
        module.add("segments_by_slot", segmentsBySlot);
        return module;
    }

    private Map<Integer, LaneAssignment> inferLaneAssignments(int duration) {
        int sampleEnd = Math.max(60, Math.min(duration, 420));
        Map<Integer, Map<String, Integer>> laneSeconds = new HashMap<>();
        for (int slot = 0; slot < 10; slot++) {
            Map<String, Integer> counts = new HashMap<>();
            NavigableMap<Integer, Snapshot> rows = snapshots.get(slot);
            if (rows != null) {
                rows.subMap(Math.min(45, sampleEnd), true, sampleEnd, true).values().forEach(snapshot -> {
                    if (snapshot.lifeState != null && snapshot.lifeState != 0) return;
                    String lane = laneForPosition(positionOf(snapshot));
                    if (!lane.equals("other")) counts.merge(lane, snapshot.time <= 300 ? 2 : 1, Integer::sum);
                });
            }
            laneSeconds.put(slot, counts);
        }

        Map<Integer, Integer> positions = new HashMap<>();
        for (int teamStart : List.of(0, 5)) {
            List<Integer> teamSlots = new ArrayList<>();
            for (int slot = teamStart; slot < teamStart + 5; slot++) teamSlots.add(slot);
            Set<Integer> assigned = new HashSet<>();
            String safeLane = teamStart == 0 ? "bottom" : "top";
            String offLane = teamStart == 0 ? "top" : "bottom";

            assignPosition(positions, assigned, teamSlots, laneSeconds, "mid", 2, sampleEnd, true);
            assignSideLanePairs(positions, assigned, teamSlots, laneSeconds, safeLane, offLane, sampleEnd);

            List<Integer> remaining = teamSlots.stream().filter(slot -> !assigned.contains(slot))
                    .sorted(Comparator.comparingInt((Integer slot) -> farmPriorityScore(slot, sampleEnd)).reversed())
                    .toList();
            List<Integer> missing = List.of(1, 2, 3, 4, 5).stream()
                    .filter(position -> !positions.containsValue(position)
                            || positions.entrySet().stream().noneMatch(entry -> entry.getKey() >= teamStart
                                    && entry.getKey() < teamStart + 5 && entry.getValue() == position))
                    .toList();
            for (int index = 0; index < Math.min(remaining.size(), missing.size()); index++) {
                positions.put(remaining.get(index), missing.get(index));
            }
        }

        Map<Integer, LaneAssignment> result = new HashMap<>();
        for (int slot = 0; slot < 10; slot++) {
            int position = positions.getOrDefault(slot, slot % 5 + 1);
            String lane = position == 2 ? "mid"
                    : position == 1 || position == 5 ? (slot < 5 ? "bottom" : "top")
                    : (slot < 5 ? "top" : "bottom");
            Map<String, Integer> counts = laneSeconds.getOrDefault(slot, Map.of());
            int total = counts.values().stream().mapToInt(Integer::intValue).sum();
            int laneCount = counts.getOrDefault(lane, 0);
            double confidence = total == 0 ? 0.35 : Math.max(0.35, Math.min(0.96, laneCount / (double) total));
            result.put(slot, new LaneAssignment(slot, position, lane, confidence));
        }
        return result;
    }

    private void assignSideLanePairs(Map<Integer, Integer> positions, Set<Integer> assigned,
            List<Integer> teamSlots, Map<Integer, Map<String, Integer>> laneSeconds,
            String safeLane, String offLane, int time) {
        List<Integer> remaining = teamSlots.stream().filter(slot -> !assigned.contains(slot)).toList();
        if (remaining.size() != 4) {
            assignPosition(positions, assigned, teamSlots, laneSeconds, safeLane, 1, time, true);
            assignPosition(positions, assigned, teamSlots, laneSeconds, offLane, 3, time, true);
            assignPosition(positions, assigned, teamSlots, laneSeconds, safeLane, 5, time, false);
            assignPosition(positions, assigned, teamSlots, laneSeconds, offLane, 4, time, false);
            return;
        }

        List<Integer> safePair = null;
        long bestFit = Long.MIN_VALUE;
        for (int first = 0; first < remaining.size(); first++) {
            for (int second = first + 1; second < remaining.size(); second++) {
                Set<Integer> candidateSafe = Set.of(remaining.get(first), remaining.get(second));
                long fit = 0;
                for (int slot : remaining) {
                    String lane = candidateSafe.contains(slot) ? safeLane : offLane;
                    fit += laneSeconds.getOrDefault(slot, Map.of()).getOrDefault(lane, 0);
                }
                if (fit > bestFit) {
                    bestFit = fit;
                    safePair = List.of(remaining.get(first), remaining.get(second));
                }
            }
        }
        if (safePair == null) return;
        Set<Integer> safeSet = new HashSet<>(safePair);
        List<Integer> offPair = remaining.stream().filter(slot -> !safeSet.contains(slot)).toList();
        assignLanePair(positions, assigned, safePair, 1, 5, time);
        assignLanePair(positions, assigned, offPair, 3, 4, time);
    }

    private void assignLanePair(Map<Integer, Integer> positions, Set<Integer> assigned,
            List<Integer> pair, int corePosition, int supportPosition, int time) {
        if (pair.size() != 2) return;
        List<Integer> byFarm = pair.stream()
                .sorted(Comparator.comparingInt((Integer slot) -> farmPriorityScore(slot, time)).reversed())
                .toList();
        positions.put(byFarm.get(0), corePosition);
        positions.put(byFarm.get(1), supportPosition);
        assigned.addAll(pair);
    }

    private void assignPosition(Map<Integer, Integer> positions, Set<Integer> assigned, List<Integer> teamSlots,
            Map<Integer, Map<String, Integer>> laneSeconds, String lane, int position, int time,
            boolean preferFarm) {
        Integer best = teamSlots.stream().filter(slot -> !assigned.contains(slot))
                .max(Comparator.comparingLong(slot -> {
                    long presence = laneSeconds.getOrDefault(slot, Map.of()).getOrDefault(lane, 0);
                    long farm = farmPriorityScore(slot, time);
                    return presence * 1_000_000L + (preferFarm ? farm : -farm);
                })).orElse(null);
        if (best == null) return;
        positions.put(best, position);
        assigned.add(best);
    }

    private int farmPriorityScore(int slot, int time) {
        Snapshot snapshot = snapshotAt(slot, time);
        if (snapshot == null) return 0;
        return valueOrZero(snapshot.lh) * 100 + valueOrZero(snapshot.networth) / 10;
    }

    private JsonObject buildLaningModule(int duration, List<JsonObject> wardRows,
            Map<Integer, LaneAssignment> assignments) {
        int reviewEnd = Math.min(duration, 600);
        JsonObject positionsBySlot = new JsonObject();
        JsonObject matchupBySlot = new JsonObject();
        JsonObject reviewsBySlot = new JsonObject();
        int[] counterpart = {0, 3, 2, 1, 5, 4};
        for (int slot = 0; slot < 10; slot++) {
            LaneAssignment assignment = assignments.get(slot);
            JsonObject position = new JsonObject();
            position.addProperty("slot", slot);
            position.addProperty("position", assignment.position);
            position.addProperty("lane", assignment.lane);
            position.addProperty("confidence", Math.round(assignment.confidence * 100));
            positionsBySlot.add(Integer.toString(slot), position);

            Integer opponent = slotByPosition(assignments, slot < 5 ? 5 : 0, counterpart[assignment.position]);
            if (opponent == null) matchupBySlot.add(Integer.toString(slot), null);
            else matchupBySlot.addProperty(Integer.toString(slot), opponent);
            reviewsBySlot.add(Integer.toString(slot), buildLaneReview(slot, reviewEnd, wardRows, assignments));
        }
        JsonObject module = new JsonObject();
        module.addProperty("review_end", reviewEnd);
        module.addProperty("model", "lane-pair/1.1");
        module.add("positions_by_slot", positionsBySlot);
        module.add("matchup_slot_by_slot", matchupBySlot);
        module.add("reviews_by_slot", reviewsBySlot);
        JsonArray missing = new JsonArray();
        missing.add("lane_creep_positions");
        missing.add("tower_health_timeline");
        missing.add("exact_pull_state");
        module.add("missing_evidence", missing);
        return module;
    }

    private JsonObject buildLaneReview(int slot, int end, List<JsonObject> wardRows,
            Map<Integer, LaneAssignment> assignments) {
        LaneAssignment selected = assignments.get(slot);
        int teamStart = slot < 5 ? 0 : 5;
        int enemyStart = slot < 5 ? 5 : 0;
        int corePosition = selected.position == 2 ? 2 : selected.position == 1 || selected.position == 5 ? 1 : 3;
        int supportPosition = corePosition == 1 ? 5 : corePosition == 3 ? 4 : 0;
        int enemyCorePosition = corePosition == 1 ? 3 : corePosition == 3 ? 1 : 2;
        int enemySupportPosition = enemyCorePosition == 1 ? 5 : enemyCorePosition == 3 ? 4 : 0;
        int ownCore = slotByPosition(assignments, teamStart, corePosition);
        Integer ownSupport = supportPosition == 0 ? null : slotByPosition(assignments, teamStart, supportPosition);
        int enemyCore = slotByPosition(assignments, enemyStart, enemyCorePosition);
        Integer enemySupport = enemySupportPosition == 0 ? null : slotByPosition(assignments, enemyStart, enemySupportPosition);
        String lane = selected.lane;

        SupportRoute ownRoute = supportRoute(ownSupport, ownCore, lane, end, wardRows);
        SupportRoute enemyRoute = supportRoute(enemySupport, enemyCore, lane, end, wardRows);
        LaneComparison comparison = laneComparison(ownCore, ownSupport, enemyCore, enemySupport, lane, end,
                ownRoute, enemyRoute);

        JsonObject row = new JsonObject();
        row.addProperty("slot", slot);
        row.addProperty("position", selected.position);
        row.addProperty("lane", lane);
        row.addProperty("own_core_slot", ownCore);
        addNullable(row, "own_support_slot", ownSupport);
        row.addProperty("enemy_core_slot", enemyCore);
        addNullable(row, "enemy_support_slot", enemySupport);
        row.addProperty("score", comparison.score);
        row.addProperty("verdict", laneVerdict(comparison.score));
        int confidence = (int) Math.round(45 + Math.min(37, averageAssignmentConfidence(assignments,
                java.util.Arrays.asList(ownCore, ownSupport, enemyCore, enemySupport)) * 37));
        row.addProperty("confidence", confidence);
        row.add("core", comparison.coreJson());
        row.add("lane_pair", comparison.pairJson());
        row.add("support", comparison.supportJson());
        row.add("support_route", ownRoute.toJson(coordinates));
        row.add("enemy_support_route", enemyRoute.toJson(coordinates));

        JsonArray checkpoints = new JsonArray();
        for (int time : List.of(180, 300, 420, 600)) {
            if (time > end) continue;
            checkpoints.add(laneComparison(ownCore, ownSupport, enemyCore, enemySupport, lane, time,
                    SupportRoute.empty(), SupportRoute.empty()).checkpointJson(time));
        }
        row.add("checkpoints", checkpoints);

        JsonArray factors = new JsonArray();
        factors.add(comparison.lhDiff >= 0
                ? "核心补刀领先 " + comparison.lhDiff
                : "核心补刀落后 " + Math.abs(comparison.lhDiff));
        factors.add(comparison.levelDiff == 0 ? "核心等级持平"
                : comparison.levelDiff > 0 ? "核心等级领先 " + comparison.levelDiff + " 级"
                        : "核心等级落后 " + Math.abs(comparison.levelDiff) + " 级");
        factors.add(comparison.pairXpDiff >= 0
                ? "双人总经验领先 " + comparison.pairXpDiff
                : "双人总经验落后 " + Math.abs(comparison.pairXpDiff));
        if (ownSupport != null) {
            factors.add(comparison.supportXpDiff >= 0
                    ? "辅助经验领先对位 " + comparison.supportXpDiff
                    : "辅助经验落后对位 " + Math.abs(comparison.supportXpDiff));
            factors.add("核心与辅助经验差 " + comparison.ownCoreSupportXpGap);
            factors.add(ownRoute.interpretation);
        }
        row.add("factors", factors);
        JsonArray missing = new JsonArray();
        missing.add("兵线单位精确位置");
        missing.add("防御塔血量时间线");
        missing.add("拉野兵线归属");
        row.add("missing", missing);
        return row;
    }

    private LaneComparison laneComparison(int ownCore, Integer ownSupport, int enemyCore, Integer enemySupport,
            String lane, int time, SupportRoute ownRoute, SupportRoute enemyRoute) {
        Snapshot own = snapshotAt(ownCore, time);
        Snapshot enemy = snapshotAt(enemyCore, time);
        Snapshot ownSupportSnapshot = ownSupport == null ? null : snapshotAt(ownSupport, time);
        Snapshot enemySupportSnapshot = enemySupport == null ? null : snapshotAt(enemySupport, time);
        int lhDiff = valueOrZero(own == null ? null : own.lh) - valueOrZero(enemy == null ? null : enemy.lh);
        int denyDiff = valueOrZero(own == null ? null : own.denies)
                + valueOrZero(ownSupportSnapshot == null ? null : ownSupportSnapshot.denies)
                - valueOrZero(enemy == null ? null : enemy.denies)
                - valueOrZero(enemySupportSnapshot == null ? null : enemySupportSnapshot.denies);
        int levelDiff = valueOrZero(own == null ? null : own.level) - valueOrZero(enemy == null ? null : enemy.level);
        int coreXpDiff = valueOrZero(own == null ? null : own.xp) - valueOrZero(enemy == null ? null : enemy.xp);
        int pairXpDiff = valueOrZero(own == null ? null : own.xp)
                + valueOrZero(ownSupportSnapshot == null ? null : ownSupportSnapshot.xp)
                - valueOrZero(enemy == null ? null : enemy.xp)
                - valueOrZero(enemySupportSnapshot == null ? null : enemySupportSnapshot.xp);
        int pairNetworthDiff = valueOrZero(own == null ? null : own.networth)
                + valueOrZero(ownSupportSnapshot == null ? null : ownSupportSnapshot.networth)
                - valueOrZero(enemy == null ? null : enemy.networth)
                - valueOrZero(enemySupportSnapshot == null ? null : enemySupportSnapshot.networth);
        int supportXpDiff = valueOrZero(ownSupportSnapshot == null ? null : ownSupportSnapshot.xp)
                - valueOrZero(enemySupportSnapshot == null ? null : enemySupportSnapshot.xp);
        int supportLevelDiff = valueOrZero(ownSupportSnapshot == null ? null : ownSupportSnapshot.level)
                - valueOrZero(enemySupportSnapshot == null ? null : enemySupportSnapshot.level);
        int ownCoreSupportXpGap = ownSupport == null ? 0
                : valueOrZero(own == null ? null : own.xp)
                        - valueOrZero(ownSupportSnapshot == null ? null : ownSupportSnapshot.xp);
        int enemyCoreSupportXpGap = enemySupport == null ? 0
                : valueOrZero(enemy == null ? null : enemy.xp)
                        - valueOrZero(enemySupportSnapshot == null ? null : enemySupportSnapshot.xp);
        int ownDeaths = heroDeathsInLane(ownCore, ownSupport, lane, time);
        int enemyDeaths = heroDeathsInLane(enemyCore, enemySupport, lane, time);
        int deathDiff = enemyDeaths - ownDeaths;

        double resourceScore = clampScore(lhDiff * 1.7 + denyDiff * 1.1, -40, 40);
        double levelSignal = levelDiff * 10.0;
        double coreXpSignal = coreXpDiff / 110.0;
        double coreExperienceScore = Math.abs(levelSignal) >= Math.abs(coreXpSignal)
                ? levelSignal : coreXpSignal;
        double supportExperienceScore = ownSupport == null || enemySupport == null
                ? 0 : clampScore(supportXpDiff / 180.0, -8, 8);
        double experienceScore = clampScore(coreExperienceScore + supportExperienceScore, -30, 30);
        double pressureScore = clampScore(deathDiff * 11.0, -20, 20);
        double routeScore = clampScore((ownRoute.score - enemyRoute.score) * 0.5, -10, 10);
        int score = (int) Math.round(clampScore(resourceScore + experienceScore + pressureScore + routeScore,
                -100, 100));
        return new LaneComparison(score, lhDiff, denyDiff, levelDiff, coreXpDiff, pairXpDiff,
                pairNetworthDiff, supportXpDiff, supportLevelDiff, ownCoreSupportXpGap,
                enemyCoreSupportXpGap, ownDeaths, enemyDeaths);
    }

    private SupportRoute supportRoute(Integer supportSlot, int coreSlot, String lane, int end,
            List<JsonObject> wardRows) {
        if (supportSlot == null || end < 60) return SupportRoute.empty();
        int laneSeconds = 0;
        int awaySeconds = 0;
        int soloXpSeconds = 0;
        int awayAssists = 0;
        int awayKills = 0;
        int coreDeathsAway = 0;
        int stacks = 0;
        int runes = 0;
        int wardsPlaced = 0;
        int coreXpAway = 0;
        int coreLastHitsAway = 0;
        Snapshot previousSupport = null;
        Snapshot previousCore = null;
        boolean previousAway = false;
        for (int time = 60; time <= end; time++) {
            Snapshot support = snapshotAt(supportSlot, time);
            Snapshot core = snapshotAt(coreSlot, time);
            boolean alive = support != null && (support.lifeState == null || support.lifeState == 0);
            boolean onLane = alive && lane.equals(laneForPosition(positionOf(support)));
            boolean away = alive && !onLane;
            if (onLane) laneSeconds++;
            else if (away) awaySeconds++;
            if (away && core != null && (core.lifeState == null || core.lifeState == 0)
                    && lane.equals(laneForPosition(positionOf(core)))) soloXpSeconds++;
            if (previousSupport != null && support != null) {
                if (away) {
                    awayAssists += positiveDelta(support.assists, previousSupport.assists);
                    awayKills += positiveDelta(support.kills, previousSupport.kills);
                    stacks += positiveDelta(support.campsStacked, previousSupport.campsStacked);
                    runes += positiveDelta(support.runePickups, previousSupport.runePickups);
                }
                if (away) {
                    wardsPlaced += positiveDelta(support.observersPlaced, previousSupport.observersPlaced)
                            + positiveDelta(support.sentriesPlaced, previousSupport.sentriesPlaced);
                }
            }
            if (previousCore != null && core != null && previousAway) {
                coreXpAway += positiveDelta(core.xp, previousCore.xp);
                coreLastHitsAway += positiveDelta(core.lh, previousCore.lh);
                coreDeathsAway += positiveDelta(core.deaths, previousCore.deaths);
            }
            previousSupport = support;
            previousCore = core;
            previousAway = away;
        }
        int placedFromWardEvents = (int) wardRows.stream()
                .filter(ward -> {
                    int placedAt = intValue(ward, "placedAt", -1);
                    Snapshot placedSnapshot = snapshotAt(supportSlot, placedAt);
                    return intValue(ward, "ownerSlot", -1) == supportSlot
                            && placedAt >= 60 && placedAt <= end && placedSnapshot != null
                            && !lane.equals(laneForPosition(positionOf(placedSnapshot)));
                })
                .count();
        wardsPlaced = Math.max(wardsPlaced, placedFromWardEvents);
        int productiveEvents = stacks + runes + awayAssists + awayKills + wardsPlaced;
        int score = stacks * 4 + runes * 3 + awayAssists * 5 + awayKills * 4 + wardsPlaced
                + (soloXpSeconds >= 90 && coreDeathsAway == 0 ? 5 : 0) - coreDeathsAway * 12
                - (awaySeconds >= 180 && productiveEvents == 0 ? 8 : 0);
        String interpretation;
        if (awaySeconds < 60) interpretation = "辅助以保线为主";
        else if (productiveEvents >= 2 && soloXpSeconds >= 90 && coreDeathsAway == 0) interpretation = "辅助离线有明确收益，核心安全单吃经验";
        else if (productiveEvents >= 2 && coreDeathsAway == 0) interpretation = "辅助离线完成控图或游走，线上代价有限";
        else if (soloXpSeconds >= 90 && coreDeathsAway == 0) interpretation = "辅助主动让级，核心获得较长单吃经验窗口";
        else if (coreDeathsAway > 0) interpretation = "辅助离线期间核心阵亡，离线代价偏高";
        else if (productiveEvents == 0 && awaySeconds >= 180) interpretation = "辅助长时间离线但缺少拉野、控符或游走收益";
        else interpretation = "辅助离线收益与线上代价接近";
        return new SupportRoute(laneSeconds, awaySeconds, soloXpSeconds, stacks, runes, wardsPlaced,
                awayAssists, awayKills, coreDeathsAway, coreXpAway, coreLastHitsAway, score, interpretation,
                supportRouteSegments(supportSlot, lane, end));
    }

    private List<RouteSegment> supportRouteSegments(int supportSlot, String lane, int end) {
        List<RouteSegment> segments = new ArrayList<>();
        String activeRegion = null;
        int activeStart = 60;
        int activeEnd = 60;
        Position activePosition = null;
        for (int time = 60; time <= end; time += 5) {
            Snapshot snapshot = snapshotAt(supportSlot, time);
            Position position = positionOf(snapshot);
            String region = snapshot == null ? "unknown"
                    : snapshot.lifeState != null && snapshot.lifeState != 0 ? "dead"
                            : lane.equals(laneForPosition(position)) ? lane + "_lane" : regionCode(position);
            if (activeRegion == null) {
                activeRegion = region;
                activeStart = time;
                activePosition = position;
            } else if (!activeRegion.equals(region)) {
                segments.add(new RouteSegment(activeStart, activeEnd, activeRegion, activePosition));
                activeRegion = region;
                activeStart = time;
                activePosition = position;
            }
            activeEnd = time;
        }
        if (activeRegion != null) segments.add(new RouteSegment(activeStart, activeEnd, activeRegion, activePosition));
        return segments.stream().filter(segment -> segment.end - segment.start >= 5)
                .limit(40).toList();
    }

    private int heroDeathsInLane(int coreSlot, Integer supportSlot, String lane, int end) {
        Set<Integer> laneSlots = new HashSet<>();
        laneSlots.add(coreSlot);
        if (supportSlot != null) laneSlots.add(supportSlot);
        return (int) deaths.stream().filter(death -> death.targetHero && death.targetSlot != null
                && laneSlots.contains(death.targetSlot) && death.time >= 0 && death.time <= end
                && lane.equals(laneForPosition(positionOf(snapshotAt(death.targetSlot, death.time)))))
                .count();
    }

    private static int positiveDelta(Integer current, Integer previous) {
        if (current == null || previous == null) return 0;
        return Math.max(0, current - previous);
    }

    private static int valueOrZero(Integer value) {
        return value == null ? 0 : value;
    }

    private static double clampScore(double value, double minimum, double maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    private static String laneVerdict(int score) {
        if (score >= 40) return "major_advantage";
        if (score >= 15) return "advantage";
        if (score > -15) return "even";
        if (score > -40) return "disadvantage";
        return "major_disadvantage";
    }

    private static Integer slotByPosition(Map<Integer, LaneAssignment> assignments, int teamStart, int position) {
        return assignments.values().stream()
                .filter(assignment -> assignment.slot >= teamStart && assignment.slot < teamStart + 5
                        && assignment.position == position)
                .map(assignment -> assignment.slot)
                .findFirst().orElse(null);
    }

    private static double averageAssignmentConfidence(Map<Integer, LaneAssignment> assignments,
            List<Integer> slots) {
        return slots.stream().filter(slot -> slot != null && assignments.containsKey(slot))
                .mapToDouble(slot -> assignments.get(slot).confidence).average().orElse(0.35);
    }

    private JsonArray buildSegments(int slot, int duration) {
        JsonArray result = new JsonArray();
        List<GoldPoint> playerGold = goldPoints.stream()
                .filter(point -> point.slot != null && point.slot == slot && point.value > 0
                        && point.classification.countsAsIncome())
                .toList();
        for (int start = 0; start <= duration; start += 60) {
            int end = Math.min(duration, start + 59);
            Map<String, Integer> amounts = new LinkedHashMap<>();
            float weightedX = 0;
            float weightedY = 0;
            int positionedGold = 0;
            int unitCount = 0;
            for (GoldPoint point : playerGold) {
                if (point.time < start || point.time > end) continue;
                String source = point.classification.source();
                amounts.merge(source, point.value, Integer::sum);
                Position position = goldPosition(point);
                if (position != null && point.classification.spatial()) {
                    weightedX += position.x * point.value;
                    weightedY += position.y * point.value;
                    positionedGold += point.value;
                }
                if (point.classification.category().equals("farm")) unitCount++;
            }
            int gold = amounts.values().stream().mapToInt(Integer::intValue).sum();
            Snapshot middle = snapshotAt(slot, (start + end) / 2);
            if (gold == 0 && middle == null) continue;
            String dominantSource = amounts.entrySet().stream()
                    .max(Map.Entry.comparingByValue()).map(Map.Entry::getKey).orElse("none");
            String source = segmentType(dominantSource);
            Position position = positionedGold > 0
                    ? new Position(weightedX / positionedGold, weightedY / positionedGold)
                    : positionOf(middle);
            Snapshot first = snapshotAt(slot, start);
            Snapshot last = snapshotAt(slot, end);
            int xp = first == null || last == null || first.xp == null || last.xp == null
                    ? 0 : Math.max(0, last.xp - first.xp);
            JsonObject row = new JsonObject();
            row.addProperty("id", "segment-" + slot + "-" + start);
            row.addProperty("start", start);
            row.addProperty("end", end);
            row.addProperty("type", source);
            row.addProperty("dominant_source", dominantSource);
            row.addProperty("gold", gold);
            row.addProperty("xp", xp);
            row.addProperty("units", unitCount);
            row.add("missed", null);
            row.addProperty("evidence", "derived");
            JsonObject breakdown = new JsonObject();
            amounts.forEach(breakdown::addProperty);
            row.add("source_breakdown", breakdown);
            if (position != null) {
                addPosition(row, position);
            }
            result.add(row);
        }
        return result;
    }

    private JsonObject buildFarmModule(int duration, List<JsonObject> wardRows,
            Map<Integer, LaneAssignment> laneAssignments, JsonArray laneWaves, JsonArray campStates) {
        JsonObject heatBySlot = new JsonObject();
        JsonObject goldBySlot = new JsonObject();
        JsonObject diagnosticsBySlot = new JsonObject();
        JsonObject anomaliesBySlot = new JsonObject();
        JsonObject relativeLowsBySlot = new JsonObject();
        JsonObject stackEventsBySlot = new JsonObject();
        JsonObject stackValueSummaryBySlot = new JsonObject();
        JsonObject cyclesBySlot = new JsonObject();
        for (int slot = 0; slot < 10; slot++) {
            heatBySlot.add(Integer.toString(slot), buildHeatCells(slot, duration));
            goldBySlot.add(Integer.toString(slot), buildGoldEvents(slot));
            JsonArray diagnostics = buildDiagnostics(slot, duration, wardRows, laneAssignments);
            diagnosticsBySlot.add(Integer.toString(slot), diagnostics);
            anomaliesBySlot.add(Integer.toString(slot), filterDiagnostics(diagnostics, "anomaly"));
            relativeLowsBySlot.add(Integer.toString(slot), filterDiagnostics(diagnostics, "relative_low"));
            JsonArray stackEvents = buildStackEvents(slot);
            stackEventsBySlot.add(Integer.toString(slot), stackEvents);
            stackValueSummaryBySlot.add(Integer.toString(slot), stackValueSummary(stackEvents));
            cyclesBySlot.add(Integer.toString(slot), buildLaneJungleCycles(slot, duration));
        }
        JsonObject module = new JsonObject();
        module.add("mechanics", buildFarmMechanics());
        module.add("gold_reason_catalog", goldReasons.manifest());
        module.add("gold_source_summary", buildGoldSourceSummary());
        module.addProperty("early_priority_seconds", Math.min(1200, duration));
        JsonObject routeAnalysis = new JsonObject();
        routeAnalysis.addProperty("schema", "phase-aware-core-resource-route/1.0");
        routeAnalysis.addProperty("core_positions", "1,2,3");
        routeAnalysis.addProperty("core_analysis_end", "match_end");
        routeAnalysis.addProperty("support_analysis_end_seconds", Math.min(1200, duration));
        routeAnalysis.addProperty("post20_benchmark_bucket_seconds", 300);
        routeAnalysis.addProperty("pre20_lookahead_seconds", 45);
        routeAnalysis.addProperty("post20_lookahead_seconds", 75);
        routeAnalysis.addProperty("strategic_commitment_exempt", true);
        routeAnalysis.addProperty("selection_policy", "phase_baseline_then_hard_gates_then_highest_score");
        module.add("route_analysis", routeAnalysis);
        module.add("heat_cells_by_slot", heatBySlot);
        module.add("gold_events_by_slot", goldBySlot);
        module.add("diagnostics_by_slot", diagnosticsBySlot);
        module.add("anomalies_by_slot", anomaliesBySlot);
        module.add("relative_lows_by_slot", relativeLowsBySlot);
        module.add("stack_events_by_slot", stackEventsBySlot);
        module.add("stack_value_summary_by_slot", stackValueSummaryBySlot);
        module.add("lane_jungle_cycles_by_slot", cyclesBySlot);
        module.add("unit_kills", buildUnitKills());
        module.add("creep_resolutions", buildCreepResolutions(duration));
        module.add("lane_opportunities_by_slot",
                buildLaneOpportunitiesBySlot(duration, laneAssignments));
        JsonObject resourceSchema = new JsonObject();
        resourceSchema.addProperty("schema", "observed-resource-state/1.1");
        resourceSchema.addProperty("lane_wave_interval_seconds", 30);
        resourceSchema.addProperty("neutral_cycle_seconds", 60);
        resourceSchema.addProperty("observed_enter_is_spawn_proof", false);
        resourceSchema.addProperty("unit_left_is_death_proof", false);
        resourceSchema.addProperty("combat_log_death_attribution", "millisecond_and_event_sequence_one_to_one");
        resourceSchema.addProperty("gold_attribution", "matched_combatlog_gold_event_only");
        resourceSchema.addProperty("states", "observed_present,observed_cleared,visibility_lost,unknown");
        resourceSchema.addProperty("evidence", "replay_unit_lifecycle");
        module.add("resource_state_schema", resourceSchema);
        module.add("lane_waves", laneWaves);
        module.add("camp_states", campStates);
        return module;
    }

    private static JsonArray filterDiagnostics(JsonArray diagnostics, String diagnosticClass) {
        JsonArray result = new JsonArray();
        for (JsonElement element : diagnostics) {
            JsonObject row = element.getAsJsonObject();
            if (diagnosticClass.equals(stringValue(row, "diagnostic_class"))) result.add(row.deepCopy());
        }
        return result;
    }

    private JsonObject buildGoldSourceSummary() {
        Map<String, GoldSourceAggregate> aggregates = new LinkedHashMap<>();
        int rawTotal = 0;
        int classifiedTotal = 0;
        int mappedEvents = 0;
        for (GoldPoint point : goldPoints) {
            rawTotal += point.value;
            classifiedTotal += point.value;
            if (point.classification.mapped()) mappedEvents++;
            aggregates.computeIfAbsent(point.classification.source(), ignored -> new GoldSourceAggregate())
                    .add(point.value);
        }
        JsonObject bySource = new JsonObject();
        aggregates.forEach((source, aggregate) -> bySource.add(source, aggregate.toJson()));
        JsonObject conservation = new JsonObject();
        conservation.addProperty("raw_total", rawTotal);
        conservation.addProperty("classified_total", classifiedTotal);
        conservation.addProperty("matches", rawTotal == classifiedTotal);
        JsonObject result = new JsonObject();
        result.addProperty("event_count", goldPoints.size());
        result.addProperty("mapped_events", mappedEvents);
        result.addProperty("unmapped_events", goldPoints.size() - mappedEvents);
        result.addProperty("unmapped_rate", goldPoints.isEmpty() ? 0
                : round2((goldPoints.size() - mappedEvents) / (double) goldPoints.size()));
        result.add("by_source", bySource);
        result.add("conservation", conservation);
        return result;
    }

    private JsonObject buildFarmMechanics() {
        JsonObject mechanics = new JsonObject();
        mechanics.addProperty("patch_baseline", "7.41d");
        mechanics.addProperty("lane_spawn_first", 0);
        mechanics.addProperty("lane_spawn_interval", 30);
        mechanics.addProperty("neutral_spawn_first", 60);
        mechanics.addProperty("neutral_spawn_interval", 60);
        mechanics.addProperty("flagbearer_first", 120);
        mechanics.addProperty("flagbearer_interval", 60);
        mechanics.addProperty("siege_first", 300);
        mechanics.addProperty("siege_interval", 300);
        mechanics.addProperty("lotus_first", 180);
        mechanics.addProperty("lotus_interval", 180);
        mechanics.addProperty("bounty_first", 0);
        mechanics.addProperty("bounty_interval", 240);
        mechanics.addProperty("water_rune_first", 120);
        mechanics.addProperty("water_rune_last", 240);
        mechanics.addProperty("power_rune_first", 360);
        mechanics.addProperty("power_rune_interval", 120);
        mechanics.addProperty("wisdom_first", 420);
        mechanics.addProperty("wisdom_interval", 420);
        mechanics.addProperty("tormentor_first", 1200);
        mechanics.addProperty("evidence", "patch_rules");
        return mechanics;
    }

    private JsonArray buildLaneWaves(int duration) {
        Map<String, LaneWaveAggregate> waves = new LinkedHashMap<>();
        for (UnitTrack track : unitTracks.values()) {
            if (!track.kind.equals("lane_creep") || track.team == null) continue;
            Position reference = track.referencePosition();
            MapCoordinateService.Point point = canonicalPoint(reference);
            if (point == null) continue;
            String lane = coordinates.nearestLane(point);
            int observedAt = Math.max(0, track.firstObserved);
            int expectedSpawn = Math.max(0, Math.round(observedAt / 30.0f) * 30);
            int waveIndex = expectedSpawn / 30;
            String key = track.team + ":" + lane + ":" + waveIndex;
            waves.computeIfAbsent(key,
                    ignored -> new LaneWaveAggregate(track.team, lane, waveIndex, expectedSpawn))
                    .add(track);
        }
        JsonArray rows = new JsonArray();
        waves.values().stream()
                .filter(wave -> wave.expectedSpawn <= duration)
                .sorted(Comparator.comparingInt((LaneWaveAggregate wave) -> wave.expectedSpawn)
                        .thenComparingInt(wave -> wave.team).thenComparing(wave -> wave.lane))
                .forEach(wave -> rows.add(wave.toJson()));
        return rows;
    }

    private JsonArray buildCreepResolutions(int duration) {
        JsonArray rows = new JsonArray();
        unitTracks.values().stream()
                .filter(track -> track.firstObserved <= duration)
                .sorted(Comparator.comparingInt((UnitTrack track) -> track.firstObserved)
                        .thenComparingInt(track -> track.handle))
                .forEach(track -> {
                    JsonObject row = new JsonObject();
                    row.addProperty("id", "unit-" + track.handle);
                    row.addProperty("handle", track.handle);
                    row.addProperty("unit_class", track.unit);
                    row.addProperty("kind", track.kind.equals("lane_creep") ? "lane" : "neutral");
                    addNullable(row, "team_id", track.team);
                    row.addProperty("first_observed", track.firstObserved);
                    row.addProperty("last_observed", track.lastObserved);
                    row.addProperty("sample_count", track.samples);

                    Position position = track.referencePosition();
                    if (position != null) addPosition(row, position);
                    if (track.kind.equals("lane_creep")) {
                        MapCoordinateService.Point point = canonicalPoint(position);
                        String lane = point == null ? "unknown" : coordinates.nearestLane(point);
                        int expectedSpawn = Math.max(0, Math.round(Math.max(0, track.firstObserved) / 30.0f) * 30);
                        row.addProperty("lane", lane);
                        row.addProperty("wave_id", "wave-" + track.team + "-" + lane + "-" + expectedSpawn / 30);
                    } else {
                        MapCoordinateService.CampAnchor camp = coordinates.nearestCamp(canonicalPoint(position));
                        if (camp != null && camp.distance() <= 8.5) {
                            row.addProperty("camp_id", camp.id());
                            row.addProperty("camp_cycle", Math.max(60,
                                    Math.max(60, track.firstObserved) / 60 * 60));
                        }
                    }

                    JsonArray deathEvidence = new JsonArray();
                    if (track.deathByLifeState) deathEvidence.add("life_state_nonzero");
                    if (track.deathByHpZero) deathEvidence.add("hp_zero");
                    if (track.combatDeath != null) deathEvidence.add("combat_log_death");
                    row.add("death_evidence", deathEvidence);

                    if (track.deathTime != null) {
                        row.addProperty("resolution", track.combatDeath == null
                                ? "confirmed_death_unattributed" : "confirmed_death_attributed");
                        row.addProperty("resolved_at", track.deathTime);
                        row.addProperty("resolution_game_time_ms", track.deathStamp.gameTimeMs);
                    } else if (track.leftTime != null) {
                        row.addProperty("resolution", "visibility_lost");
                        row.addProperty("resolved_at", track.leftTime);
                    } else {
                        row.addProperty("resolution", "still_observed_or_unknown");
                    }

                    DeathPoint death = track.combatDeath;
                    if (death != null) {
                        row.addProperty("target_name", death.targetName);
                        row.addProperty("unit_archetype", unitArchetype(death.targetName));
                        row.addProperty("outcome", unitOutcome(track, death));
                        addNullable(row, "killer_slot", death.attackerSlot);
                        addNullable(row, "attacker_team", death.attackerTeam);
                        addNullable(row, "event_last_hits", death.eventLastHits);
                        row.addProperty("combat_death_event_seq", death.stamp.eventSequence);
                        if (death.attackerName != null) row.addProperty("attacker_name", death.attackerName);
                    } else {
                        row.addProperty("outcome", track.deathTime == null ? "unresolved" : "unattributed_death");
                    }
                    addNullable(row, "observed_gold", track.observedGold);
                    UnitGoldEstimate goldEstimate = estimatedUnitGold(track);
                    row.addProperty("estimated_gold", goldEstimate.value);
                    row.addProperty("gold_evidence", track.observedGold == null
                            ? goldEstimate.evidence : "matched_fact");
                    row.addProperty("gold_status", track.observedGold == null ? "estimated_or_unavailable" : "matched_fact");
                    row.addProperty("confidence", track.combatDeath != null ? 98
                            : track.deathTime != null ? 82 : track.leftTime != null ? 35 : 45);
                    rows.add(row);
                });
        return rows;
    }

    private JsonObject buildLaneOpportunitiesBySlot(int duration,
            Map<Integer, LaneAssignment> laneAssignments) {
        JsonObject bySlot = new JsonObject();
        int analysisEnd = Math.min(duration, 1200);
        for (int slot = 0; slot < 10; slot++) {
            LaneAssignment assignment = laneAssignments.get(slot);
            JsonObject result = new JsonObject();
            JsonArray events = new JsonArray();
            int secured = 0;
            int denied = 0;
            int teammateClaimed = 0;
            int missedNearby = 0;
            int missedAbsent = 0;
            int excused = 0;
            int reviewable = 0;
            int estimatedMissedGold = 0;
            boolean resourcePriority = assignment != null && assignment.position <= 3;

            for (UnitTrack track : unitTracks.values()) {
                if (!track.kind.equals("lane_creep") || track.deathTime == null
                        || track.deathTime < 0 || track.deathTime > analysisEnd || track.team == null
                        || track.team == teamForSlot(slot)) continue;
                Position deathPosition = track.lastPosition;
                MapCoordinateService.Point point = canonicalPoint(deathPosition);
                String lane = point == null ? "unknown" : coordinates.nearestLane(point);
                if (assignment == null || !assignment.lane.equals(lane)) continue;

                DeathPoint death = track.combatDeath;
                Snapshot player = snapshotFloorAt(slot, track.deathTime, 2);
                boolean alive = player != null && (player.lifeState == null || player.lifeState == 0);
                Position playerPosition = positionOf(player);
                double distanceWorld = playerPosition == null || deathPosition == null
                        ? Double.POSITIVE_INFINITY : percentDistanceToWorld(distance(playerPosition, deathPosition));
                boolean nearby = distanceWorld <= 1_800;
                boolean combatExcuse = playerInCombatWindow(slot, track.deathTime, 5);
                LaneSafety safety = laneSafetyAt(slot, track.deathTime, deathPosition);
                String outcome;

                if (death != null && Integer.valueOf(slot).equals(death.attackerSlot)) {
                    outcome = "secured";
                    secured++;
                } else if (death != null && death.attackerSlot != null
                        && teamForSlot(death.attackerSlot) == track.team) {
                    outcome = "enemy_deny";
                    denied++;
                } else if (death != null && death.attackerSlot != null
                        && teamForSlot(death.attackerSlot) == teamForSlot(slot)) {
                    outcome = "teammate_claimed";
                    teammateClaimed++;
                } else if (!resourcePriority) {
                    outcome = "role_not_resource_priority";
                } else if (!alive) {
                    outcome = "excused_dead";
                    excused++;
                } else if (combatExcuse) {
                    outcome = "excused_combat";
                    excused++;
                } else if (nearby) {
                    outcome = safety.safe ? "reviewable_missed_last_hit" : "missed_last_hit_safety_unproven";
                    missedNearby++;
                } else {
                    outcome = safety.safe ? "reviewable_missed_wave_absence" : "missed_wave_safety_unproven";
                    missedAbsent++;
                }

                UnitGoldEstimate goldEstimate = estimatedUnitGold(track);
                if (outcome.startsWith("reviewable_")) {
                    reviewable++;
                    estimatedMissedGold += goldEstimate.value;
                }
                JsonObject row = new JsonObject();
                row.addProperty("unit_id", "unit-" + track.handle);
                row.addProperty("time", track.deathTime);
                row.addProperty("lane", lane);
                row.addProperty("outcome", outcome);
                row.addProperty("resource_priority", resourcePriority);
                row.addProperty("nearby", nearby);
                if (Double.isFinite(distanceWorld)) row.addProperty("player_distance_world", Math.round(distanceWorld));
                row.addProperty("safety", safety.safe ? "supported_safe" : safety.unknownEnemies > 0
                        ? "insufficient_visibility" : safety.nearbyThreats > 0 ? "known_threat" : "unproven");
                row.addProperty("nearby_enemy_threats", safety.nearbyThreats);
                row.addProperty("unknown_enemy_states", safety.unknownEnemies);
                row.addProperty("estimated_gold", goldEstimate.value);
                row.addProperty("gold_evidence", goldEstimate.evidence);
                if (deathPosition != null) addPosition(row, deathPosition);
                events.add(row);
            }

            JsonObject summary = new JsonObject();
            summary.addProperty("secured", secured);
            summary.addProperty("enemy_denies", denied);
            summary.addProperty("teammate_claimed", teammateClaimed);
            summary.addProperty("missed_nearby", missedNearby);
            summary.addProperty("missed_while_absent", missedAbsent);
            summary.addProperty("excused", excused);
            summary.addProperty("reviewable_misses", reviewable);
            summary.addProperty("estimated_reviewable_gold", estimatedMissedGold);
            summary.addProperty("recommendation_enabled", reviewable >= 2
                    && assignment != null && assignment.confidence >= 0.65);
            summary.addProperty("recommendation_mode", reviewable >= 2
                    && assignment != null && assignment.confidence >= 0.65
                            ? "retrospective_lane_review" : "facts_only");
            summary.addProperty("analysis_end_seconds", analysisEnd);
            summary.addProperty("scope", "first_20_minutes_lane_execution");
            result.addProperty("position", assignment == null ? slot % 5 + 1 : assignment.position);
            result.addProperty("lane", assignment == null ? "unknown" : assignment.lane);
            result.addProperty("role_confidence", assignment == null ? 0 : round2(assignment.confidence * 100));
            result.addProperty("resource_priority", resourcePriority);
            result.add("summary", summary);
            result.add("events", events);
            bySlot.add(Integer.toString(slot), result);
        }
        return bySlot;
    }

    private UnitGoldEstimate estimatedUnitGold(UnitTrack target) {
        String archetype = unitArchetype(target.combatDeath == null
                ? target.unit : target.combatDeath.targetName);
        List<Integer> values = unitTracks.values().stream()
                .filter(track -> track.kind.equals(target.kind) && track.observedGold != null
                        && track.observedGold > 0 && track.combatDeath != null
                        && unitArchetype(track.combatDeath.targetName).equals(archetype))
                .map(track -> track.observedGold).sorted().toList();
        if (!values.isEmpty()) {
            return new UnitGoldEstimate(values.get(values.size() / 2),
                    "same_match_observed_archetype_median");
        }
        values = unitTracks.values().stream()
                .filter(track -> track.kind.equals(target.kind) && track.observedGold != null
                        && track.observedGold > 0)
                .map(track -> track.observedGold).sorted().toList();
        return values.isEmpty() ? new UnitGoldEstimate(0, "unavailable")
                : new UnitGoldEstimate(values.get(values.size() / 2),
                        "same_match_observed_unit_kind_median");
    }

    private boolean playerInCombatWindow(int slot, int time, int radius) {
        return damages.stream().anyMatch(point -> Math.abs(point.time - time) <= radius
                    && (Integer.valueOf(slot).equals(point.attackerSlot) || Integer.valueOf(slot).equals(point.targetSlot)))
                || controls.stream().anyMatch(point -> Math.abs(point.time - time) <= radius
                    && (Integer.valueOf(slot).equals(point.attackerSlot) || Integer.valueOf(slot).equals(point.targetSlot)))
                || deaths.stream().anyMatch(point -> point.targetHero && Math.abs(point.time - time) <= radius
                    && (Integer.valueOf(slot).equals(point.attackerSlot) || Integer.valueOf(slot).equals(point.targetSlot)));
    }

    private LaneSafety laneSafetyAt(int slot, int time, Position lanePosition) {
        if (lanePosition == null) return new LaneSafety(false, 0, 5);
        int team = teamForSlot(slot);
        int nearbyThreats = 0;
        int unknownEnemies = 0;
        for (int enemy : enemySlots(slot)) {
            VisibilitySample sample = visibilityIndex.getOrDefault(team, Map.of())
                    .getOrDefault(enemy, new TreeMap<>()).get(time);
            if (sample == null || sample.state.equals("unknown")) {
                unknownEnemies++;
                continue;
            }
            if (sample.position == null) continue;
            double threatRadius = worldDistanceToPercent(3_000)
                    + (sample.state.equals("last_seen") ? sample.uncertaintyRadius : 0);
            if (distance(sample.position, lanePosition) <= threatRadius) nearbyThreats++;
        }
        return new LaneSafety(nearbyThreats == 0 && unknownEnemies == 0, nearbyThreats, unknownEnemies);
    }

    private static double percentDistanceToWorld(double percentDistance) {
        return percentDistance / 100.0 * MapCoordinateService.ENTITY_SPAN * 128.0;
    }

    private record LaneSafety(boolean safe, int nearbyThreats, int unknownEnemies) {}

    private static String unitOutcome(UnitTrack track, DeathPoint death) {
        if (track.kind.equals("neutral")) {
            if (death.attackerSlot != null) return "hero_last_hit";
            if (death.attackerName != null && (death.attackerName.contains("creep_goodguys")
                    || death.attackerName.contains("creep_badguys"))) return "lane_creep_pull_kill";
            return "nonhero_kill";
        }
        if (death.attackerSlot != null && track.team != null) {
            return teamForSlot(death.attackerSlot) == track.team ? "deny" : "last_hit";
        }
        if (death.attackerTeam != null && track.team != null && death.attackerTeam.equals(track.team)) {
            return "denied_without_player_attribution";
        }
        return "unclaimed_lane_death";
    }

    private static String unitArchetype(String targetName) {
        if (targetName == null) return "unknown";
        if (targetName.contains("flagbearer")) return "flagbearer";
        if (targetName.contains("siege")) return "siege";
        if (targetName.contains("ranged")) return "ranged";
        if (targetName.contains("melee")) return "melee";
        if (targetName.contains("neutral")) return "neutral";
        return "other";
    }

    private JsonArray buildCampStates(int duration) {
        Map<String, Map<Integer, CampCycleAggregate>> cyclesByCamp = new LinkedHashMap<>();
        for (UnitTrack track : unitTracks.values()) {
            if (!track.kind.equals("neutral")) continue;
            Position reference = track.firstPosition != null ? track.firstPosition : track.lastPosition;
            MapCoordinateService.Point point = canonicalPoint(reference);
            MapCoordinateService.CampAnchor anchor = coordinates.nearestCamp(point);
            if (anchor == null || anchor.distance() > 8.5) continue;
            int observedAt = Math.max(60, track.firstObserved);
            int cycleStart = Math.max(60, observedAt / 60 * 60);
            cyclesByCamp.computeIfAbsent(anchor.id(), ignored -> new TreeMap<>())
                    .computeIfAbsent(cycleStart, ignored -> new CampCycleAggregate(cycleStart))
                    .add(track);
        }

        JsonArray camps = new JsonArray();
        for (MapCoordinateService.CampAnchor anchor : coordinates.observedCampAnchors()) {
            JsonObject camp = new JsonObject();
            camp.addProperty("id", anchor.id());
            camp.addProperty("handle", anchor.handle());
            camp.addProperty("first_observed", anchor.firstObserved());
            addPosition(camp, position(anchor.point()));
            Map<Integer, CampCycleAggregate> observations = cyclesByCamp.getOrDefault(anchor.id(), Map.of());
            List<CampCycleAggregate> orderedCycles = observations.values().stream()
                    .sorted(Comparator.comparingInt(cycle -> cycle.cycleStart)).toList();
            for (CampCycleAggregate cycle : orderedCycles) {
                cycle.overlapFromPrevious = orderedCycles.stream()
                        .filter(previous -> previous.cycleStart < cycle.cycleStart)
                        .flatMap(previous -> previous.tracks.stream())
                        .filter(track -> track.firstObserved < cycle.cycleStart
                                && (track.deathTime == null || track.deathTime >= cycle.cycleStart)
                                && (track.leftTime == null || track.leftTime >= cycle.cycleStart)
                                && track.lastObserved >= cycle.cycleStart - 3)
                        .count();
                cycle.stackSlots.addAll(stackAttributionNear(anchor, cycle.cycleStart));
            }
            JsonArray cycleRows = new JsonArray();
            orderedCycles.stream().filter(cycle -> cycle.cycleStart <= duration)
                    .forEach(cycle -> cycleRows.add(cycle.toJson()));
            camp.add("observations", cycleRows);
            camp.add("unobserved_cycle_ranges", compressedMissingCycles(observations.keySet(), duration));
            camp.addProperty("state", observations.isEmpty() ? "unknown" : "partially_observed");
            camp.addProperty("evidence", "replay_neutral_spawner_plus_unit_lifecycle");
            camps.add(camp);
        }
        return camps;
    }

    private Set<Integer> stackAttributionNear(MapCoordinateService.CampAnchor camp, int cycleStart) {
        Set<Integer> slots = new LinkedHashSet<>();
        Position campPosition = position(camp.point());
        for (int slot = 0; slot < 10; slot++) {
            Snapshot before = snapshotFloorAt(slot, cycleStart - 2, 4);
            Snapshot after = snapshotNear(slot, cycleStart + 2, 4);
            if (before == null || after == null || before.campsStacked == null || after.campsStacked == null
                    || after.campsStacked <= before.campsStacked) continue;
            Position actor = positionOf(after);
            if (actor != null && distance(actor, campPosition) <= 12.0) slots.add(slot);
        }
        return slots;
    }

    private JsonArray compressedMissingCycles(Set<Integer> observedCycles, int duration) {
        JsonArray rows = new JsonArray();
        Integer rangeStart = null;
        int previous = -1;
        for (int cycle = 60; cycle <= duration; cycle += 60) {
            if (observedCycles.contains(cycle)) {
                if (rangeStart != null) {
                    rows.add(resourceGap(rangeStart, previous));
                    rangeStart = null;
                }
            } else {
                if (rangeStart == null) rangeStart = cycle;
                previous = cycle;
            }
        }
        if (rangeStart != null) rows.add(resourceGap(rangeStart, previous));
        return rows;
    }

    private static JsonObject resourceGap(int start, int end) {
        JsonObject row = new JsonObject();
        row.addProperty("start", start);
        row.addProperty("end", end);
        row.addProperty("state", "unknown");
        row.addProperty("reason", "no_replay_observation");
        return row;
    }

    private MapCoordinateService.Point canonicalPoint(Position position) {
        return position == null ? null : coordinates.canonical(position.x, position.y,
                position.source, position.sourceX, position.sourceY);
    }

    private JsonArray buildStackEvents(int slot) {
        JsonArray rows = new JsonArray();
        NavigableMap<Integer, Snapshot> playerSnapshots = snapshots.get(slot);
        if (playerSnapshots == null || playerSnapshots.isEmpty()) return rows;
        Integer previousCamps = null;
        Integer previousCreeps = null;
        int index = 0;
        for (Snapshot snapshot : playerSnapshots.values()) {
            if (snapshot.campsStacked == null) continue;
            if (previousCamps != null && snapshot.campsStacked > previousCamps) {
                int campDelta = snapshot.campsStacked - previousCamps;
                int creepDelta = previousCreeps == null || snapshot.creepsStacked == null
                        ? 0 : Math.max(0, snapshot.creepsStacked - previousCreeps);
                JsonObject row = new JsonObject();
                row.addProperty("id", "stack-" + slot + "-" + (++index));
                row.addProperty("time", snapshot.time);
                row.addProperty("camps", campDelta);
                row.addProperty("creeps", creepDelta);
                row.addProperty("double_stack", campDelta >= 2);
                row.addProperty("evidence", "fact");
                Position position = positionOf(snapshot);
                if (position != null) {
                    addPosition(row, position);
                    row.addProperty("region", regionCode(position));
                }
                StackValue stackValue = stackValueAt(position, snapshot.time, creepDelta);
                if (stackValue != null) {
                    row.addProperty("camp_id", stackValue.campId);
                    row.addProperty("spawn_cycle", stackValue.spawnCycle);
                    row.addProperty("confirmed_created_creeps", creepDelta);
                    row.addProperty("camp_clear_observed_gold", stackValue.campClearObservedGold);
                    row.addProperty("created_gold_estimate", stackValue.createdGoldEstimate);
                    row.addProperty("value_evidence", stackValue.valueEvidence);
                    row.add("cleared_by_slots", integerMap(stackValue.clearedBySlots));
                } else {
                    row.addProperty("value_evidence", "camp_or_creep_count_unavailable");
                }
                rows.add(row);
            }
            previousCamps = snapshot.campsStacked;
            if (snapshot.creepsStacked != null) previousCreeps = snapshot.creepsStacked;
        }
        return rows;
    }

    private StackValue stackValueAt(Position position, int stackTime, int creepDelta) {
        MapCoordinateService.CampAnchor anchor = coordinates.nearestCamp(canonicalPoint(position));
        if (anchor == null || anchor.distance() > 12.0) return null;
        int spawnCycle = Math.max(60, Math.floorDiv(stackTime + 59, 60) * 60);
        List<UnitTrack> cohort = unitTracks.values().stream()
                .filter(track -> track.kind.equals("neutral")
                        && track.firstObserved >= spawnCycle - 5 && track.firstObserved <= spawnCycle + 24)
                .filter(track -> {
                    MapCoordinateService.CampAnchor unitCamp = coordinates.nearestCamp(
                            canonicalPoint(track.firstPosition != null ? track.firstPosition : track.lastPosition));
                    return unitCamp != null && unitCamp.distance() <= 8.5 && unitCamp.id().equals(anchor.id());
                })
                .toList();
        int clearGold = cohort.stream().filter(track -> track.observedGold != null)
                .mapToInt(track -> track.observedGold).sum();
        Map<Integer, Integer> clearedBy = new LinkedHashMap<>();
        cohort.stream().filter(track -> track.combatDeath != null && track.combatDeath.attackerSlot != null)
                .forEach(track -> clearedBy.merge(track.combatDeath.attackerSlot, 1, Integer::sum));
        List<Integer> observedValues = cohort.stream().filter(track -> track.observedGold != null && track.observedGold > 0)
                .map(track -> track.observedGold).sorted().toList();
        boolean sameCampValues = !observedValues.isEmpty();
        if (observedValues.isEmpty()) {
            observedValues = unitTracks.values().stream()
                    .filter(track -> track.kind.equals("neutral") && track.observedGold != null
                            && track.observedGold > 0)
                    .map(track -> track.observedGold).sorted().toList();
        }
        int createdGoldEstimate = creepDelta <= 0 || observedValues.isEmpty() ? 0
                : observedValues.get(observedValues.size() / 2) * creepDelta;
        String evidence = creepDelta <= 0 ? "stack_counter_without_creep_delta"
                : observedValues.isEmpty() ? "confirmed_stack_value_unavailable"
                        : sameCampValues ? "confirmed_creep_delta_times_same_camp_observed_median"
                                : "confirmed_creep_delta_times_same_match_neutral_median";
        return new StackValue(anchor.id(), spawnCycle, clearGold, createdGoldEstimate, evidence, clearedBy);
    }

    private static JsonObject stackValueSummary(JsonArray events) {
        JsonObject result = new JsonObject();
        int camps = 0;
        int creeps = 0;
        int observedClearGold = 0;
        int createdGoldEstimate = 0;
        int valuedEvents = 0;
        for (JsonElement element : events) {
            if (!element.isJsonObject()) continue;
            JsonObject row = element.getAsJsonObject();
            camps += intValue(row, "camps", 0);
            creeps += intValue(row, "creeps", 0);
            observedClearGold += intValue(row, "camp_clear_observed_gold", 0);
            createdGoldEstimate += intValue(row, "created_gold_estimate", 0);
            if (intValue(row, "created_gold_estimate", 0) > 0) valuedEvents++;
        }
        result.addProperty("stacked_camps", camps);
        result.addProperty("stacked_creeps", creeps);
        result.addProperty("observed_clear_gold", observedClearGold);
        result.addProperty("created_gold_estimate", createdGoldEstimate);
        result.addProperty("valued_events", valuedEvents);
        result.addProperty("value_mode", "team_value_created_not_personal_income");
        result.addProperty("evidence", valuedEvents > 0 ? "mixed_fact_and_same_match_estimate" : "fact_counts_only");
        return result;
    }

    private JsonArray buildLaneJungleCycles(int slot, int duration) {
        JsonArray rows = new JsonArray();
        observedFarmCycles(slot, duration).forEach(cycle -> rows.add(cycle.toJson(slot)));
        return rows;
    }

    private List<ObservedFarmCycle> observedFarmCycles(int slot, int duration) {
        int safeEnd = duration;
        List<GoldPoint> lanePoints = goldPoints.stream()
                .filter(point -> point.slot != null && point.slot == slot && point.value > 0
                        && point.time >= 0 && point.time <= safeEnd
                        && point.classification.source().equals("lane_creep"))
                .sorted(Comparator.comparingInt(point -> point.time)).toList();
        List<GoldPoint> neutralPoints = goldPoints.stream()
                .filter(point -> point.slot != null && point.slot == slot && point.value > 0
                        && point.time >= 0 && point.time <= safeEnd
                        && (point.classification.source().equals("neutral")
                                || point.classification.source().equals("ancient")))
                .sorted(Comparator.comparingInt(point -> point.time)).toList();
        List<ObservedFarmCycle> result = new ArrayList<>();
        int lastReturn = -1;
        for (GoldPoint neutral : neutralPoints) {
            GoldPoint before = lanePoints.stream()
                    .filter(point -> point.time >= neutral.time - 25 && point.time < neutral.time)
                    .max(Comparator.comparingInt(point -> point.time)).orElse(null);
            GoldPoint after = lanePoints.stream()
                    .filter(point -> point.time > neutral.time && point.time <= neutral.time + 42)
                    .min(Comparator.comparingInt(point -> point.time)).orElse(null);
            if (before == null || after == null || before.time <= lastReturn) continue;
            String beforeLane = laneForPosition(goldPosition(before));
            String afterLane = laneForPosition(goldPosition(after));
            Position neutralPosition = goldPosition(neutral);
            if (beforeLane.equals("other") || !beforeLane.equals(afterLane)
                    || !zoneType(neutralPosition).equals("jungle")) continue;
            int laneGold = goldInWindow(slot, before.time, after.time, "lane");
            int neutralGold = goldInWindow(slot, before.time, after.time, "neutral");
            int neutralKills = countUnitKills(slot, before.time, after.time, "neutral")
                    + countUnitKills(slot, before.time, after.time, "ancient");
            if (laneGold <= 0 || neutralGold <= 0 || neutralKills <= 0) continue;
            result.add(new ObservedFarmCycle(before.time, neutral.time, after.time, beforeLane,
                    laneGold, neutralGold, countUnitKills(slot, before.time, after.time, "lane"), neutralKills));
            lastReturn = after.time;
        }
        return result;
    }

    private JsonArray buildGoldEvents(int slot) {
        JsonArray result = new JsonArray();
        goldPoints.stream()
                .filter(point -> point.slot != null && point.slot == slot && point.value != 0)
                .sorted(Comparator.comparingInt(point -> point.time))
                .forEach(point -> {
                    JsonObject row = point.toJson();
                    Position position = goldPosition(point);
                    if (position != null) addPosition(row, position);
                    result.add(row);
                });
        return result;
    }

    private JsonArray buildHeatCells(int slot, int duration) {
        Map<String, HeatCell> cells = new LinkedHashMap<>();
        goldPoints.stream()
                .filter(point -> point.slot != null && point.slot == slot && point.value > 0
                        && point.classification.spatial())
                .forEach(point -> {
                    Position position = goldPosition(point);
                    if (position == null) return;
                    String source = point.classification.source();
                    int window = Math.max(0, point.time / 300);
                    int bucketX = Math.max(0, Math.min(9, (int) (position.x / 10)));
                    int bucketY = Math.max(0, Math.min(9, (int) (position.y / 10)));
                    String key = window + ":" + source + ":" + bucketX + ":" + bucketY;
                    cells.computeIfAbsent(key, ignored -> new HeatCell(slot, window, source,
                            point.classification.category(), bucketX, bucketY))
                            .add(point, position);
                });
        JsonArray result = new JsonArray();
        cells.values().stream()
                .sorted(Comparator.comparingInt((HeatCell cell) -> cell.start).thenComparingInt(cell -> -cell.gold))
                .forEach(cell -> result.add(cell.toJson(duration, coordinates)));
        return result;
    }

    private static String farmBenchmarkGroup(int time) {
        if (time < 1200) return "pre20";
        int bucketStart = time / 300 * 300;
        return "post20:" + bucketStart + "-" + (bucketStart + 300);
    }

    private static String farmRoutePhase(int time) {
        if (time < 450) return "laning";
        if (time < 900) return "expansion";
        if (time < 1200) return "pre_tormentor";
        if (time < 1800) return "core_route_20_30";
        if (time < 2400) return "core_route_30_40";
        return "core_route_40_plus";
    }

    private static FarmBenchmarks farmBenchmarks(List<FarmWindow> windows) {
        List<Integer> sortedIncome = windows.stream().map(FarmWindow::totalGold).sorted().toList();
        int medianGold = sortedIncome.isEmpty() ? 0 : sortedIncome.get(sortedIncome.size() / 2);
        int threshold = Math.max(35, (int) Math.round(medianGold * 0.62));
        int laneGold = Math.max(45,
                medianPositive(windows.stream().map(window -> window.laneGold).toList()));
        int neutralGold = Math.max(35,
                medianPositive(windows.stream().map(window -> window.neutralGold).toList()));
        return new FarmBenchmarks(medianGold, threshold, laneGold, neutralGold);
    }

    private JsonArray buildDiagnostics(int slot, int duration, List<JsonObject> wardRows,
            Map<Integer, LaneAssignment> laneAssignments) {
        List<FarmWindow> windows = new ArrayList<>();
        LaneAssignment assignment = laneAssignments.get(slot);
        boolean coreRoutePriority = assignment != null && assignment.position <= 3;
        int analysisEnd = coreRoutePriority ? duration : Math.min(duration, 1200);
        for (int start = 0; start < analysisEnd; start += 30) {
            int end = Math.min(analysisEnd, start + 29);
            Snapshot middle = snapshotAt(slot, (start + end) / 2);
            if (middle == null) continue;
            int lane = goldInWindow(slot, start, end, "lane");
            int neutral = goldInWindow(slot, start, end, "neutral");
            int combat = goldInWindow(slot, start, end, "combat");
            int other = goldInWindow(slot, start, end, "objective")
                    + goldInWindow(slot, start, end, "map_resource");
            int stackDelta = stackDelta(slot, start, end);
            windows.add(new FarmWindow(start, end, lane, neutral, combat, other, positionOf(middle),
                    countUnitKills(slot, start, end, "lane"),
                    countUnitKills(slot, start, end, "neutral") + countUnitKills(slot, start, end, "ancient"),
                    stackDelta, middle.lifeState == null || middle.lifeState == 0));
        }
        if (windows.isEmpty()) return new JsonArray();

        Map<String, List<FarmWindow>> windowsByBenchmark = new LinkedHashMap<>();
        windows.forEach(window -> windowsByBenchmark
                .computeIfAbsent(farmBenchmarkGroup(window.start), ignored -> new ArrayList<>()).add(window));
        Map<String, FarmBenchmarks> benchmarkByGroup = new LinkedHashMap<>();
        windowsByBenchmark.forEach((group, rows) -> benchmarkByGroup.put(group, farmBenchmarks(rows)));

        Set<Integer> anomalyStarts = new HashSet<>();
        List<FarmWindow> reviewWindows = new ArrayList<>();
        windowsByBenchmark.forEach((group, rows) -> {
            FarmBenchmarks benchmark = benchmarkByGroup.get(group);
            boolean post20Group = group.startsWith("post20:");
            int anomalyLimit = post20Group ? 4 : 10;
            int relativeLowLimit = post20Group ? 2 : 5;
            List<FarmWindow> anomalyWindows = rows.stream()
                    .filter(window -> window.start >= 60 && window.alive
                            && window.totalGold() <= benchmark.threshold)
                    .sorted(Comparator.comparingInt((FarmWindow window) -> window.totalGold())
                            .thenComparingInt(window -> window.start))
                    .limit(anomalyLimit)
                    .toList();
            anomalyWindows.forEach(window -> anomalyStarts.add(window.start));
            reviewWindows.addAll(anomalyWindows);

            List<FarmWindow> relativeLowWindows = rows.stream()
                    .filter(window -> window.start >= 60 && window.alive
                            && !anomalyStarts.contains(window.start))
                    .sorted(Comparator.comparingInt(FarmWindow::totalGold)
                            .thenComparingInt(window -> window.start))
                    .limit(relativeLowLimit)
                    .toList();
            reviewWindows.addAll(relativeLowWindows);
        });
        reviewWindows.sort(Comparator.comparingInt(window -> window.start));

        JsonArray result = new JsonArray();
        int diagnosticIndex = 0;
        List<ObservedFarmCycle> observedCycles = observedFarmCycles(slot, duration);
        for (FarmWindow window : reviewWindows) {
            FarmBenchmarks benchmark = benchmarkByGroup.get(farmBenchmarkGroup(window.start));
            boolean post20CoreWindow = coreRoutePriority && window.start >= 1200;
            int lookaheadSeconds = post20CoreWindow ? 75 : 45;
            Position currentPosition = window.position;
            Set<Integer> visible = visibleEnemies(slot, window.start);
            JsonArray visibleJson = new JsonArray();
            JsonArray missingJson = new JsonArray();
            for (int enemy : enemySlots(slot)) {
                (visible.contains(enemy) ? visibleJson : missingJson).add(enemy);
            }
            List<String> activeWardIds = activeWardIdsNear(slot, window.start, currentPosition, wardRows);
            int baseRisk = Math.max(8, Math.min(94, 20 + missingJson.size() * 12 - visibleJson.size() * 2
                    - Math.min(12, activeWardIds.size() * 3)));
            int laneExpected = Math.max(window.laneGold, benchmark.laneGold);
            int jungleExpected = Math.max(window.neutralGold, benchmark.neutralGold);
            int laneRisk = Math.min(96, baseRisk + (window.start >= 900 ? 8 : 0));
            int jungleRisk = Math.max(8, baseRisk - 12);
            int waveDeadline = Math.max(12, 42 - window.start % 30);
            int campDeadline = Math.max(8, 60 - window.start % 60);
            String currentLane = currentPosition == null ? "other" : laneForPosition(currentPosition);
            boolean laneWaveObserved = assignment != null
                    && laneWaveObserved(slot, assignment.lane, window.start, window.end);
            boolean campOccupancyObserved = currentPosition != null
                    && campOccupancyObserved(currentPosition, window.start, window.end);
            boolean laneEvidence = assignment != null && assignment.lane.equals(currentLane)
                    && (goldInWindow(slot, Math.max(0, window.start - 30), Math.min(analysisEnd, window.end + 30), "lane") > 0
                            || countUnitKills(slot, Math.max(0, window.start - 30), window.end + 30, "lane") > 0
                            || laneWaveObserved);
            boolean jungleEvidence = currentPosition != null && zoneType(currentPosition).equals("jungle")
                    && (goldInWindow(slot, Math.max(0, window.start - lookaheadSeconds),
                            Math.min(analysisEnd, window.end + lookaheadSeconds), "neutral") > 0
                            || countUnitKills(slot, Math.max(0, window.start - lookaheadSeconds),
                                    window.end + lookaheadSeconds, "neutral") > 0
                            || countUnitKills(slot, Math.max(0, window.start - lookaheadSeconds),
                                    window.end + lookaheadSeconds, "ancient") > 0
                            || campOccupancyObserved);
            ObservedFarmCycle observedCycle = observedCycles.stream()
                    .filter(cycle -> cycle.start <= window.end && cycle.end >= window.start)
                    .findFirst().orElse(null);

            List<FarmCandidate> choices = new ArrayList<>();
            RouteEvidence laneRoute = bestLaneRouteEvidence(slot, window.start, window.end,
                    currentPosition, assignment, laneAssignments, lookaheadSeconds);
            RouteEvidence campRoute = bestCampRouteEvidence(slot, window.start, window.end,
                    currentPosition, assignment, laneAssignments, lookaheadSeconds);
            if (laneRoute.candidate != null) choices.add(laneRoute.candidate);
            else if (laneEvidence) {
                Position target = assignment == null ? nearestLaneAnchor(currentPosition) : laneAnchor(assignment.lane);
                choices.add(new FarmCandidate("collect_lane", laneExpected, laneRisk, 0, waveDeadline,
                        farmScore(laneExpected, laneRisk, 0), "assigned_lane_plus_resource_event", target));
            }
            if (campRoute.candidate != null) choices.add(campRoute.candidate);
            else if (jungleEvidence) {
                choices.add(new FarmCandidate("hold_jungle", jungleExpected, jungleRisk, 0, campDeadline,
                        farmScore(jungleExpected, jungleRisk, 0), "current_jungle_plus_resource_event", currentPosition));
            }
            if (observedCycle != null) {
                int cycleGold = observedCycle.laneGold + observedCycle.neutralGold;
                choices.add(new FarmCandidate("lane_jungle_cycle", cycleGold, Math.min(96, baseRisk + 5),
                        observedCycle.end - observedCycle.start, waveDeadline,
                        farmScore(cycleGold, Math.min(96, baseRisk + 5), observedCycle.end - observedCycle.start),
                        "observed_lane_jungle_lane_sequence", null));
            }
            FarmCandidate highestRawScore = choices.stream()
                    .max(Comparator.comparingDouble(choice -> choice.score)).orElse(null);
            RouteEvidence executableRoute = null;
            for (RouteEvidence route : List.of(laneRoute, campRoute)) {
                if (route.candidate != null && route.complete && betterRoute(route, executableRoute)) {
                    executableRoute = route;
                }
            }
            FarmCandidate best = executableRoute == null ? highestRawScore : executableRoute.candidate;
            RouteEvidence bestRoute = executableRoute != null ? executableRoute
                    : best == null ? null
                            : laneRoute.candidate == best ? laneRoute
                                    : campRoute.candidate == best ? campRoute : null;

            String actualKind = observedFarmAction(slot, window, observedCycle);
            int delta = best == null ? 0 : Math.max(0, best.expectedGold - window.totalGold());
            boolean matchedBestOption = best != null && best.kind.equals(actualKind);
            String diagnosticClass = anomalyStarts.contains(window.start) ? "anomaly" : "relative_low";
            boolean strategicCommitment = post20CoreWindow
                    && (actualKind.equals("combat") || actualKind.equals("objective_or_resource"));
            boolean reviewRequired = diagnosticClass.equals("anomaly") && best != null
                    && !matchedBestOption && !strategicCommitment;
            boolean routeEvidenceComplete = bestRoute != null && bestRoute.complete;
            String evidenceStatus = best == null ? "missing" : routeEvidenceComplete ? "complete" : "partial";
            boolean recommendationEnabled = reviewRequired && evidenceStatus.equals("complete");
            String decision = strategicCommitment ? "context_exempt"
                    : diagnosticClass.equals("relative_low") ? "relative_low"
                    : best == null ? "evidence_gap" : matchedBestOption ? "correct" : "review";
            int confidence = best == null ? 38 : Math.min(routeEvidenceComplete ? 92 : 72, 46 + visibleJson.size() * 3
                    + Math.min(8, activeWardIds.size() * 2) + (window.laneKills + window.neutralKills > 0 ? 8 : 0));
            if (routeEvidenceComplete) confidence = Math.max(72, confidence);
            String recommendation = strategicCommitment ? actualKind
                    : best == null ? "insufficient_evidence" : best.kind;
            String title = strategicCommitment ? "strategic_commitment"
                    : best == null ? "evidence_gap"
                    : observedCycle != null ? "observed_lane_jungle_cycle"
                            : matchedBestOption && best.kind.equals("collect_lane") ? "verified_lane_farm"
                                    : matchedBestOption ? "verified_jungle_farm"
                                            : best.kind.equals("collect_lane") ? "lane_review_clue" : "jungle_review_clue";

            JsonObject row = new JsonObject();
            row.addProperty("id", "diagnostic-" + slot + "-" + diagnosticIndex++);
            row.addProperty("time", window.start);
            row.addProperty("end", window.end);
            row.addProperty("phase", farmRoutePhase(window.start));
            row.addProperty("post20_core_priority", post20CoreWindow);
            row.addProperty("resource_position", assignment == null ? 0 : assignment.position);
            row.addProperty("benchmark_group", farmBenchmarkGroup(window.start));
            row.addProperty("benchmark_median_gold", benchmark.medianGold);
            row.addProperty("title", title);
            row.addProperty("decision", decision);
            row.addProperty("diagnostic_class", diagnosticClass);
            row.addProperty("anomaly_threshold", benchmark.threshold);
            row.addProperty("observed_action", actualKind);
            row.addProperty("best_supported_option", best == null ? "insufficient_evidence" : best.kind);
            row.addProperty("matched_best_option", matchedBestOption);
            row.addProperty("review_required", reviewRequired);
            row.addProperty("recommendation_enabled", recommendationEnabled);
            row.addProperty("evidence_status", evidenceStatus);
            row.addProperty("route_model", "retrospective-resource-route/1.2");
            row.addProperty("route_scope", "observed_next_" + lookaheadSeconds + "_seconds");
            row.addProperty("route_lookahead_seconds", lookaheadSeconds);
            row.addProperty("travel_model", "straight_line_lower_bound");
            row.addProperty("selection_policy", "phase_baseline_then_hard_gates_then_highest_score");
            row.addProperty("strategic_commitment_exempt", strategicCommitment);
            row.addProperty("actionable", matchedBestOption);
            row.addProperty("actionable_deprecated", true);
            row.addProperty("actual", actualKind);
            row.addProperty("recommendation", recommendation);
            row.addProperty("actualGold", window.totalGold());
            row.addProperty("suggestedGold", best == null || matchedBestOption || strategicCommitment
                    ? window.totalGold() : Math.max(window.totalGold(), best.expectedGold));
            row.addProperty("laneGold", window.laneGold);
            row.addProperty("neutralGold", window.neutralGold);
            row.addProperty("combatGold", window.combatGold);
            row.addProperty("otherGold", window.otherGold);
            row.addProperty("risk", best == null ? baseRisk : best.risk);
            row.addProperty("confidence", confidence);
            row.addProperty("travelSeconds", best == null ? 0 : best.travelSeconds);
            row.addProperty("laneCreeps", window.laneKills);
            row.addProperty("neutralCreeps", window.neutralKills);
            row.addProperty("stackDelta", window.stackDelta);
            row.addProperty("expiresIn", best == null ? 0 : best.deadlineSeconds);
            row.add("visible", visibleJson);
            row.add("missing", missingJson);
            row.add("enemyVisibility", enemyVisibilityEvidence(slot, window.start));
            row.addProperty("laneWaveObserved", laneWaveObserved);
            row.addProperty("campOccupancyObserved", campOccupancyObserved);
            if (bestRoute != null) {
                row.addProperty("route_resource", bestRoute.resourceId);
                row.addProperty("route_observed_units", bestRoute.observedUnits);
                row.addProperty("route_blocker", strategicCommitment ? "strategic_commitment" : bestRoute.blocker);
                row.addProperty("route_safety", bestRoute.safety.safe ? "supported_safe"
                        : bestRoute.safety.unknownEnemies > 0 ? "insufficient_visibility" : "known_threat");
                row.addProperty("route_unknown_enemies", bestRoute.safety.unknownEnemies);
                row.addProperty("route_nearby_threats", bestRoute.safety.nearbyThreats);
            } else if (strategicCommitment) {
                row.addProperty("route_blocker", "strategic_commitment");
            }
            JsonArray wardIds = new JsonArray();
            activeWardIds.forEach(wardIds::add);
            row.add("wardIds", wardIds);
            JsonArray choiceRows = new JsonArray();
            choices.stream().sorted(Comparator.comparingDouble((FarmCandidate choice) -> choice.score).reversed())
                    .forEach(choice -> {
                        JsonObject choiceRow = choice.toJson();
                        RouteEvidence route = laneRoute.candidate == choice ? laneRoute
                                : campRoute.candidate == choice ? campRoute : null;
                        if (route != null) {
                            choiceRow.addProperty("hard_gates_passed", route.complete);
                            choiceRow.addProperty("blocker", route.blocker);
                            choiceRow.addProperty("resource", route.resourceId);
                        }
                        choiceRows.add(choiceRow);
                    });
            row.add("candidates", choiceRows);
            JsonArray missingEvidence = new JsonArray();
            if (laneRoute.candidate == null) missingEvidence.add("lane_unit_lifecycle_window");
            if (campRoute.candidate == null) missingEvidence.add("camp_unit_lifecycle_window");
            if (bestRoute != null && bestRoute.blocker.equals("team_resource_claim")) {
                missingEvidence.add("team_resource_priority_conflict");
            }
            if (observedCycle == null) missingEvidence.add("hero_clear_time");
            row.add("missingEvidence", missingEvidence);
            if (observedCycle == null && !routeEvidenceComplete && !strategicCommitment) {
                JsonArray blocked = new JsonArray();
                JsonObject cycleBlock = new JsonObject();
                cycleBlock.addProperty("kind", "lane_jungle_cycle");
                cycleBlock.addProperty("reason", bestRoute == null
                        ? "缺少逐单位兵线或营地生命周期，不能证明路线可执行"
                        : routeBlockerDescription(bestRoute.blocker));
                blocked.add(cycleBlock);
                row.add("blockedCandidates", blocked);
            }
            row.addProperty("reason", strategicCommitment
                    ? "strategic_commitment_exempt" : "route_evidence_gate");
            row.addProperty("evidence", "facts_plus_conservative_gate");
            if (recommendationEnabled && best != null && best.target != null && confidence >= 68) {
                row.addProperty("targetX", best.target.x);
                row.addProperty("targetY", best.target.y);
            }
            result.add(row);
        }
        return result;
    }

    private RouteEvidence bestLaneRouteEvidence(int slot, int start, int end, Position currentPosition,
            LaneAssignment assignment, Map<Integer, LaneAssignment> assignments, int lookaheadSeconds) {
        int enemyCreepTeam = slot < 5 ? DIRE : RADIANT;
        Map<String, List<UnitTrack>> byLane = new LinkedHashMap<>();
        for (UnitTrack track : unitTracks.values()) {
            if (!track.kind.equals("lane_creep") || track.team == null || track.team != enemyCreepTeam
                    || track.deathTime == null || track.deathTime < start
                    || track.deathTime > end + lookaheadSeconds) continue;
            DeathPoint death = track.combatDeath;
            if (death != null && death.attackerSlot != null && death.attackerSlot != slot
                    && teamForSlot(death.attackerSlot) == teamForSlot(slot)) continue;
            Position position = track.lastPosition != null ? track.lastPosition : track.firstPosition;
            MapCoordinateService.Point point = canonicalPoint(position);
            if (point == null) continue;
            String lane = coordinates.nearestLane(point);
            if (start < 600 && assignment != null && !assignment.lane.equals(lane)) continue;
            byLane.computeIfAbsent(lane, ignored -> new ArrayList<>()).add(track);
        }
        RouteEvidence best = null;
        for (Map.Entry<String, List<UnitTrack>> entry : byLane.entrySet()) {
            List<UnitTrack> tracks = entry.getValue();
            Position target = averageTrackPosition(tracks);
            int expectedGold = tracks.stream().mapToInt(track -> estimatedUnitGold(track).value).sum();
            int travelSeconds = routeTravelSeconds(slot, start, currentPosition, target);
            List<Integer> deadlines = tracks.stream().map(track -> Math.max(1, track.deathTime - start)).sorted().toList();
            int deadline = deadlines.isEmpty() ? 0 : deadlines.get(deadlines.size() / 2);
            LaneSafety safety = laneSafetyAt(slot, start, target);
            boolean teammateClaim = teammateHasResourcePriority(slot, start, target, assignments);
            String blocker = routeBlocker(assignment, tracks.size(), expectedGold, safety,
                    teammateClaim, travelSeconds, deadline);
            int risk = Math.min(98, 16 + safety.nearbyThreats * 28 + safety.unknownEnemies * 15
                    + (teammateClaim ? 18 : 0));
            FarmCandidate candidate = new FarmCandidate("collect_lane", expectedGold, risk,
                    travelSeconds, deadline, farmScore(expectedGold, risk, travelSeconds),
                    "unit_lifecycle_plus_continuous_visibility", target);
            RouteEvidence route = new RouteEvidence(candidate, blocker.equals("none"), blocker,
                    tracks.size(), safety, "lane:" + entry.getKey());
            if (betterRoute(route, best)) best = route;
        }
        return best == null ? RouteEvidence.missing("lane_units_unavailable") : best;
    }

    private RouteEvidence bestCampRouteEvidence(int slot, int start, int end, Position currentPosition,
            LaneAssignment assignment, Map<Integer, LaneAssignment> assignments, int lookaheadSeconds) {
        Map<String, List<UnitTrack>> byCamp = new LinkedHashMap<>();
        for (UnitTrack track : unitTracks.values()) {
            if (!track.kind.equals("neutral") || track.firstObserved > end + 15 || track.lastObserved < start
                    || track.deathTime != null && track.deathTime < start
                    || track.deathTime == null && track.leftTime != null && track.leftTime < start) continue;
            Position position = track.firstPosition != null ? track.firstPosition : track.lastPosition;
            MapCoordinateService.CampAnchor camp = coordinates.nearestCamp(canonicalPoint(position));
            if (camp == null || camp.distance() > 8.5) continue;
            byCamp.computeIfAbsent(camp.id(), ignored -> new ArrayList<>()).add(track);
        }
        RouteEvidence best = null;
        for (Map.Entry<String, List<UnitTrack>> entry : byCamp.entrySet()) {
            List<UnitTrack> tracks = entry.getValue();
            Position target = averageTrackPosition(tracks);
            int expectedGold = tracks.stream().mapToInt(track -> estimatedUnitGold(track).value).sum();
            int travelSeconds = routeTravelSeconds(slot, start, currentPosition, target);
            List<Integer> clearDeadlines = tracks.stream().filter(track -> track.deathTime != null)
                    .map(track -> Math.max(1, track.deathTime - start)).sorted().toList();
            int deadline = clearDeadlines.isEmpty() ? lookaheadSeconds
                    : clearDeadlines.get(clearDeadlines.size() / 2);
            LaneSafety safety = laneSafetyAt(slot, start, target);
            boolean teammateClaim = teammateHasResourcePriority(slot, start, target, assignments);
            String blocker = routeBlocker(assignment, tracks.size(), expectedGold, safety,
                    teammateClaim, travelSeconds, deadline);
            if (blocker.equals("none") && start < 600 && !observedNeutralClearBefore(slot, start)) {
                blocker = "pre10_jungle_clear_unproven";
            }
            int risk = Math.min(98, 12 + safety.nearbyThreats * 28 + safety.unknownEnemies * 15
                    + (teammateClaim ? 18 : 0));
            FarmCandidate candidate = new FarmCandidate("hold_jungle", expectedGold, risk,
                    travelSeconds, deadline, farmScore(expectedGold, risk, travelSeconds),
                    "camp_lifecycle_plus_continuous_visibility", target);
            RouteEvidence route = new RouteEvidence(candidate, blocker.equals("none"), blocker,
                    tracks.size(), safety, "camp:" + entry.getKey());
            if (betterRoute(route, best)) best = route;
        }
        return best == null ? RouteEvidence.missing("camp_units_unavailable") : best;
    }

    private static boolean betterRoute(RouteEvidence candidate, RouteEvidence current) {
        if (current == null) return true;
        if (candidate.complete != current.complete) return candidate.complete;
        return candidate.candidate.score > current.candidate.score;
    }

    private Position averageTrackPosition(List<UnitTrack> tracks) {
        float x = 0;
        float y = 0;
        int count = 0;
        for (UnitTrack track : tracks) {
            Position position = track.lastPosition != null ? track.lastPosition : track.firstPosition;
            if (position == null) continue;
            x += position.x;
            y += position.y;
            count++;
        }
        return count == 0 ? null : new Position(x / count, y / count);
    }

    private int routeTravelSeconds(int slot, int time, Position current, Position target) {
        if (current == null || target == null) return Integer.MAX_VALUE;
        Snapshot snapshot = snapshotFloorAt(slot, time, 3);
        int moveSpeed = snapshot == null || snapshot.moveSpeed == null || snapshot.moveSpeed <= 0
                ? 300 : snapshot.moveSpeed;
        return Math.max(0, (int) Math.ceil(percentDistanceToWorld(distance(current, target)) / moveSpeed));
    }

    private boolean teammateHasResourcePriority(int slot, int time, Position target,
            Map<Integer, LaneAssignment> assignments) {
        if (target == null) return false;
        LaneAssignment own = assignments.get(slot);
        int ownPosition = own == null ? 5 : own.position;
        Position ownLocation = positionOf(snapshotFloorAt(slot, time, 3));
        if (ownLocation == null) return false;
        double ownDistance = distance(ownLocation, target);
        int teamStart = slot < 5 ? 0 : 5;
        for (int teammate = teamStart; teammate < teamStart + 5; teammate++) {
            if (teammate == slot) continue;
            LaneAssignment other = assignments.get(teammate);
            if (other == null || other.position > 3 || other.position > ownPosition) continue;
            Snapshot snapshot = snapshotFloorAt(teammate, time, 3);
            if (snapshot == null || snapshot.lifeState != null && snapshot.lifeState != 0) continue;
            Position location = positionOf(snapshot);
            if (location != null && distance(location, target) + 2.5 < ownDistance) return true;
        }
        return false;
    }

    private static String routeBlocker(LaneAssignment assignment, int units, int expectedGold,
            LaneSafety safety, boolean teammateClaim, int travelSeconds, int deadline) {
        if (assignment == null || assignment.confidence < 0.65) return "role_uncertain";
        if (assignment.position > 3) return "role_not_resource_priority";
        if (units < 2) return "resource_sample_too_small";
        if (expectedGold <= 0) return "unit_value_unavailable";
        if (safety.unknownEnemies > 0) return "enemy_visibility_incomplete";
        if (safety.nearbyThreats > 0) return "known_enemy_threat";
        if (teammateClaim) return "team_resource_claim";
        if (travelSeconds == Integer.MAX_VALUE) return "player_position_unavailable";
        if (deadline <= 0 || travelSeconds > deadline) return "arrival_after_resource_deadline";
        return "none";
    }

    private static String routeBlockerDescription(String blocker) {
        return switch (blocker) {
            case "role_uncertain" -> "分路与位置置信度不足，暂不生成资源路线";
            case "role_not_resource_priority" -> "该位置不应为了候选资源抢占核心路线";
            case "resource_sample_too_small" -> "可确认存活的资源单位不足两个";
            case "unit_value_unavailable" -> "缺少同场同类单位金币样本，不能估算路线收益";
            case "enemy_visibility_incomplete" -> "敌方连续可见性不完整，不能把路线判为安全";
            case "known_enemy_threat" -> "候选路线附近存在已知敌方威胁";
            case "team_resource_claim" -> "更高资源优先级队友更接近该资源";
            case "pre10_jungle_clear_unproven" -> "10 分钟前没有该英雄已完成清野的证据，不能建议离线进野区";
            case "strategic_commitment" -> "该窗口正在参团或处理关键目标，不用纯打钱收益追责";
            case "arrival_after_resource_deadline" -> "按移动速度下限估算，抵达时资源已经消失";
            default -> "逐单位资源或位置证据不足，不能证明路线可执行";
        };
    }

    private boolean observedNeutralClearBefore(int slot, int time) {
        return goldPoints.stream().anyMatch(point -> point.slot != null && point.slot == slot
                        && point.time >= 0 && point.time <= time
                        && (point.classification.source().equals("neutral")
                                || point.classification.source().equals("ancient")))
                || deaths.stream().anyMatch(death -> death.attackerSlot != null
                        && death.attackerSlot == slot && death.time >= 0 && death.time <= time
                        && (unitKind(death).equals("neutral") || unitKind(death).equals("ancient")));
    }

    private String observedFarmAction(int slot, FarmWindow window, ObservedFarmCycle observedCycle) {
        if (!window.alive) return "dead";
        if (observedCycle != null) return "lane_jungle_cycle";

        boolean combatActivity = damages.stream().anyMatch(point -> point.time >= window.start
                && point.time <= window.end && (Integer.valueOf(slot).equals(point.attackerSlot)
                        || Integer.valueOf(slot).equals(point.targetSlot)))
                || controls.stream().anyMatch(point -> point.time >= window.start && point.time <= window.end
                        && (Integer.valueOf(slot).equals(point.attackerSlot)
                                || Integer.valueOf(slot).equals(point.targetSlot)))
                || deaths.stream().anyMatch(point -> point.targetHero && point.time >= window.start
                        && point.time <= window.end && (Integer.valueOf(slot).equals(point.attackerSlot)
                                || Integer.valueOf(slot).equals(point.targetSlot)));
        if (combatActivity || window.combatGold > Math.max(window.laneGold, window.neutralGold)) return "combat";
        if (window.otherGold > Math.max(window.laneGold, window.neutralGold)) return "objective_or_resource";
        if (window.laneGold > 0 && window.laneGold >= window.neutralGold) return "collect_lane";
        if (window.neutralGold > 0) return "hold_jungle";

        Snapshot first = snapshotNear(slot, window.start, 3);
        Snapshot last = snapshotNear(slot, window.end, 3);
        Position firstPosition = positionOf(first);
        Position lastPosition = positionOf(last);
        boolean purchased = purchases.stream().anyMatch(event -> event.slot != null && event.slot == slot
                && event.time >= window.start && event.time <= window.end);
        boolean recovered = first != null && last != null
                && (recoveryRatio(first.hp, last.hp, last.maxHp) >= 0.15
                        || recoveryRatio(first.mana, last.mana, last.maxMana) >= 0.15);
        boolean atBase = window.position != null && regionCode(window.position).contains("base");
        if (atBase && (purchased || recovered)) return "base_or_recovery";

        boolean teleported = usages.stream().anyMatch(event -> event.slot != null && event.slot == slot
                && event.time >= window.start && event.time <= window.end && isTeleportKey(event.key))
                || teleportChannels.stream().anyMatch(event -> event.slot != null && event.slot == slot
                        && event.time >= window.start && event.time <= window.end);
        if (teleported) return "teleport_or_travel";
        if (firstPosition == null || lastPosition == null) return "unknown";
        double displacement = distance(firstPosition, lastPosition);
        if (displacement >= 3.0) return "teleport_or_travel";
        if (!purchased && !recovered && displacement <= 1.5) return "idle_suspected";
        return "unknown";
    }

    private static double recoveryRatio(Float before, Float after, Float maximum) {
        if (before == null || after == null || maximum == null || maximum <= 0) return 0;
        return Math.max(0, after - before) / maximum;
    }

    private JsonArray buildUnitKills() {
        List<UnitKills> rows = new ArrayList<>();
        for (int slot = 0; slot < 10; slot++) rows.add(new UnitKills(slot));
        deaths.stream()
                .filter(death -> death.attackerSlot != null && death.attackerHero)
                .forEach(death -> rows.get(death.attackerSlot).add(death));
        JsonArray result = new JsonArray();
        rows.forEach(row -> result.add(row.toJson()));
        return result;
    }

    private List<JsonObject> buildWards(int duration) {
        List<WardPoint> wardList = wards.values().stream()
                .filter(ward -> ward.rawX != null && ward.rawY != null && ward.type != null)
                .sorted((left, right) -> compareEventStamps(left.placedStamp, right.placedStamp))
                .toList();
        List<JsonObject> result = new ArrayList<>();
        int index = 0;
        for (WardPoint ward : wardList) {
            int naturalLifetime = ward.type.equals("observer") ? 360 : 420;
            int rawEnd = ward.endedAt != null ? ward.endedAt : ward.placedAt + naturalLifetime;
            int placedAt = ward.placedAt;
            int endedAt = Math.max(placedAt, Math.min(duration, rawEnd));
            int lifetime = ward.lifetimeMs == null
                    ? Math.max(0, rawEnd - ward.placedAt)
                    : (int) Math.round(ward.lifetimeMs / 1000.0);
            String id = "ward-" + (++index);
            Position position = entityPosition(ward.rawX, ward.rawY);
            List<Detection> detections = position != null && ward.type.equals("observer")
                    ? wardDetections(ward, placedAt, endedAt)
                    : List.of();
            int dewards = position != null && ward.type.equals("sentry")
                    ? sentryDewards(ward, wardList, placedAt, endedAt) : 0;
            int overlap = position == null ? 0 : wardOverlap(ward, wardList, placedAt, endedAt);
            Set<Integer> unique = new LinkedHashSet<>();
            detections.forEach(detection -> unique.add(detection.heroSlot));
            double lifeRatio = Math.min(1.0, lifetime / (double) naturalLifetime);
            int score = ward.type.equals("observer")
                    ? (int) Math.round(35 * lifeRatio + Math.min(35, detections.size() * 5)
                            + Math.min(20, unique.size() * 5) + ("killed".equals(ward.endReason) ? 0 : 10)
                            - overlap * 0.12)
                    : (int) Math.round(45 * lifeRatio + Math.min(45, dewards * 22) + 10 - overlap * 0.1);
            score = Math.max(0, Math.min(100, score));

            JsonObject row = new JsonObject();
            row.addProperty("id", id);
            row.addProperty("team", ward.team != null && ward.team == DIRE ? "dire" : "radiant");
            addNullable(row, "playerSlot", ward.ownerSlot);
            row.addProperty("placedAt", placedAt);
            row.addProperty("placedRaw", ward.placedAt);
            row.addProperty("endedAt", endedAt);
            if (ward.placedStamp != null) {
                row.addProperty("placedAtMs", ward.placedStamp.gameTimeMs);
                row.addProperty("placedDemoTick", ward.placedStamp.demoTick);
                row.addProperty("placedEventSeq", ward.placedStamp.eventSequence);
                row.addProperty("placedTimeSource", ward.placedStamp.source);
                row.addProperty("placedTimePrecision", ward.placedStamp.timePrecision);
                row.addProperty("placedOrderingQuality", ward.placedStamp.orderingQuality);
            }
            if (ward.endedStamp == null) {
                row.addProperty("endedAtMs",
                        Math.min(duration * 1000L, ward.placedStamp.gameTimeMs + naturalLifetime * 1000L));
                row.addProperty("endedDemoTick", -1);
                row.addProperty("endedEventSeq", -1);
                row.addProperty("endedTimeSource", "derived_lifetime");
                row.addProperty("endedTimePrecision", "millisecond");
                row.addProperty("endedOrderingQuality", "derived_without_replay_order");
            } else {
                row.addProperty("endedAtMs", ward.endedStamp.gameTimeMs);
                row.addProperty("endedDemoTick", ward.endedStamp.demoTick);
                row.addProperty("endedEventSeq", ward.endedStamp.eventSequence);
                row.addProperty("endedTimeSource", ward.endedStamp.source);
                row.addProperty("endedTimePrecision", ward.endedStamp.timePrecision);
                row.addProperty("endedOrderingQuality", ward.endedStamp.orderingQuality);
            }
            row.addProperty("duration", lifetime);
            row.addProperty("type", ward.type);
            row.addProperty("purpose", wardPurpose(ward));
            if (position != null) {
                addPosition(row, position);
            } else {
                coordinates.annotate(row, null, false);
            }
            row.addProperty("detections", detections.size());
            row.addProperty("uniqueEnemies", unique.size());
            row.addProperty("dewards", dewards);
            row.addProperty("conversions", wardConversions(ward, detections));
            row.addProperty("overlap", overlap);
            row.addProperty("score", score);
            row.addProperty("endReason", "killed".equals(ward.endReason) ? "killed" : "expired");
            row.addProperty("objective", ward.type.equals("observer") ? "hero_vision" : "deward_control");
            int visionRadius = ward.type.equals("observer") && ward.visionRange != null && ward.visionRange > 0
                    ? ward.visionRange
                    : ward.type.equals("observer") ? 1600 : 1050;
            row.addProperty("radius", visionRadius);
            row.addProperty("evidence", position == null ? "missing_coordinate" : "derived_geometry");
            addNullable(row, "killerSlot", ward.killerSlot);
            JsonArray detectionRows = new JsonArray();
            for (Detection detection : detections) {
                JsonObject detectionRow = new JsonObject();
                detectionRow.addProperty("id", id + "-d-" + detectionRows.size());
                detectionRow.addProperty("time", detection.time);
                detectionRow.addProperty("heroSlot", detection.heroSlot);
                detectionRows.add(detectionRow);
            }
            row.add("detectionEvents", detectionRows);
            result.add(row);
        }
        return result;
    }

    private void rebuildVisibilityIndex(int duration, List<JsonObject> wardRows) {
        visibilityIndex.clear();
        Map<Integer, List<StealthInterval>> stealthBySlot = buildStealthIntervals(duration);
        Map<Integer, NavigableMap<Integer, Integer>> eventMasks = new HashMap<>();
        for (HeroVisibilityEvent event : heroVisibilityEvents) {
            if (event.slot == null) continue;
            eventMasks.computeIfAbsent(event.slot, ignored -> new TreeMap<>())
                    .put(event.time, event.visibleByTeam);
        }
        Map<Integer, Map<Integer, Set<Integer>>> combatVisible = new HashMap<>();
        combatVisible.put(RADIANT, new HashMap<>());
        combatVisible.put(DIRE, new HashMap<>());
        for (DamagePoint damage : damages) {
            if (damage.visibleRadiant) {
                addCombatVisible(combatVisible.get(RADIANT), damage.time, damage.attackerSlot, RADIANT);
                addCombatVisible(combatVisible.get(RADIANT), damage.time, damage.targetSlot, RADIANT);
            }
            if (damage.visibleDire) {
                addCombatVisible(combatVisible.get(DIRE), damage.time, damage.attackerSlot, DIRE);
                addCombatVisible(combatVisible.get(DIRE), damage.time, damage.targetSlot, DIRE);
            }
        }

        for (int perspectiveTeam : List.of(RADIANT, DIRE)) {
            Map<Integer, NavigableMap<Integer, VisibilitySample>> byEnemy = new LinkedHashMap<>();
            for (int enemySlot : perspectiveTeam == RADIANT
                    ? List.of(5, 6, 7, 8, 9) : List.of(0, 1, 2, 3, 4)) {
                NavigableMap<Integer, VisibilitySample> timeline = new TreeMap<>();
                int lastSeenAt = Integer.MIN_VALUE;
                Position lastSeenPosition = null;
                int lastKnownMoveSpeed = 300;
                for (int second = 0; second <= duration; second++) {
                    Snapshot enemy = snapshotFloorAt(enemySlot, second, 2);
                    Position enemyPosition = positionOf(enemy);
                    boolean alive = enemy != null && (enemy.lifeState == null || enemy.lifeState == 0);
                    Integer mask = enemy == null ? null : enemy.visibleByTeam;
                    NavigableMap<Integer, Integer> masks = eventMasks.get(enemySlot);
                    if (mask == null && masks != null) {
                        Map.Entry<Integer, Integer> entry = masks.floorEntry(second);
                        if (entry != null && second - entry.getKey() <= 2) mask = entry.getValue();
                    }
                    String state = "unknown";
                    String source = alive ? "fog_state_unavailable" : "enemy_dead_or_missing";
                    Position exposedPosition = null;
                    Integer exposedLastSeen = null;
                    float uncertainty = 0;
                    StealthState stealth = stealthStateAt(stealthBySlot, enemySlot, second);
                    boolean heroVision = alive && enemyPosition != null
                            && coveredByAlliedHero(perspectiveTeam, second, enemy, enemyPosition);
                    boolean observerVision = alive && enemyPosition != null
                            && coveredByObserverWard(perspectiveTeam, second, enemyPosition, wardRows);
                    boolean sentryTrueSight = alive && enemyPosition != null
                            && coveredBySentryWard(perspectiveTeam, second, enemyPosition, wardRows);
                    boolean geometricVision = heroVision || observerVision;
                    boolean geometryCanReveal = !stealth.smoked
                            && (!stealth.invisible || stealth.trueSightRevealable && sentryTrueSight);

                    if (alive && maskShowsTeam(mask, perspectiveTeam)) {
                        state = "confirmed";
                        source = "replay_visibility_mask";
                        exposedPosition = enemyPosition;
                    } else if (alive && combatVisible.get(perspectiveTeam)
                            .getOrDefault(second, Set.of()).contains(enemySlot)) {
                        state = "confirmed";
                        source = "combat_log_visibility";
                        exposedPosition = enemyPosition;
                    } else if (geometricVision && geometryCanReveal && heroVision) {
                        state = "probable";
                        source = stealth.invisible
                                ? "sentry_true_sight_plus_hero_geometry"
                                : "allied_hero_vision_geometry";
                        exposedPosition = enemyPosition;
                    } else if (geometricVision && geometryCanReveal && observerVision) {
                        state = "probable";
                        source = stealth.invisible
                                ? "sentry_true_sight_plus_observer_geometry"
                                : "observer_ward_geometry";
                        exposedPosition = enemyPosition;
                    }

                    if (state.equals("confirmed") || state.equals("probable")) {
                        lastSeenAt = second;
                        lastSeenPosition = enemyPosition;
                        if (enemy.moveSpeed != null && enemy.moveSpeed > 0) lastKnownMoveSpeed = enemy.moveSpeed;
                        exposedLastSeen = second;
                    } else if (alive && lastSeenPosition != null && second - lastSeenAt <= 20) {
                        state = "last_seen";
                        source = "bounded_last_seen_projection";
                        exposedPosition = lastSeenPosition;
                        exposedLastSeen = lastSeenAt;
                        uncertainty = Math.min(35.0f, worldDistanceToPercent(lastKnownMoveSpeed * (second - lastSeenAt)));
                    }
                    timeline.put(second, new VisibilitySample(second, state, source, exposedPosition,
                            exposedLastSeen, uncertainty));
                }
                byEnemy.put(enemySlot, timeline);
            }
            visibilityIndex.put(perspectiveTeam, byEnemy);
        }
    }

    private Map<Integer, List<StealthInterval>> buildStealthIntervals(int duration) {
        Map<Integer, Map<String, StealthModifierEvent>> active = new HashMap<>();
        Map<Integer, List<StealthInterval>> result = new HashMap<>();
        stealthModifierEvents.stream()
                .filter(event -> event.slot != null)
                .sorted((left, right) -> compareEventStamps(left.stamp, right.stamp))
                .forEach(event -> {
                    Map<String, StealthModifierEvent> slotActive = active.computeIfAbsent(
                            event.slot, ignored -> new LinkedHashMap<>());
                    if (!event.removed) {
                        slotActive.putIfAbsent(event.modifier, event);
                        return;
                    }
                    StealthModifierEvent started = slotActive.remove(event.modifier);
                    if (started == null) return;
                    int start = Math.max(0, started.time);
                    int endExclusive = Math.min(duration + 1, Math.max(start, event.time));
                    if (endExclusive > start) {
                        result.computeIfAbsent(event.slot, ignored -> new ArrayList<>())
                                .add(new StealthInterval(start, endExclusive, started.kind,
                                        started.trueSightRevealable));
                    }
                });
        active.forEach((slot, modifiers) -> modifiers.values().forEach(started -> {
            int start = Math.max(0, started.time);
            if (start <= duration) {
                result.computeIfAbsent(slot, ignored -> new ArrayList<>())
                        .add(new StealthInterval(start, duration + 1, started.kind,
                                started.trueSightRevealable));
            }
        }));
        result.values().forEach(rows -> rows.sort(Comparator.comparingInt(StealthInterval::start)));
        return result;
    }

    private static StealthState stealthStateAt(Map<Integer, List<StealthInterval>> bySlot,
            int slot, int second) {
        boolean smoked = false;
        boolean invisible = false;
        boolean trueSightRevealable = true;
        for (StealthInterval interval : bySlot.getOrDefault(slot, List.of())) {
            if (interval.start > second) break;
            if (second >= interval.endExclusive) continue;
            if (interval.kind == StealthKind.SMOKE) smoked = true;
            if (interval.kind == StealthKind.INVISIBLE) invisible = true;
            trueSightRevealable &= interval.trueSightRevealable;
        }
        return new StealthState(smoked, invisible, trueSightRevealable);
    }

    private static void addCombatVisible(Map<Integer, Set<Integer>> bySecond, int second,
            Integer slot, int perspectiveTeam) {
        if (slot == null || (slot < 5) == (perspectiveTeam == RADIANT)) return;
        bySecond.computeIfAbsent(second, ignored -> new LinkedHashSet<>()).add(slot);
    }

    private static boolean maskShowsTeam(Integer mask, int team) {
        return mask != null && ((mask & (1 << team)) != 0 || mask == team);
    }

    private boolean coveredByAlliedHero(int team, int time, Snapshot enemy, Position enemyPosition) {
        int first = team == RADIANT ? 0 : 5;
        for (int slot = first; slot < first + 5; slot++) {
            Snapshot ally = snapshotFloorAt(slot, time, 2);
            if (ally == null || ally.lifeState != null && ally.lifeState != 0) continue;
            if (enemy != null && enemy.rawZ != null && ally.rawZ != null
                    && enemy.rawZ - ally.rawZ >= 96.0f) continue;
            Position allyPosition = positionOf(ally);
            if (allyPosition == null) continue;
            int vision = isDay(time)
                    ? ally.dayVisionRange == null ? 1800 : ally.dayVisionRange
                    : ally.nightVisionRange == null ? 800 : ally.nightVisionRange;
            if (distance(allyPosition, enemyPosition) <= worldDistanceToPercent(vision)) return true;
        }
        return false;
    }

    private boolean coveredByObserverWard(int team, int time, Position enemyPosition, List<JsonObject> wardRows) {
        String teamName = team == RADIANT ? "radiant" : "dire";
        return wardRows.stream().anyMatch(ward -> teamName.equals(stringValue(ward, "team"))
                && "observer".equals(stringValue(ward, "type"))
                && intValue(ward, "placedAt", 0) <= time && intValue(ward, "endedAt", 0) >= time
                && wardCovers(enemyPosition, ward));
    }

    private boolean coveredBySentryWard(int team, int time, Position enemyPosition, List<JsonObject> wardRows) {
        String teamName = team == RADIANT ? "radiant" : "dire";
        return wardRows.stream().anyMatch(ward -> teamName.equals(stringValue(ward, "team"))
                && "sentry".equals(stringValue(ward, "type"))
                && intValue(ward, "placedAt", 0) <= time && intValue(ward, "endedAt", 0) >= time
                && wardCovers(enemyPosition, ward));
    }

    private static boolean isDay(int time) {
        return time < 0 || Math.floorDiv(time, 300) % 2 == 0;
    }

    private static float worldDistanceToPercent(double worldDistance) {
        return (float) (worldDistance / (MapCoordinateService.ENTITY_SPAN * 128.0) * 100.0);
    }

    private JsonObject buildVisionModule(int duration, List<JsonObject> wardRows) {
        JsonObject module = new JsonObject();
        module.add("wards", toArray(wardRows));
        JsonObject schema = new JsonObject();
        schema.addProperty("schema", "continuous-enemy-visibility/1.1");
        schema.addProperty("precision_seconds", 1);
        schema.addProperty("terrain_occlusion_modeled", false);
        schema.addProperty("terrain_height_guard_modeled", true);
        schema.addProperty("terrain_height_guard_scope", "allied_hero_geometry");
        schema.addProperty("tree_occlusion_modeled", false);
        schema.addProperty("smoke_modeled", true);
        schema.addProperty("invisibility_modeled", true);
        schema.addProperty("sentry_true_sight_modeled", true);
        schema.addProperty("hidden_current_position_exposed", false);
        schema.addProperty("states", "confirmed,probable,last_seen,unknown");
        schema.addProperty("last_seen_horizon_seconds", 20);
        module.add("visibility_schema", schema);

        JsonObject teams = new JsonObject();
        for (int team : List.of(RADIANT, DIRE)) {
            JsonObject enemies = new JsonObject();
            for (Map.Entry<Integer, NavigableMap<Integer, VisibilitySample>> entry
                    : visibilityIndex.getOrDefault(team, Map.of()).entrySet()) {
                JsonObject enemy = new JsonObject();
                JsonObject summary = new JsonObject();
                for (String state : List.of("confirmed", "probable", "last_seen", "unknown")) {
                    long seconds = entry.getValue().values().stream()
                            .filter(sample -> sample.state.equals(state)).count();
                    summary.addProperty(state + "_seconds", seconds);
                }
                enemy.add("summary", summary);
                JsonArray intervals = new JsonArray();
                visibilityRuns(entry.getValue()).forEach(run -> intervals.add(run.toJson()));
                enemy.add("intervals", intervals);
                enemies.add(Integer.toString(entry.getKey()), enemy);
            }
            teams.add(team == RADIANT ? "radiant" : "dire", enemies);
        }
        module.add("visibility_by_team", teams);
        return module;
    }

    private static List<VisibilityRun> visibilityRuns(NavigableMap<Integer, VisibilitySample> samples) {
        List<VisibilityRun> result = new ArrayList<>();
        VisibilityRun current = null;
        for (VisibilitySample sample : samples.values()) {
            if (current == null || !current.canMerge(sample)) {
                current = new VisibilityRun(sample);
                result.add(current);
            } else {
                current.add(sample);
            }
        }
        return result;
    }

    private List<Detection> wardDetections(WardPoint ward, int start, int end) {
        List<Detection> detections = new ArrayList<>();
        int ownerTeam = ward.team == null ? RADIANT : ward.team;
        float radiusCells = Math.max(1, (ward.visionRange == null ? 1600 : ward.visionRange) / 128.0f);
        for (int slot = ownerTeam == RADIANT ? 5 : 0; slot < (ownerTeam == RADIANT ? 10 : 5); slot++) {
            NavigableMap<Integer, Snapshot> rows = snapshots.get(slot);
            if (rows == null) continue;
            boolean inside = false;
            int lastTime = Integer.MIN_VALUE;
            for (Snapshot snapshot : rows.subMap(start, true, end, true).values()) {
                if (snapshot.rawX == null || snapshot.rawY == null || snapshot.lifeState != null && snapshot.lifeState != 0) {
                    inside = false;
                    continue;
                }
                if (lastTime != Integer.MIN_VALUE && snapshot.time - lastTime > 3) inside = false;
                boolean nowInside = rawDistance(ward.rawX, ward.rawY, snapshot.rawX, snapshot.rawY) <= radiusCells;
                if (nowInside && !inside) detections.add(new Detection(snapshot.time, slot));
                inside = nowInside;
                lastTime = snapshot.time;
            }
        }
        detections.sort(Comparator.comparingInt(detection -> detection.time));
        return detections;
    }

    private int sentryDewards(WardPoint sentry, List<WardPoint> all, int start, int end) {
        int enemyTeam = sentry.team != null && sentry.team == RADIANT ? DIRE : RADIANT;
        int count = 0;
        for (WardPoint target : all) {
            if (target.team == null || target.team != enemyTeam || target.endedAt == null
                    || target.endedAt < start || target.endedAt > end || !"killed".equals(target.endReason)
                    || target.rawX == null || target.rawY == null) {
                continue;
            }
            if (rawDistance(sentry.rawX, sentry.rawY, target.rawX, target.rawY) <= 1050.0f / 128.0f) count++;
        }
        return count;
    }

    private int wardOverlap(WardPoint ward, List<WardPoint> all, int start, int end) {
        int overlap = 0;
        float radius = (ward.type.equals("observer") ? 1600.0f : 1050.0f) / 128.0f;
        for (WardPoint other : all) {
            if (other == ward || other.team == null || !other.team.equals(ward.team) || !other.type.equals(ward.type)
                    || other.rawX == null || other.rawY == null) continue;
            int otherEnd = other.endedAt == null ? other.placedAt + (other.type.equals("observer") ? 360 : 420) : other.endedAt;
            if (other.placedAt <= end && otherEnd >= start
                    && rawDistance(ward.rawX, ward.rawY, other.rawX, other.rawY) <= radius * 1.5f) overlap++;
        }
        return Math.min(100, overlap * 18);
    }

    private int wardConversions(WardPoint ward, List<Detection> detections) {
        if (ward.team == null || detections.isEmpty()) return 0;
        int count = 0;
        for (Detection detection : detections) {
            boolean converted = deaths.stream().anyMatch(death -> death.targetSlot != null
                    && death.targetSlot == detection.heroSlot
                    && death.time >= detection.time && death.time <= detection.time + 20
                    && death.attackerTeam != null && death.attackerTeam.equals(ward.team));
            if (converted) count++;
        }
        return count;
    }

    private JsonObject buildCombatModule(int duration, List<JsonObject> wardRows,
            List<RoshanAttempt> roshanAttempts, Map<Integer, LaneAssignment> laneAssignments) {
        List<CombatCluster> candidateClusters = mergeRelatedCombatClusters(buildCombatClusters());
        List<CombatCluster> clusters = segmentCombatClusters(candidateClusters);
        JsonArray fights = new JsonArray();
        int index = 0;
        for (CombatCluster cluster : clusters) {
            long contactStartMs = cluster.firstTimeMs();
            long contactEndMs = cluster.lastTimeMs();
            long reviewStartMs = contactStartMs - 10_000L;
            long endMs = Math.min(duration * 1000L, contactEndMs + 4_000L);
            int contactStart = secondFloor(contactStartMs);
            int contactEnd = secondCeil(contactEndMs);
            int start = secondFloor(reviewStartMs);
            int end = secondCeil(endMs);
            CombatPeak peak = combatPeak(cluster);
            CombatLocation location = combatLocation(cluster, peak);
            Position position = location.position;
            Set<Integer> seedParticipants = cluster.participants;
            double attachRadius = Math.max(12.0, location.scatterRadius + 5.0);
            List<DamagePoint> fightDamage = damages.stream()
                    .filter(damage -> enemyHeroEvent(damage.attackerSlot, damage.targetSlot)
                            && damage.stamp.gameTimeMs >= contactStartMs && damage.stamp.gameTimeMs <= contactEndMs
                            && combatEventMatches(position, attachRadius, damage.time,
                                    damage.attackerSlot, damage.targetSlot, seedParticipants))
                    .toList();
            List<HealPoint> fightHeals = heals.stream()
                    .filter(heal -> heal.stamp.gameTimeMs >= contactStartMs && heal.stamp.gameTimeMs <= contactEndMs
                            && !heal.regen && !heal.lifesteal
                            && combatEventMatches(position, attachRadius, heal.time,
                                    heal.attackerSlot, heal.targetSlot, seedParticipants))
                    .toList();
            List<ControlPoint> fightControls = controls.stream()
                    .filter(control -> enemyHeroEvent(control.attackerSlot, control.targetSlot)
                            && control.stamp.gameTimeMs >= contactStartMs && control.stamp.gameTimeMs <= contactEndMs
                            && combatEventMatches(position, attachRadius, control.time,
                                    control.attackerSlot, control.targetSlot, seedParticipants))
                    .toList();
            List<ActorEvent> reviewUsages = usages.stream()
                    .filter(event -> event.stamp.gameTimeMs >= reviewStartMs && event.stamp.gameTimeMs <= endMs
                            && event.slot != null
                            && seedParticipants.contains(event.slot)
                            && combatEventMatches(position, attachRadius, event.time,
                                    event.slot, event.targetSlot, seedParticipants))
                    .toList();
            List<ActorEvent> fightUsages = reviewUsages.stream()
                    .filter(event -> event.stamp.gameTimeMs >= contactStartMs
                            && event.stamp.gameTimeMs <= contactEndMs)
                    .toList();
            List<DeathPoint> group = deaths.stream()
                    .filter(death -> death.targetHero && death.targetSlot != null
                            && death.stamp.gameTimeMs >= contactStartMs && death.stamp.gameTimeMs <= contactEndMs
                            && seedParticipants.contains(death.targetSlot)
                            && combatEventMatches(position, attachRadius, death.time,
                                    death.attackerSlot, death.targetSlot, seedParticipants))
                    .toList();
            Set<Integer> participants = combatParticipants(group, fightDamage, fightHeals,
                    fightControls, fightUsages);
            int radiantParticipants = (int) participants.stream().filter(slot -> slot < 5).count();
            if (radiantParticipants == 0 || radiantParticipants == participants.size()) continue;
            int radiantDeaths = (int) group.stream().filter(death -> death.targetSlot < 5).count();
            int direDeaths = group.size() - radiantDeaths;
            int totalDamage = fightDamage.stream().mapToInt(damage -> damage.value).sum();
            List<TeleportResponse> teleportResponses = buildTeleportResponses(start, contactStart, contactEnd,
                    position, attachRadius);
            CombatClassification classification = classifyCombat(cluster, participants, group, fightDamage,
                    fightControls, fightUsages, position, location.scatterRadius, teleportResponses);
            JsonObject towerContext = buildTowerContext(contactStartMs, contactEndMs, position,
                    fightDamage, fightControls, group);
            JsonObject roshanContext = buildFightRoshanContext(contactStartMs, contactEndMs,
                    position, roshanAttempts);

            JsonObject fight = new JsonObject();
            fight.addProperty("id", "fight-" + (++index));
            fight.addProperty("start", start);
            fight.addProperty("end", end);
            fight.addProperty("review_start", start);
            fight.addProperty("contact_start", contactStart);
            fight.addProperty("contact_end", contactEnd);
            fight.addProperty("peak_start", secondFloor(peak.startMs));
            fight.addProperty("peak_end", secondCeil(peak.endMs));
            fight.addProperty("review_start_ms", reviewStartMs);
            fight.addProperty("contact_start_ms", contactStartMs);
            fight.addProperty("contact_end_ms", contactEndMs);
            fight.addProperty("peak_start_ms", peak.startMs);
            fight.addProperty("peak_end_ms", peak.endMs);
            fight.addProperty("kind", classification.kind);
            fight.addProperty("segmentation_model", "combat-segmenter/2.0");
            fight.addProperty("radiant_deaths", radiantDeaths);
            fight.addProperty("dire_deaths", direDeaths);
            fight.addProperty("total_damage", totalDamage);
            if (position != null) {
                addPosition(fight, position);
                fight.addProperty("region", regionCode(position));
                fight.addProperty("scatter_radius_pct", Math.round(location.scatterRadius * 100.0) / 100.0);
                fight.addProperty("location_confidence", location.confidence);
                fight.addProperty("location_method", "peak_weighted_geometric_median");
            }
            JsonArray participantRows = new JsonArray();
            participants.forEach(participantRows::add);
            fight.add("participants", participantRows);
            JsonArray nearbyRows = new JsonArray();
            nearbyCombatSlots(position, secondFloor(peak.startMs), participants).forEach(nearbyRows::add);
            fight.add("nearby_slots", nearbyRows);
            fight.add("classification", classification.toJson());
            if (towerContext != null) fight.add("tower_context", towerContext);
            if (roshanContext != null) fight.add("objective_context", roshanContext);
            fight.add("phases", buildCombatPhases(duration, cluster, peak, position, participants,
                    group, fightDamage, fightHeals, fightControls, reviewUsages));
            fight.add("importance", buildCombatImportance(duration, contactStartMs, contactEndMs,
                    position, classification, group, teleportResponses));
            JsonArray supportRows = new JsonArray();
            teleportResponses.forEach(response -> supportRows.add(teleportResponseJson(response)));
            fight.add("support_events", supportRows);
            fight.add("events", buildFightEvents(group, fightDamage, fightHeals, fightControls, reviewUsages,
                    teleportResponses));
            fight.add("damage_by_slot", buildDamageBreakdown(fightDamage));
            fight.add("vision", buildFightVision(start, end, position, fightDamage, wardRows));
            fight.add("contributions", buildFightContributions(duration, contactStart, contactEnd, position, participants,
                    group, fightDamage, fightHeals, fightControls, fightUsages, wardRows, laneAssignments));
            fights.add(fight);
        }
        JsonObject module = new JsonObject();
        module.addProperty("classification_model", "combat-rules/2.2");
        module.addProperty("segmentation_model", "combat-segmenter/2.0");
        module.addProperty("candidate_clusters", candidateClusters.size());
        module.addProperty("segmented_clusters", clusters.size());
        module.add("fights", fights);
        return module;
    }

    private JsonObject buildTowerContext(long contactStartMs, long contactEndMs, Position center,
            List<DamagePoint> fightDamage, List<ControlPoint> fightControls, List<DeathPoint> fightDeaths) {
        if (center == null) return null;
        String tower = null;
        Position towerPosition = null;
        double towerDistance = Double.POSITIVE_INFINITY;
        for (String candidate : coordinates.towerKeys()) {
            Position candidatePosition = position(coordinates.building(candidate));
            if (candidatePosition == null) continue;
            double candidateDistance = distance(center, candidatePosition);
            if (candidateDistance < towerDistance) {
                tower = candidate;
                towerPosition = candidatePosition;
                towerDistance = candidateDistance;
            }
        }
        if (tower == null || towerDistance > 12.0) return null;
        final String towerKey = tower;
        int ownerTeam = tower.contains("goodguys") ? RADIANT : DIRE;
        int attackingTeam = ownerTeam == RADIANT ? DIRE : RADIANT;
        boolean aliveAtContact = objectives.stream().noneMatch(objective -> objective.kind.equals("building")
                && towerKey.equals(objective.target) && objective.stamp.gameTimeMs <= contactStartMs);
        List<DamagePoint> towerHits = damages.stream()
                .filter(damage -> towerKey.equals(damage.attackerName) && damage.targetSlot != null
                        && teamForSlot(damage.targetSlot) == attackingTeam
                        && damage.stamp.gameTimeMs >= contactStartMs - 2_000L
                        && damage.stamp.gameTimeMs <= contactEndMs + 2_000L)
                .toList();
        int attackerHeroDamage = fightDamage.stream()
                .filter(damage -> damage.attackerSlot != null
                        && teamForSlot(damage.attackerSlot) == attackingTeam)
                .mapToInt(damage -> damage.value).sum();
        double attackerControl = fightControls.stream()
                .filter(control -> control.attackerSlot != null
                        && teamForSlot(control.attackerSlot) == attackingTeam)
                .mapToDouble(control -> control.duration).sum();
        int attackerDeaths = (int) fightDeaths.stream().filter(death -> death.targetSlot != null
                && teamForSlot(death.targetSlot) == attackingTeam).count();
        int defenderDeaths = (int) fightDeaths.stream().filter(death -> death.targetSlot != null
                && teamForSlot(death.targetSlot) == ownerTeam).count();
        boolean towerDestroyedAfter = objectives.stream().anyMatch(objective -> objective.kind.equals("building")
                && towerKey.equals(objective.target) && objective.stamp.gameTimeMs >= contactStartMs
                && objective.stamp.gameTimeMs <= contactEndMs + 20_000L);
        boolean confirmedDive = aliveAtContact && towerDistance <= 8.5
                && attackerHeroDamage > 0 && !towerHits.isEmpty();
        String status = confirmedDive ? "confirmed_dive"
                : aliveAtContact && attackerHeroDamage > 0 ? "tower_zone_fight"
                : aliveAtContact ? "near_live_tower" : "destroyed_tower_zone";
        String outcome = towerDestroyedAfter ? "tower_destroyed"
                : defenderDeaths > attackerDeaths ? "attacker_favored_trade"
                : attackerDeaths > defenderDeaths ? "defense_favored_trade"
                : "no_clear_conversion";

        JsonObject row = new JsonObject();
        row.addProperty("status", status);
        row.addProperty("confirmed_dive", confirmedDive);
        row.addProperty("tower", tower);
        row.addProperty("tower_owner_team", ownerTeam);
        row.addProperty("attacking_team", attackingTeam);
        row.addProperty("alive_at_contact", aliveAtContact);
        row.addProperty("center_distance_pct", round2(towerDistance));
        row.addProperty("defense_radius_pct", 8.5);
        row.addProperty("tower_hit_events", towerHits.size());
        row.addProperty("tower_damage_to_attackers", towerHits.stream().mapToInt(hit -> hit.value).sum());
        row.addProperty("attacker_hero_damage", attackerHeroDamage);
        row.addProperty("attacker_control_seconds", round2(attackerControl));
        row.addProperty("attacker_deaths", attackerDeaths);
        row.addProperty("defender_deaths", defenderDeaths);
        row.addProperty("attackers_before", countNearbyTeamByTeam(attackingTeam, center,
                secondFloor(contactStartMs - 2_000L), 12.0));
        row.addProperty("defenders_before", countNearbyTeamByTeam(ownerTeam, center,
                secondFloor(contactStartMs - 2_000L), 12.0));
        row.addProperty("attackers_after", countNearbyTeamByTeam(attackingTeam, center,
                secondCeil(contactEndMs + 2_000L), 12.0));
        row.addProperty("defenders_after", countNearbyTeamByTeam(ownerTeam, center,
                secondCeil(contactEndMs + 2_000L), 12.0));
        row.addProperty("tower_destroyed_within_20s", towerDestroyedAfter);
        row.addProperty("outcome", outcome);
        row.addProperty("evidence", confirmedDive ? "fact_tower_damage_and_derived_zone"
                : "derived_tower_zone_only");
        JsonObject towerPoint = new JsonObject();
        addPosition(towerPoint, towerPosition);
        row.add("tower_position", towerPoint);
        return row;
    }

    private int countNearbyTeamByTeam(int team, Position center, int time, double radius) {
        int teamStart = team == RADIANT ? 0 : 5;
        int count = 0;
        for (int slot = teamStart; slot < teamStart + 5; slot++) {
            Snapshot snapshot = snapshotNear(slot, time, 3);
            if (snapshot == null || snapshot.lifeState != null && snapshot.lifeState != 0) continue;
            Position point = positionOf(snapshot);
            if (point != null && distance(point, center) <= radius) count++;
        }
        return count;
    }

    private List<CombatCluster> buildCombatClusters() {
        List<CombatSignal> signals = new ArrayList<>();
        damages.stream()
                .filter(damage -> enemyHeroEvent(damage.attackerSlot, damage.targetSlot))
                .forEach(damage -> signals.add(new CombatSignal(damage.stamp, "damage", damage.attackerSlot,
                        damage.targetSlot, damage.value, 0, combatPosition(damage.time,
                                damage.attackerSlot, damage.targetSlot))));
        controls.stream()
                .filter(control -> enemyHeroEvent(control.attackerSlot, control.targetSlot))
                .forEach(control -> signals.add(new CombatSignal(control.stamp, "control", control.attackerSlot,
                        control.targetSlot, 0, control.duration, combatPosition(control.time,
                                control.attackerSlot, control.targetSlot))));
        deaths.stream()
                .filter(death -> death.targetHero && death.targetSlot != null)
                .forEach(death -> signals.add(new CombatSignal(death.stamp, "death", death.attackerSlot,
                        death.targetSlot, 0, 0, combatPosition(death.time,
                                death.attackerSlot, death.targetSlot))));
        signals.sort((left, right) -> compareEventStamps(left.stamp, right.stamp));

        List<CombatCluster> clusters = new ArrayList<>();
        for (CombatSignal signal : signals) {
            CombatCluster best = null;
            double bestScore = Double.MAX_VALUE;
            for (CombatCluster candidate : clusters) {
                long gapMs = signal.timeMs - candidate.lastTimeMs();
                if (gapMs < 0 || gapMs > 10_000L) continue;
                Position center = candidate.center();
                boolean shared = candidate.sharesParticipant(signal);
                double spatial;
                if (signal.position == null || center == null) {
                    if (!shared || gapMs > 3_000L) continue;
                    spatial = 20;
                } else {
                    spatial = distance(signal.position, center);
                    if (spatial > 12.5) continue;
                    if (gapMs > 6_000L && !shared) continue;
                }
                double score = spatial + gapMs / 1000.0 * 1.5;
                if (score < bestScore) {
                    best = candidate;
                    bestScore = score;
                }
            }
            if (best == null) {
                best = new CombatCluster();
                clusters.add(best);
            }
            best.add(signal);
        }

        return clusters.stream()
                .filter(this::isMeaningfulCombat)
                .sorted(Comparator.comparingLong(CombatCluster::firstTimeMs))
                .toList();
    }

    private List<CombatCluster> mergeRelatedCombatClusters(List<CombatCluster> source) {
        List<CombatCluster> merged = new ArrayList<>(source);
        boolean changed;
        do {
            changed = false;
            outer:
            for (int leftIndex = 0; leftIndex < merged.size(); leftIndex++) {
                CombatCluster left = merged.get(leftIndex);
                for (int rightIndex = leftIndex + 1; rightIndex < merged.size(); rightIndex++) {
                    CombatCluster right = merged.get(rightIndex);
                    if (right.firstTimeMs() - left.lastTimeMs() > 5_000L) break;
                    if (!shouldMergeCombatClusters(left, right)) continue;
                    left.merge(right);
                    merged.remove(rightIndex);
                    changed = true;
                    break outer;
                }
            }
        } while (changed);
        return merged.stream()
                .filter(this::isMeaningfulCombat)
                .sorted(Comparator.comparingLong(CombatCluster::firstTimeMs))
                .toList();
    }

    private static boolean shouldMergeCombatClusters(CombatCluster left, CombatCluster right) {
        long gapMs = Math.max(0, right.firstTimeMs() - left.lastTimeMs());
        if (gapMs > 5_000L) return false;
        long shared = left.participants.stream().filter(right.participants::contains).count();
        int smallerSide = Math.max(1, Math.min(left.participants.size(), right.participants.size()));
        double participantOverlap = shared / (double) smallerSide;
        if (shared < 2 || participantOverlap < 0.5) return false;

        Position leftCenter = left.center();
        Position rightCenter = right.center();
        if (leftCenter == null || rightCenter == null) return shared >= 3 && gapMs <= 2_000L;
        double centerDistance = distance(leftCenter, rightCenter);
        if (centerDistance < 14.04) return true;
        double targetOverlap = jaccard(signalTargets(left.signals), signalTargets(right.signals));
        return centerDistance <= 21.5 && targetOverlap > 0 && participantOverlap >= 0.5;
    }

    private List<CombatCluster> segmentCombatClusters(List<CombatCluster> source) {
        List<CombatCluster> result = new ArrayList<>();
        for (CombatCluster cluster : source) {
            List<CombatCluster> parts = new ArrayList<>();
            CombatCluster current = new CombatCluster();
            for (int index = 0; index < cluster.signals.size(); index++) {
                CombatSignal signal = cluster.signals.get(index);
                if (!current.signals.isEmpty() && shouldSplitCombatSegment(current, cluster.signals, index)) {
                    parts.add(current);
                    current = new CombatCluster();
                }
                current.add(signal);
            }
            if (!current.signals.isEmpty()) parts.add(current);
            parts.stream().filter(this::isMeaningfulCombat).forEach(result::add);
        }
        return result.stream().sorted(Comparator.comparingLong(CombatCluster::firstTimeMs)).toList();
    }

    private boolean shouldSplitCombatSegment(CombatCluster current, List<CombatSignal> allSignals,
            int nextIndex) {
        CombatSignal previous = current.signals.get(current.signals.size() - 1);
        CombatSignal next = allSignals.get(nextIndex);
        long gapMs = Math.max(0, next.timeMs - previous.timeMs);
        if (gapMs >= 10_000L) return true;

        List<CombatSignal> leftWindow = current.signals.stream()
                .filter(signal -> signal.timeMs >= previous.timeMs - 4_000L).toList();
        List<CombatSignal> rightWindow = allSignals.subList(nextIndex, allSignals.size()).stream()
                .filter(signal -> signal.timeMs <= next.timeMs + 4_000L).toList();
        Position leftCenter = signalCenter(leftWindow);
        Position rightCenter = signalCenter(rightWindow);
        double centerDistance = leftCenter == null || rightCenter == null
                ? 0 : distance(leftCenter, rightCenter);
        double participantOverlap = setOverlap(signalParticipants(leftWindow), signalParticipants(rightWindow));
        double targetOverlap = jaccard(signalTargets(leftWindow), signalTargets(rightWindow));
        boolean continuousChase = targetOverlap > 0 && participantOverlap >= 0.5 && centerDistance < 14.04;

        if (gapMs >= 8_000L) return !continuousChase;

        int softChanges = (centerDistance >= 10.99 ? 1 : 0)
                + (participantOverlap < 0.5 ? 1 : 0)
                + (targetOverlap < 0.34 ? 1 : 0);
        if (gapMs >= 6_000L && softChanges >= 2 && !continuousChase) return true;
        if (current.lastTimeMs() - current.firstTimeMs() >= 18_000L && gapMs >= 3_000L
                && softChanges >= 2 && centerDistance >= 10.99 && !continuousChase) return true;
        return centerDistance >= 14.04 && participantOverlap < 0.5 && targetOverlap < 0.25;
    }

    private static Position signalCenter(List<CombatSignal> signals) {
        double totalWeight = signals.stream().filter(signal -> signal.position != null)
                .mapToDouble(CombatSignal::locationWeight).sum();
        if (totalWeight == 0) return null;
        double x = signals.stream().filter(signal -> signal.position != null)
                .mapToDouble(signal -> signal.position.x * signal.locationWeight()).sum() / totalWeight;
        double y = signals.stream().filter(signal -> signal.position != null)
                .mapToDouble(signal -> signal.position.y * signal.locationWeight()).sum() / totalWeight;
        return new Position((float) x, (float) y);
    }

    private static Set<Integer> signalParticipants(List<CombatSignal> signals) {
        Set<Integer> result = new LinkedHashSet<>();
        for (CombatSignal signal : signals) {
            if (signal.actorSlot != null) result.add(signal.actorSlot);
            if (signal.targetSlot != null) result.add(signal.targetSlot);
        }
        return result;
    }

    private static Set<Integer> signalTargets(List<CombatSignal> signals) {
        Set<Integer> result = new LinkedHashSet<>();
        signals.stream().map(signal -> signal.targetSlot).filter(slot -> slot != null).forEach(result::add);
        return result;
    }

    private static double setOverlap(Set<Integer> left, Set<Integer> right) {
        if (left.isEmpty() || right.isEmpty()) return 0;
        long shared = left.stream().filter(right::contains).count();
        return shared / (double) Math.max(1, Math.min(left.size(), right.size()));
    }

    private static double jaccard(Set<Integer> left, Set<Integer> right) {
        if (left.isEmpty() && right.isEmpty()) return 1;
        long shared = left.stream().filter(right::contains).count();
        int union = left.size() + right.size() - (int) shared;
        return shared / (double) Math.max(1, union);
    }

    private boolean isMeaningfulCombat(CombatCluster cluster) {
        int radiant = (int) cluster.participants.stream().filter(slot -> slot < 5).count();
        int dire = cluster.participants.size() - radiant;
        if (radiant == 0 || dire == 0) return false;
        int deaths = cluster.count("death");
        int damage = cluster.damage();
        double control = cluster.controlSeconds();
        if (deaths > 0) return true;
        return damage >= 600 || (damage >= 300 && control >= 1.0)
                || (damage >= 450 && cluster.signals.size() >= 6);
    }

    private CombatPeak combatPeak(CombatCluster cluster) {
        long bestStart = cluster.firstTimeMs();
        double bestIntensity = -1;
        for (CombatSignal candidate : cluster.signals) {
            long windowStart = candidate.timeMs;
            double intensity = cluster.signals.stream()
                    .filter(signal -> signal.timeMs >= windowStart && signal.timeMs <= windowStart + 3_000L)
                    .mapToDouble(CombatSignal::intensity)
                    .sum();
            if (intensity > bestIntensity) {
                bestIntensity = intensity;
                bestStart = windowStart;
            }
        }
        return new CombatPeak(bestStart, Math.min(cluster.lastTimeMs(), bestStart + 3_000L));
    }

    private CombatLocation combatLocation(CombatCluster cluster, CombatPeak peak) {
        List<CombatSignal> peakSignals = cluster.signals.stream()
                .filter(signal -> signal.position != null && signal.timeMs >= peak.startMs - 1_000L
                        && signal.timeMs <= peak.endMs + 1_000L)
                .toList();
        if (peakSignals.size() < 2) {
            peakSignals = cluster.signals.stream().filter(signal -> signal.position != null).toList();
        }
        if (peakSignals.isEmpty()) return new CombatLocation(null, 0, 0);
        Position initial = weightedGeometricMedian(peakSignals);
        Position initialCenter = initial;
        List<CombatSignal> inliers = peakSignals.stream()
                .filter(signal -> distance(initialCenter, signal.position) <= 15.5)
                .toList();
        if (inliers.isEmpty()) inliers = peakSignals;
        Position center = weightedGeometricMedian(inliers);
        double totalWeight = inliers.stream().mapToDouble(CombatSignal::locationWeight).sum();
        double variance = inliers.stream().mapToDouble(signal -> {
            double delta = distance(center, signal.position);
            return delta * delta * signal.locationWeight();
        }).sum() / Math.max(1.0, totalWeight);
        double scatter = Math.max(3.0, Math.min(18.0, Math.sqrt(variance) * 1.35 + 2.0));
        int confidence = (int) Math.round(Math.max(35, Math.min(96,
                90 - scatter * 2.8 + Math.min(22, inliers.size() * 2.0))));
        return new CombatLocation(center, scatter, confidence);
    }

    private JsonArray buildCombatPhases(int duration, CombatCluster cluster, CombatPeak peak,
            Position battleCenter, Set<Integer> fightParticipants, List<DeathPoint> fightDeaths,
            List<DamagePoint> fightDamage, List<HealPoint> fightHeals, List<ControlPoint> fightControls,
            List<ActorEvent> reviewUsages) {
        long contactStartMs = cluster.firstTimeMs();
        long contactEndMs = cluster.lastTimeMs();
        long reviewStartMs = contactStartMs - 10_000L;
        long firstResponseMs = firstOpponentResponseMs(cluster);
        long initiationEndMs = firstResponseMs == Long.MAX_VALUE
                ? Math.min(contactEndMs, contactStartMs + 2_000L)
                : Math.min(contactEndMs, Math.max(contactStartMs + 250L, firstResponseMs));
        long clashEndMs = Math.min(contactEndMs,
                Math.max(initiationEndMs, Math.min(contactEndMs, peak.endMs + 1_000L)));
        long conversionEndMs = Math.min(duration * 1000L, contactEndMs + 30_000L);

        JsonArray phases = new JsonArray();
        phases.add(combatPhaseJson("setup", reviewStartMs, contactStartMs, "fixed_review_lead_in",
                battleCenter, cluster, fightParticipants, fightDeaths, fightDamage, fightHeals,
                fightControls, reviewUsages));
        phases.add(combatPhaseJson("initiation", contactStartMs, initiationEndMs,
                firstResponseMs == Long.MAX_VALUE ? "first_commitment_window" : "first_opponent_response",
                battleCenter, cluster, fightParticipants, fightDeaths, fightDamage, fightHeals,
                fightControls, reviewUsages));
        phases.add(combatPhaseJson("clash", initiationEndMs, clashEndMs, "peak_intensity_window",
                battleCenter, cluster, fightParticipants, fightDeaths, fightDamage, fightHeals,
                fightControls, reviewUsages));
        phases.add(combatPhaseJson("cleanup", clashEndMs, contactEndMs, "post_peak_low_intensity",
                battleCenter, cluster, fightParticipants, fightDeaths, fightDamage, fightHeals,
                fightControls, reviewUsages));
        phases.add(combatPhaseJson("conversion", contactEndMs, conversionEndMs, "objective_window_30s",
                battleCenter, cluster, fightParticipants, fightDeaths, fightDamage, fightHeals,
                fightControls, reviewUsages));
        return phases;
    }

    private static long firstOpponentResponseMs(CombatCluster cluster) {
        CombatSignal opener = cluster.signals.stream()
                .filter(signal -> signal.actorSlot != null)
                .findFirst().orElse(null);
        if (opener == null) return Long.MAX_VALUE;
        boolean radiantOpener = opener.actorSlot < 5;
        return cluster.signals.stream()
                .filter(signal -> signal.timeMs >= opener.timeMs && signal.actorSlot != null
                        && (signal.actorSlot < 5) != radiantOpener)
                .mapToLong(signal -> signal.timeMs)
                .min().orElse(Long.MAX_VALUE);
    }

    private JsonObject combatPhaseJson(String kind, long startMs, long endMs, String boundaryReason,
            Position battleCenter, CombatCluster cluster, Set<Integer> fightParticipants,
            List<DeathPoint> fightDeaths, List<DamagePoint> fightDamage, List<HealPoint> fightHeals,
            List<ControlPoint> fightControls, List<ActorEvent> reviewUsages) {
        long safeEndMs = Math.max(startMs, endMs);
        List<CombatSignal> phaseSignals = cluster.signals.stream()
                .filter(signal -> signal.timeMs >= startMs && signal.timeMs <= safeEndMs)
                .toList();
        List<DamagePoint> phaseDamage = fightDamage.stream()
                .filter(point -> point.stamp.gameTimeMs >= startMs && point.stamp.gameTimeMs <= safeEndMs)
                .toList();
        List<HealPoint> phaseHeals = fightHeals.stream()
                .filter(point -> point.stamp.gameTimeMs >= startMs && point.stamp.gameTimeMs <= safeEndMs)
                .toList();
        List<ControlPoint> phaseControls = fightControls.stream()
                .filter(point -> point.stamp.gameTimeMs >= startMs && point.stamp.gameTimeMs <= safeEndMs)
                .toList();
        List<DeathPoint> phaseDeaths = fightDeaths.stream()
                .filter(point -> point.stamp.gameTimeMs >= startMs && point.stamp.gameTimeMs <= safeEndMs)
                .toList();
        List<ActorEvent> phaseUsages = reviewUsages.stream()
                .filter(point -> point.stamp.gameTimeMs >= startMs && point.stamp.gameTimeMs <= safeEndMs)
                .toList();
        List<ObjectivePoint> phaseObjectives = objectives.stream()
                .filter(point -> point.stamp.gameTimeMs >= startMs && point.stamp.gameTimeMs <= safeEndMs)
                .toList();

        Set<Integer> participants = new LinkedHashSet<>();
        phaseSignals.forEach(signal -> {
            addCombatParticipant(participants, signal.actorSlot);
            addCombatParticipant(participants, signal.targetSlot);
        });
        phaseHeals.forEach(point -> {
            addCombatParticipant(participants, point.attackerSlot);
            addCombatParticipant(participants, point.targetSlot);
        });
        phaseUsages.forEach(point -> addCombatParticipant(participants, point.slot));
        phaseObjectives.forEach(point -> addCombatParticipant(participants, point.playerSlot));

        List<CombatSignal> locatedSignals = phaseSignals.stream()
                .filter(signal -> signal.position != null).toList();
        Position center = locatedSignals.isEmpty() ? battleCenter : weightedGeometricMedian(locatedSignals);
        int eventCount = phaseSignals.size() + phaseHeals.size() + phaseUsages.size()
                + phaseObjectives.size();
        JsonObject row = new JsonObject();
        row.addProperty("kind", kind);
        row.addProperty("start_ms", startMs);
        row.addProperty("end_ms", safeEndMs);
        row.addProperty("start", secondFloor(startMs));
        row.addProperty("end", secondCeil(safeEndMs));
        row.addProperty("duration_ms", Math.max(0, safeEndMs - startMs));
        row.addProperty("boundary_reason", boundaryReason);
        row.addProperty("method", "combat-phase-intensity-v1");
        row.addProperty("status", eventCount > 0 ? "observed" : "window_only");
        row.addProperty("location_confidence", locatedSignals.size() >= 2 ? 78
                : center == null ? 0 : 45);
        if (center != null) {
            addPosition(row, center);
            row.addProperty("region", regionCode(center));
        }
        JsonArray participantRows = new JsonArray();
        (participants.isEmpty() && kind.equals("conversion") ? fightParticipants : participants)
                .forEach(participantRows::add);
        row.add("participants", participantRows);
        JsonObject summary = new JsonObject();
        summary.addProperty("event_count", eventCount);
        summary.addProperty("damage", phaseDamage.stream().mapToInt(point -> point.value).sum());
        summary.addProperty("healing", phaseHeals.stream().mapToInt(point -> point.value).sum());
        summary.addProperty("control_seconds", round2(phaseControls.stream()
                .mapToDouble(point -> point.duration).sum()));
        summary.addProperty("ability_casts", phaseUsages.stream()
                .filter(point -> point.kind.equals("ability_use")).count());
        summary.addProperty("item_uses", phaseUsages.stream()
                .filter(point -> point.kind.equals("item_use")).count());
        summary.addProperty("deaths", phaseDeaths.size());
        summary.addProperty("objectives", phaseObjectives.size());
        row.add("summary", summary);
        return row;
    }

    private JsonObject buildCombatImportance(int duration, long contactStartMs, long contactEndMs,
            Position position, CombatClassification classification, List<DeathPoint> fightDeaths,
            List<TeleportResponse> teleportResponses) {
        long conversionEndMs = Math.min(duration * 1000L, contactEndMs + 30_000L);
        List<ObjectivePoint> conversions = objectives.stream()
                .filter(point -> point.stamp.gameTimeMs > contactEndMs
                        && point.stamp.gameTimeMs <= conversionEndMs)
                .toList();
        int radiantDeaths = (int) fightDeaths.stream()
                .filter(point -> point.targetSlot != null && point.targetSlot < 5).count();
        int direDeaths = fightDeaths.size() - radiantDeaths;
        Integer networthBefore = teamNetworthDifference(secondFloor(contactStartMs - 2_000L));
        Integer networthAfter = teamNetworthDifference(secondCeil(contactEndMs + 15_000L));
        int networthSwing = networthBefore == null || networthAfter == null
                ? 0 : Math.abs(networthAfter - networthBefore);
        boolean leadChanged = networthBefore != null && networthAfter != null
                && Integer.signum(networthBefore) != Integer.signum(networthAfter)
                && networthBefore != 0 && networthAfter != 0;

        int outcome = Math.min(30, fightDeaths.size() * 4
                + Math.abs(radiantDeaths - direDeaths) * 3
                + Math.min(12, networthSwing / 450)
                + (leadChanged ? 5 : 0));
        int objective = Math.min(25, conversions.stream().mapToInt(ProductAnalysis::objectiveImportance).sum());
        int commitment = Math.min(20, (int) Math.round(
                classification.features.activePlayers * 1.2
                        + classification.features.abilityCasts * 0.7
                        + classification.features.itemUses * 0.5
                        + classification.features.controlSeconds * 0.8
                        + classification.features.deaths * 1.5));
        long supports = teleportResponses.stream().filter(response -> response.support).count();
        long arrivals = teleportResponses.stream().filter(response -> response.completedNearBattle).count();
        int response = Math.min(10, (int) (supports * 4 + Math.max(0, arrivals - supports) * 2));
        String region = position == null ? "unknown" : regionCode(position);
        int strategic = 0;
        if (region.contains("base")) strategic += 8;
        if (region.contains("roshan") || conversions.stream().anyMatch(point -> point.kind.equals("roshan")
                || point.kind.equals("aegis"))) strategic += 8;
        if (conversions.stream().anyMatch(point -> point.kind.equals("building"))) strategic += 5;
        if (classification.intensity >= 80) strategic += 4;
        if (contactStartMs >= 20 * 60_000L) strategic += 2;
        strategic = Math.min(15, strategic);

        int score = Math.min(100, outcome + objective + commitment + response + strategic);
        String tier = score >= 70 ? "critical" : score >= 40 ? "important" : "routine";
        JsonArray reasons = new JsonArray();
        if (fightDeaths.size() >= 2) reasons.add("multi_hero_elimination");
        if (networthSwing >= 2_500) reasons.add("major_networth_swing");
        if (leadChanged) reasons.add("networth_lead_changed");
        if (!conversions.isEmpty()) reasons.add("objective_conversion");
        if (conversions.stream().anyMatch(point -> point.kind.equals("roshan") || point.kind.equals("aegis")))
            reasons.add("roshan_or_aegis_conversion");
        if (supports > 0) reasons.add("tp_support_commitment");
        if (region.contains("base")) reasons.add("base_fight");
        if (classification.intensity >= 80) reasons.add("high_intensity");
        if (reasons.isEmpty()) reasons.add("limited_strategic_impact");

        JsonObject row = new JsonObject();
        row.addProperty("score", score);
        row.addProperty("tier", tier);
        row.addProperty("important", score >= 40);
        row.addProperty("calibration", "provisional_uncalibrated");
        row.addProperty("model", "combat-importance-rules-v1");
        row.add("reasons", reasons);
        JsonObject components = new JsonObject();
        components.addProperty("outcome_swing", outcome);
        components.addProperty("objective_value", objective);
        components.addProperty("resource_commitment", commitment);
        components.addProperty("response_timing", response);
        components.addProperty("strategic_context", strategic);
        row.add("components", components);
        JsonObject facts = new JsonObject();
        addNullable(facts, "networth_diff_before", networthBefore);
        addNullable(facts, "networth_diff_after", networthAfter);
        facts.addProperty("networth_swing", networthSwing);
        facts.addProperty("lead_changed", leadChanged);
        facts.addProperty("radiant_deaths", radiantDeaths);
        facts.addProperty("dire_deaths", direDeaths);
        facts.addProperty("tp_supports", supports);
        facts.addProperty("conversion_objectives", conversions.size());
        row.add("facts", facts);
        return row;
    }

    private Integer teamNetworthDifference(int time) {
        int radiant = 0;
        int dire = 0;
        int observed = 0;
        for (int slot = 0; slot < 10; slot++) {
            Snapshot snapshot = snapshotAt(slot, time);
            if (snapshot == null || snapshot.networth == null) continue;
            if (slot < 5) radiant += snapshot.networth; else dire += snapshot.networth;
            observed++;
        }
        return observed < 6 ? null : radiant - dire;
    }

    private static int objectiveImportance(ObjectivePoint point) {
        if (point.kind.equals("roshan")) return 18;
        if (point.kind.equals("aegis")) return 14;
        if (point.kind.equals("courier")) return 2;
        String target = point.target == null ? "" : point.target;
        if (target.contains("rax")) return 16;
        if (target.contains("fort")) return 20;
        if (target.contains("tower")) return 8;
        return 4;
    }

    private static Position weightedGeometricMedian(List<CombatSignal> signals) {
        double totalWeight = signals.stream().mapToDouble(CombatSignal::locationWeight).sum();
        double x = signals.stream().mapToDouble(signal -> signal.position.x * signal.locationWeight()).sum()
                / Math.max(1.0, totalWeight);
        double y = signals.stream().mapToDouble(signal -> signal.position.y * signal.locationWeight()).sum()
                / Math.max(1.0, totalWeight);
        for (int iteration = 0; iteration < 10; iteration++) {
            double weightedX = 0;
            double weightedY = 0;
            double denominator = 0;
            for (CombatSignal signal : signals) {
                double delta = Math.max(0.15, Math.hypot(x - signal.position.x, y - signal.position.y));
                double weight = signal.locationWeight() / delta;
                weightedX += signal.position.x * weight;
                weightedY += signal.position.y * weight;
                denominator += weight;
            }
            if (denominator == 0) break;
            x = weightedX / denominator;
            y = weightedY / denominator;
        }
        return new Position((float) x, (float) y);
    }

    private Position combatPosition(int time, Integer attackerSlot, Integer targetSlot) {
        Position target = targetSlot == null ? null : positionOf(snapshotAt(targetSlot, time));
        if (target != null) return target;
        return attackerSlot == null ? null : positionOf(snapshotAt(attackerSlot, time));
    }

    private boolean combatEventMatches(Position center, double radius, int time, Integer actorSlot,
            Integer targetSlot, Set<Integer> participants) {
        boolean involved = actorSlot != null && participants.contains(actorSlot)
                || targetSlot != null && participants.contains(targetSlot);
        if (!involved) return false;
        Position eventPosition = combatPosition(time, actorSlot, targetSlot);
        return center == null || eventPosition == null || distance(center, eventPosition) <= radius;
    }

    private static boolean enemyHeroEvent(Integer attackerSlot, Integer targetSlot) {
        return attackerSlot != null && targetSlot != null && (attackerSlot < 5) != (targetSlot < 5);
    }

    private static Set<Integer> combatParticipants(List<DeathPoint> deaths, List<DamagePoint> damages,
            List<HealPoint> heals, List<ControlPoint> controls, List<ActorEvent> usages) {
        Set<Integer> active = new LinkedHashSet<>();
        deaths.forEach(point -> {
            addCombatParticipant(active, point.attackerSlot);
            addCombatParticipant(active, point.targetSlot);
        });
        damages.forEach(point -> {
            addCombatParticipant(active, point.attackerSlot);
            addCombatParticipant(active, point.targetSlot);
        });
        heals.forEach(point -> {
            addCombatParticipant(active, point.attackerSlot);
            addCombatParticipant(active, point.targetSlot);
        });
        controls.forEach(point -> {
            addCombatParticipant(active, point.attackerSlot);
            addCombatParticipant(active, point.targetSlot);
        });
        usages.forEach(point -> {
            addCombatParticipant(active, point.slot);
            addCombatParticipant(active, point.targetSlot);
        });
        List<Integer> sorted = new ArrayList<>(active);
        Collections.sort(sorted);
        return new LinkedHashSet<>(sorted);
    }

    private static void addCombatParticipant(Set<Integer> participants, Integer slot) {
        if (slot != null && slot >= 0 && slot < 10) participants.add(slot);
    }

    private Set<Integer> nearbyCombatSlots(Position center, int time, Set<Integer> participants) {
        Set<Integer> nearby = new LinkedHashSet<>();
        if (center == null) return nearby;
        for (int slot = 0; slot < 10; slot++) {
            if (participants.contains(slot)) continue;
            Position position = positionOf(snapshotAt(slot, time));
            if (position != null && distance(center, position) <= 13.5) nearby.add(slot);
        }
        return nearby;
    }

    private List<TeleportResponse> buildTeleportResponses(int reviewStart, int contactStart, int contactEnd,
            Position center, double attachRadius) {
        if (center == null) return List.of();
        List<TeleportResponse> responses = new ArrayList<>();
        usages.stream()
                .filter(event -> event.slot != null && event.kind.equals("item_use") && isTeleportKey(event.key))
                .filter(event -> event.time >= reviewStart && event.time <= contactEnd)
                .sorted((left, right) -> compareEventStamps(left.stamp, right.stamp))
                .forEach(event -> {
                    TeleportChannelEvidence channel = teleportChannelEvidence(event.slot, event.stamp);
                    EventStamp castStamp = channel.started == null ? event.stamp : channel.started.stamp;
                    int castTime = castStamp.gameSecond;
                    Snapshot originSnapshot = snapshotNear(event.slot, castTime - 1, 3);
                    Position origin = positionOf(originSnapshot);
                    TeleportLanding landing = channel.interrupted ? null
                            : findTeleportLanding(event.slot, castTime, origin);
                    Position landingPosition = landing == null ? null : landing.position;
                    double centerDistance = landingPosition == null ? Double.POSITIVE_INFINITY
                            : distance(landingPosition, center);
                    boolean completedNearBattle = landing != null
                            && centerDistance <= Math.max(17.0, attachRadius + 5.0);
                    Integer firstAction = completedNearBattle
                            ? firstCombatActionTime(event.slot, landing.time, contactEnd + 4)
                            : null;
                    Long firstActionMs = completedNearBattle
                            ? firstCombatActionTimeMs(event.slot, landing.timeMs, (contactEnd + 4L) * 1000L)
                            : null;
                    boolean support = completedNearBattle && firstAction != null;
                    String status = channel.interrupted ? "interrupted"
                            : landing == null && channel.completed ? "completed_landing_unobserved"
                            : landing == null && channel.started != null ? "channel_unresolved"
                            : landing == null ? "unconfirmed"
                            : !completedNearBattle ? "completed_elsewhere"
                            : support ? "completed_support" : "completed_nearby";
                    int localBefore = countNearbyTeam(event.slot, center, Math.max(reviewStart, castTime - 1),
                            Math.max(17.0, attachRadius + 5.0));
                    int localAfter = landing == null ? localBefore
                            : countNearbyTeam(event.slot, center, landing.time,
                                    Math.max(17.0, attachRadius + 5.0));
                    int enemyBefore = countNearbyEnemyTeam(event.slot, center,
                            Math.max(reviewStart, castTime - 1), Math.max(17.0, attachRadius + 5.0));
                    int enemyAfter = landing == null ? enemyBefore
                            : countNearbyEnemyTeam(event.slot, center, landing.time,
                                    Math.max(17.0, attachRadius + 5.0));
                    long responseDelayMs = Math.max(0, (firstActionMs == null
                            ? contactEnd * 1000L : firstActionMs) - contactStart * 1000L);
                    int enemyDeathsAfter = landing == null ? 0
                            : nearbyHeroDeaths(event.slot < 5 ? DIRE : RADIANT, center,
                                    landing.time, landing.time + 12, Math.max(17.0, attachRadius + 5.0));
                    int allyDeathsAfter = landing == null ? 0
                            : nearbyHeroDeaths(event.slot < 5 ? RADIANT : DIRE, center,
                                    landing.time, landing.time + 12, Math.max(17.0, attachRadius + 5.0));
                    int lowHealthAlliesSurvived = landing == null ? 0
                            : lowHealthAlliesSurvived(event.slot, center, castTime, landing.time + 10,
                                    Math.max(17.0, attachRadius + 5.0));
                    String outcome = !support ? "no_effect_confirmed"
                            : enemyDeathsAfter > 0 ? "counterkill_or_trade"
                            : lowHealthAlliesSurvived > 0 ? "save_or_stabilize"
                            : allyDeathsAfter > 0 ? "response_with_allied_losses"
                            : "stabilized_without_kill";
                    responses.add(new TeleportResponse(event.slot, event.key, castTime,
                            castStamp.gameTimeMs, landing == null ? null : landing.time,
                            landing == null ? null : landing.timeMs, origin, landingPosition,
                            landing == null ? 0 : landing.displacement, centerDistance, firstAction,
                            firstActionMs, (int) Math.ceil(responseDelayMs / 1000.0), responseDelayMs,
                            localBefore, localAfter, enemyBefore, enemyAfter, status,
                            completedNearBattle, support, channel.started != null,
                            channel.completed, channel.interrupted,
                            channel.started == null ? null : channel.started.expectedDuration,
                            channel.ended == null ? null : channel.ended.elapsedDuration,
                            enemyDeathsAfter, allyDeathsAfter, lowHealthAlliesSurvived, outcome));
                });
        for (int teamStart : List.of(0, 5)) {
            List<TeleportResponse> arrivals = responses.stream()
                    .filter(response -> response.slot >= teamStart && response.slot < teamStart + 5
                            && response.completedNearBattle)
                    .sorted(Comparator.comparingLong(response -> response.completedAtMs == null
                            ? Long.MAX_VALUE : response.completedAtMs))
                    .toList();
            for (int index = 0; index < arrivals.size(); index++) {
                arrivals.get(index).arrivalOrder = index + 1;
                arrivals.get(index).arrivalGroupSize = arrivals.size();
            }
        }
        return responses;
    }

    private TeleportChannelEvidence teleportChannelEvidence(int slot, EventStamp useStamp) {
        TeleportChannelPoint started = teleportChannels.stream()
                .filter(point -> !point.removed && point.slot != null && point.slot == slot
                        && Math.abs(point.stamp.gameTimeMs - useStamp.gameTimeMs) <= 350L)
                .min(Comparator.comparingLong(point -> Math.abs(point.stamp.gameTimeMs - useStamp.gameTimeMs)))
                .orElse(null);
        if (started == null) return new TeleportChannelEvidence(null, null, false, false);
        long deadline = started.stamp.gameTimeMs + Math.round(Math.max(1.0f, started.expectedDuration) * 1000L) + 1500L;
        TeleportChannelPoint ended = teleportChannels.stream()
                .filter(point -> point.removed && point.slot != null && point.slot == slot
                        && point.stamp.gameTimeMs >= started.stamp.gameTimeMs
                        && point.stamp.gameTimeMs <= deadline)
                .min((left, right) -> compareEventStamps(left.stamp, right.stamp))
                .orElse(null);
        boolean completed = ended != null
                && ended.elapsedDuration + 0.15f >= Math.max(started.expectedDuration, ended.expectedDuration);
        boolean interrupted = ended != null && !completed;
        return new TeleportChannelEvidence(started, ended, completed, interrupted);
    }

    private Snapshot snapshotNear(int slot, int time, int maxGap) {
        NavigableMap<Integer, Snapshot> rows = snapshots.get(slot);
        if (rows == null || rows.isEmpty()) return null;
        Map.Entry<Integer, Snapshot> floor = rows.floorEntry(time);
        Map.Entry<Integer, Snapshot> ceiling = rows.ceilingEntry(time);
        Map.Entry<Integer, Snapshot> nearest = floor == null ? ceiling : ceiling == null ? floor
                : time - floor.getKey() <= ceiling.getKey() - time ? floor : ceiling;
        return nearest != null && Math.abs(nearest.getKey() - time) <= maxGap ? nearest.getValue() : null;
    }

    private TeleportLanding findTeleportLanding(int slot, int castTime, Position origin) {
        if (origin == null) return null;
        NavigableMap<Integer, Snapshot> rows = snapshots.get(slot);
        if (rows == null || rows.isEmpty()) return null;
        for (Snapshot snapshot : rows.subMap(castTime + 2, true, castTime + 8, true).values()) {
            if (snapshot.lifeState != null && snapshot.lifeState != 0) continue;
            Position candidate = positionOf(snapshot);
            if (candidate == null) continue;
            double displacement = distance(origin, candidate);
            if (displacement >= 6.0) return new TeleportLanding(snapshot.time,
                    snapshot.stamp.gameTimeMs, candidate, displacement);
        }
        return null;
    }

    private Integer firstCombatActionTime(int slot, int start, int end) {
        int first = Integer.MAX_VALUE;
        for (DamagePoint point : damages) {
            if (point.time >= start && point.time <= end
                    && (point.attackerSlot != null && point.attackerSlot == slot
                            || point.targetSlot != null && point.targetSlot == slot)) first = Math.min(first, point.time);
        }
        for (ControlPoint point : controls) {
            if (point.time >= start && point.time <= end
                    && (point.attackerSlot != null && point.attackerSlot == slot
                            || point.targetSlot != null && point.targetSlot == slot)) first = Math.min(first, point.time);
        }
        for (HealPoint point : heals) {
            if (point.time >= start && point.time <= end
                    && (point.attackerSlot != null && point.attackerSlot == slot
                            || point.targetSlot != null && point.targetSlot == slot)) first = Math.min(first, point.time);
        }
        for (DeathPoint point : deaths) {
            if (point.time >= start && point.time <= end
                    && (point.attackerSlot != null && point.attackerSlot == slot
                            || point.targetSlot != null && point.targetSlot == slot)) first = Math.min(first, point.time);
        }
        for (ActorEvent event : usages) {
            if (event.time >= start && event.time <= end && event.slot != null && event.slot == slot
                    && !isTeleportKey(event.key)) first = Math.min(first, event.time);
        }
        return first == Integer.MAX_VALUE ? null : first;
    }

    private Long firstCombatActionTimeMs(int slot, long startMs, long endMs) {
        long first = Long.MAX_VALUE;
        for (DamagePoint point : damages) {
            if (point.stamp.gameTimeMs >= startMs && point.stamp.gameTimeMs <= endMs
                    && (point.attackerSlot != null && point.attackerSlot == slot
                            || point.targetSlot != null && point.targetSlot == slot))
                first = Math.min(first, point.stamp.gameTimeMs);
        }
        for (ControlPoint point : controls) {
            if (point.stamp.gameTimeMs >= startMs && point.stamp.gameTimeMs <= endMs
                    && (point.attackerSlot != null && point.attackerSlot == slot
                            || point.targetSlot != null && point.targetSlot == slot))
                first = Math.min(first, point.stamp.gameTimeMs);
        }
        for (HealPoint point : heals) {
            if (point.stamp.gameTimeMs >= startMs && point.stamp.gameTimeMs <= endMs
                    && (point.attackerSlot != null && point.attackerSlot == slot
                            || point.targetSlot != null && point.targetSlot == slot))
                first = Math.min(first, point.stamp.gameTimeMs);
        }
        for (DeathPoint point : deaths) {
            if (point.stamp.gameTimeMs >= startMs && point.stamp.gameTimeMs <= endMs
                    && (point.attackerSlot != null && point.attackerSlot == slot
                            || point.targetSlot != null && point.targetSlot == slot))
                first = Math.min(first, point.stamp.gameTimeMs);
        }
        for (ActorEvent event : usages) {
            if (event.stamp.gameTimeMs >= startMs && event.stamp.gameTimeMs <= endMs
                    && event.slot != null && event.slot == slot && !isTeleportKey(event.key))
                first = Math.min(first, event.stamp.gameTimeMs);
        }
        return first == Long.MAX_VALUE ? null : first;
    }

    private int countNearbyTeam(int slot, Position center, int time, double radius) {
        int teamStart = slot < 5 ? 0 : 5;
        int count = 0;
        for (int candidate = teamStart; candidate < teamStart + 5; candidate++) {
            Snapshot snapshot = snapshotNear(candidate, time, 3);
            if (snapshot == null || snapshot.lifeState != null && snapshot.lifeState != 0) continue;
            Position position = positionOf(snapshot);
            if (position != null && distance(position, center) <= radius) count++;
        }
        return count;
    }

    private int countNearbyEnemyTeam(int slot, Position center, int time, double radius) {
        int teamStart = slot < 5 ? 5 : 0;
        int count = 0;
        for (int candidate = teamStart; candidate < teamStart + 5; candidate++) {
            Snapshot snapshot = snapshotNear(candidate, time, 3);
            if (snapshot == null || snapshot.lifeState != null && snapshot.lifeState != 0) continue;
            Position position = positionOf(snapshot);
            if (position != null && distance(position, center) <= radius) count++;
        }
        return count;
    }

    private int nearbyHeroDeaths(int team, Position center, int start, int end, double radius) {
        return (int) deaths.stream().filter(death -> death.targetHero && death.targetSlot != null
                && teamForSlot(death.targetSlot) == team && death.time >= start && death.time <= end)
                .filter(death -> {
                    Position position = positionOf(snapshotNear(death.targetSlot, death.time, 3));
                    return position != null && distance(position, center) <= radius;
                }).count();
    }

    private int lowHealthAlliesSurvived(int slot, Position center, int before, int after, double radius) {
        int teamStart = slot < 5 ? 0 : 5;
        int count = 0;
        for (int candidate = teamStart; candidate < teamStart + 5; candidate++) {
            if (candidate == slot) continue;
            final int candidateSlot = candidate;
            Snapshot start = snapshotNear(candidate, before, 3);
            Snapshot end = snapshotNear(candidate, after, 3);
            Position position = positionOf(start);
            if (start == null || end == null || start.hp == null || start.maxHp == null || start.maxHp <= 0
                    || start.hp / start.maxHp > 0.35f || position == null || distance(position, center) > radius
                    || end.lifeState != null && end.lifeState != 0) continue;
            boolean died = deaths.stream().anyMatch(death -> death.targetSlot != null
                    && death.targetSlot == candidateSlot && death.time >= before && death.time <= after);
            if (!died) count++;
        }
        return count;
    }

    private static int teamForSlot(int slot) {
        return slot < 5 ? RADIANT : DIRE;
    }

    private JsonObject teleportResponseJson(TeleportResponse response) {
        JsonObject row = new JsonObject();
        row.addProperty("kind", response.support ? "tp_support" : "tp_arrival");
        row.addProperty("key", response.key);
        row.addProperty("cast_start", response.castStart);
        row.addProperty("cast_start_ms", response.castStartMs);
        addNullable(row, "completed_at", response.completedAt);
        addNullable(row, "completed_at_ms", response.completedAtMs);
        row.addProperty("actor_slot", response.slot);
        row.addProperty("status", response.status);
        row.addProperty("completed_near_battle", response.completedNearBattle);
        row.addProperty("support", response.support);
        row.addProperty("displacement_pct", round2(response.displacement));
        if (Double.isFinite(response.centerDistance)) {
            row.addProperty("battle_center_distance_pct", round2(response.centerDistance));
        }
        addNullable(row, "first_action", response.firstAction);
        addNullable(row, "first_action_ms", response.firstActionMs);
        row.addProperty("response_delay", response.responseDelay);
        row.addProperty("response_delay_ms", response.responseDelayMs);
        row.addProperty("local_allies_before", response.localAlliesBefore);
        row.addProperty("local_allies_after", response.localAlliesAfter);
        row.addProperty("local_enemies_before", response.localEnemiesBefore);
        row.addProperty("local_enemies_after", response.localEnemiesAfter);
        row.addProperty("arrival_order", response.arrivalOrder);
        row.addProperty("arrival_group_size", response.arrivalGroupSize);
        row.addProperty("channel_observed", response.channelObserved);
        row.addProperty("channel_completed", response.channelCompleted);
        row.addProperty("channel_interrupted", response.channelInterrupted);
        addNullable(row, "channel_expected_seconds", response.channelExpectedSeconds);
        addNullable(row, "channel_elapsed_seconds", response.channelElapsedSeconds);
        row.addProperty("enemy_deaths_after", response.enemyDeathsAfter);
        row.addProperty("ally_deaths_after", response.allyDeathsAfter);
        row.addProperty("low_health_allies_survived", response.lowHealthAlliesSurvived);
        row.addProperty("outcome", response.outcome);
        row.addProperty("opportunity_cost_status", "not_scored_missing_lane_and_camp_state");
        row.addProperty("evidence", response.channelObserved ? "fact_channel_derived_landing" : "derived");
        if (response.origin != null) {
            JsonObject origin = new JsonObject();
            addPosition(origin, response.origin);
            row.add("origin", origin);
        }
        if (response.landing != null) addPosition(row, response.landing);
        return row;
    }

    private JsonObject teleportTimelineJson(TeleportResponse response) {
        JsonObject row = new JsonObject();
        row.addProperty("time", response.completedAt == null ? response.castStart : response.completedAt);
        row.addProperty("game_time_ms", response.completedAtMs == null
                ? response.castStartMs : response.completedAtMs);
        row.addProperty("game_second", secondFloor(response.completedAtMs == null
                ? response.castStartMs : response.completedAtMs));
        row.addProperty("time_source", "derived");
        row.addProperty("kind", response.support ? "tp_support" : "tp_arrival");
        row.addProperty("key", response.key);
        row.addProperty("actor_slot", response.slot);
        row.addProperty("value", response.responseDelay);
        row.addProperty("category", "combat");
        row.addProperty("evidence", "derived");
        row.addProperty("status", response.status);
        return row;
    }

    private static boolean isTeleportKey(String key) {
        return key != null && (key.equals("tpscroll") || key.equals("travel_boots")
                || key.equals("travel_boots_2"));
    }

    private static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private static int secondFloor(long gameTimeMs) {
        return (int) Math.floorDiv(gameTimeMs, 1000L);
    }

    private static int secondCeil(long gameTimeMs) {
        return (int) Math.ceil(gameTimeMs / 1000.0);
    }

    private CombatClassification classifyCombat(CombatCluster cluster, Set<Integer> participants,
            List<DeathPoint> group, List<DamagePoint> fightDamage, List<ControlPoint> fightControls,
            List<ActorEvent> fightUsages, Position position, double scatterRadius,
            List<TeleportResponse> teleportResponses) {
        int radiant = (int) participants.stream().filter(slot -> slot < 5).count();
        int dire = participants.size() - radiant;
        int active = radiant + dire;
        int deaths = group.size();
        int damage = fightDamage.stream().mapToInt(point -> point.value).sum();
        double control = fightControls.stream().mapToDouble(point -> point.duration).sum();
        int abilityCasts = (int) fightUsages.stream().filter(event -> event.kind.equals("ability_use")).count();
        int itemUses = (int) fightUsages.stream()
                .filter(event -> event.kind.equals("item_use") && !isTeleportKey(event.key)).count();
        int casts = abilityCasts + itemUses;
        int activeDuration = Math.max(1,
                (int) Math.ceil((cluster.lastTimeMs() - cluster.firstTimeMs()) / 1000.0));
        int intensity = (int) Math.round(Math.min(100,
                Math.min(40, damage / 55.0) + Math.min(30, deaths * 15.0)
                        + Math.min(15, control * 3.0) + Math.min(12, casts * 1.5)
                        + Math.min(8, activeDuration / 2.0)));
        int radiantDamage = fightDamage.stream()
                .filter(point -> point.attackerSlot != null && point.attackerSlot < 5)
                .mapToInt(point -> point.value).sum();
        int direDamage = damage - radiantDamage;
        double reciprocity = Math.min(radiantDamage, direDamage)
                / (double) Math.max(1, Math.max(radiantDamage, direDamage));
        Map<Integer, Integer> damageByTarget = new HashMap<>();
        fightDamage.stream().filter(point -> point.targetSlot != null)
                .forEach(point -> damageByTarget.merge(point.targetSlot, point.value, Integer::sum));
        int focusedDamage = damageByTarget.values().stream().mapToInt(Integer::intValue).max().orElse(0);
        double targetConcentration = focusedDamage / (double) Math.max(1, damage);
        Set<String> interactionEdges = new HashSet<>();
        fightDamage.forEach(point -> addInteractionEdge(interactionEdges, point.attackerSlot, point.targetSlot));
        fightControls.forEach(point -> addInteractionEdge(interactionEdges, point.attackerSlot, point.targetSlot));
        double graphDensity = interactionEdges.size() / (double) Math.max(1, radiant * dire * 2);
        double hpPool = participants.stream().map(slot -> snapshotAt(slot, secondFloor(cluster.firstTimeMs())))
                .filter(snapshot -> snapshot != null && snapshot.maxHp != null && snapshot.maxHp > 0)
                .mapToDouble(snapshot -> snapshot.maxHp).sum();
        double damageHpRatio = hpPool > 0 ? damage / hpPool : 0;
        double balance = Math.min(radiant, dire) / (double) Math.max(1, Math.max(radiant, dire));
        boolean reciprocal = radiantDamage > 0 && direDamage > 0;
        boolean laneContext = position != null && !laneForPosition(position).equals("other");
        boolean exactTwoVsTwo = radiant == 2 && dire == 2;
        boolean exactTwoVsThree = Math.min(radiant, dire) == 2 && Math.max(radiant, dire) == 3;
        boolean teamfightParticipantGate = radiant >= 3 && dire >= 3;
        boolean standardDurationGate = activeDuration >= 5;
        int highCommitmentEvidence = (damage >= 2400 ? 1 : 0) + (casts >= 8 ? 1 : 0)
                + (damageHpRatio >= 0.7 ? 1 : 0) + (control >= 5.0 ? 1 : 0);
        int teamfightEvidence = (deaths >= 2 ? 1 : 0) + (damage >= 2400 ? 1 : 0)
                + (casts >= 8 ? 1 : 0) + (active >= 7 ? 1 : 0)
                + (damageHpRatio >= 0.7 ? 1 : 0) + (graphDensity >= 0.32 ? 1 : 0);
        int burstEvidence = (damageHpRatio >= 0.55 ? 1 : 0) + (reciprocity >= 0.18 ? 1 : 0)
                + (graphDensity >= 0.28 ? 1 : 0) + (casts >= 6 || control >= 2.0 ? 1 : 0);
        boolean burstOverride = teamfightParticipantGate && activeDuration >= 2 && activeDuration < 5
                && deaths >= 2 && burstEvidence >= 2 && (reciprocity >= 0.18 || graphDensity >= 0.28);
        boolean commitmentGate = deaths == 0
                ? teamfightEvidence >= 3 && highCommitmentEvidence >= 2
                : teamfightEvidence >= 2 && highCommitmentEvidence >= 1;
        boolean teamfightGate = teamfightParticipantGate && (standardDurationGate || burstOverride)
                && intensity >= 60 && commitmentGate;
        boolean highNoDeathSkirmish = deaths == 0 && active >= 4 && radiant >= 2 && dire >= 2
                && intensity >= 50 && (damage >= 1600 || damageHpRatio >= 0.45 || control >= 2.0);
        Integer firstVictim = group.stream().map(point -> point.targetSlot).filter(slot -> slot != null).findFirst()
                .orElse(null);
        int victimSideActive = firstVictim == null ? 0 : firstVictim < 5 ? radiant : dire;
        int attackingSideActive = firstVictim == null ? 0 : firstVictim < 5 ? dire : radiant;
        boolean gank = deaths > 0 && victimSideActive == 1 && attackingSideActive >= 2
                && targetConcentration >= 0.5;
        boolean soloKill = deaths > 0 && radiant == 1 && dire == 1;
        long tpSupports = teleportResponses.stream().filter(response -> response.support).count();
        boolean tpArrival = teleportResponses.stream().anyMatch(response -> response.completedNearBattle
                && !response.support);

        Map<String, Integer> scores = new LinkedHashMap<>();
        scores.put("harass", combatScore(deaths == 0
                ? 48 + (1 - reciprocity) * 28 + (active <= 3 ? 10 : 0) - Math.min(18, intensity * 0.15)
                : 4));
        scores.put("lane_trade", combatScore(deaths == 0 && laneContext
                ? 45 + reciprocity * 42 + (active <= 4 ? 8 : 0) - Math.max(0, intensity - 65) * 0.3
                : 2));
        scores.put("pickoff", combatScore(deaths > 0
                ? 32 + targetConcentration * 34 + (gank ? 20 : 0) + (soloKill ? 15 : 0)
                        - Math.max(0, active - 4) * 7
                : 1));
        scores.put("skirmish", combatScore(18 + active * 6 + balance * 20 + Math.min(22, intensity * 0.24)
                + (exactTwoVsTwo || exactTwoVsThree ? 20 : 0) - (active >= 7 ? 12 : 0)));
        scores.put("teamfight", combatScore(teamfightParticipantGate
                ? 12 + active * 6 + balance * 18 + Math.min(25, intensity * 0.25) + teamfightEvidence * 5
                : 1));

        String kind;
        List<String> reasons = new ArrayList<>();
        if (teamfightGate) {
            kind = "teamfight";
            reasons.add(burstOverride ? "burst_teamfight_override" : "teamfight_gate_passed");
        } else if (deaths == 0) {
            if (highNoDeathSkirmish) {
                kind = "skirmish";
                reasons.add("high_commitment_no_death");
            } else if (laneContext && reciprocal && reciprocity >= 0.2) {
                kind = "lane_trade";
                reasons.add("lane_reciprocal_trade");
            } else {
                kind = "harass";
                reasons.add(laneContext ? "low_commitment_lane_harass" : "non_lane_poke");
            }
            if (exactTwoVsThree) reasons.add("two_vs_three_cap");
        } else if (exactTwoVsTwo) {
            kind = "skirmish";
            reasons.add("two_vs_two_cap");
        } else if (deaths == 1 && (gank || active <= 3 || targetConcentration >= 0.68)) {
            kind = "pickoff";
            reasons.add(gank ? "isolated_target_gank" : soloKill ? "solo_kill" : "focused_kill");
        } else if (exactTwoVsThree) {
            kind = "skirmish";
            reasons.add("two_vs_three_cap");
        } else {
            kind = "skirmish";
            reasons.add(teamfightParticipantGate ? "teamfight_gate_not_met"
                    : "insufficient_teamfight_participants");
        }

        List<String> tags = new ArrayList<>();
        if (laneContext) tags.add("lane_context");
        if (gank) tags.add("gank");
        if (soloKill) tags.add("solo_kill");
        if (tpSupports > 0) tags.add("tp_support");
        else if (tpArrival) tags.add("tp_arrival");
        if (activeDuration >= 18 && scatterRadius >= 6.0) tags.add("chase");
        if (intensity >= 80) tags.add("high_intensity");
        if (deaths == 0) tags.add("no_casualty");
        if (exactTwoVsThree) tags.add("small_scale_2v3");
        if (burstOverride) tags.add("burst_resolution");

        int chosenScore = scores.getOrDefault(kind, 0);
        int secondScore = scores.entrySet().stream().filter(entry -> !entry.getKey().equals(kind))
                .mapToInt(Map.Entry::getValue).max().orElse(0);
        int evidenceBonus = (position == null ? 0 : 5) + (hpPool > 0 ? 4 : 0)
                + (interactionEdges.size() >= 2 ? 4 : 0) + (damage > 0 ? 4 : 0);
        int confidence = Math.max(38, Math.min(96,
                40 + (chosenScore - secondScore) / 2 + evidenceBonus));
        if (exactTwoVsTwo) confidence = Math.max(confidence, 90);
        if (exactTwoVsThree && !kind.equals("pickoff")) confidence = Math.max(confidence, 88);
        if (teamfightGate) {
            int gateStrength = 68 + Math.max(0, active - 6) * 3
                    + Math.max(0, teamfightEvidence - 2) * 3 + Math.max(0, intensity - 60) / 5;
            confidence = Math.max(confidence, Math.min(94, gateStrength));
        }

        CombatFeatures features = new CombatFeatures(active, radiant, dire, activeDuration, deaths, damage,
                damageHpRatio, reciprocity, targetConcentration, graphDensity, interactionEdges.size(),
                abilityCasts, itemUses, control, laneContext, (int) tpSupports,
                teamfightParticipantGate, standardDurationGate, burstOverride,
                teamfightEvidence, highCommitmentEvidence);
        return new CombatClassification(kind, intensity, radiant, dire, activeDuration, confidence,
                scores, tags, reasons, features);
    }

    private static void addInteractionEdge(Set<String> edges, Integer actorSlot, Integer targetSlot) {
        if (actorSlot != null && targetSlot != null) edges.add(actorSlot + ">" + targetSlot);
    }

    private static int combatScore(double value) {
        return (int) Math.round(Math.max(0, Math.min(100, value)));
    }

    private JsonArray buildFightEvents(List<DeathPoint> group, List<DamagePoint> fightDamage,
            List<HealPoint> fightHeals, List<ControlPoint> fightControls, List<ActorEvent> fightUsages,
            List<TeleportResponse> teleportResponses) {
        List<JsonObject> rows = new ArrayList<>();
        fightDamage.stream()
                .filter(damage -> damage.value >= 120)
                .sorted(Comparator.comparingInt((DamagePoint damage) -> damage.value).reversed())
                .limit(32)
                .forEach(damage -> rows.add(damage.toTimelineJson()));
        fightUsages.stream()
                .limit(60)
                .forEach(event -> rows.add(event.toTimelineJson()));
        fightControls.stream().limit(40).forEach(control -> rows.add(control.toTimelineJson()));
        fightHeals.stream()
                .filter(heal -> heal.value >= 40)
                .sorted(Comparator.comparingInt((HealPoint heal) -> heal.value).reversed())
                .limit(24)
                .forEach(heal -> rows.add(heal.toTimelineJson()));
        teleportResponses.stream().filter(response -> response.completedNearBattle)
                .forEach(response -> rows.add(teleportTimelineJson(response)));
        group.forEach(death -> rows.add(death.toTimelineJson()));
        rows.sort(ProductAnalysis::compareTimelineRows);
        return toArray(rows);
    }

    private JsonObject buildFightVision(int start, int end, Position position, List<DamagePoint> fightDamage,
            List<JsonObject> wardRows) {
        JsonObject vision = new JsonObject();
        vision.add("radiant", fightVisionForTeam("radiant", RADIANT, start, end, position, fightDamage, wardRows));
        vision.add("dire", fightVisionForTeam("dire", DIRE, start, end, position, fightDamage, wardRows));
        int radiantVisibility = intValue(vision.getAsJsonObject("radiant"), "combat_log_visibility_pct", 0);
        int direVisibility = intValue(vision.getAsJsonObject("dire"), "combat_log_visibility_pct", 0);
        vision.addProperty("advantage", radiantVisibility == direVisibility ? "even"
                : radiantVisibility > direVisibility ? "radiant" : "dire");
        vision.addProperty("evidence", "combat_log_plus_ward_geometry");
        return vision;
    }

    private JsonObject fightVisionForTeam(String teamName, int team, int start, int end, Position position,
            List<DamagePoint> fightDamage, List<JsonObject> wardRows) {
        int visibleEvents = (int) fightDamage.stream()
                .filter(damage -> team == RADIANT ? damage.visibleRadiant : damage.visibleDire)
                .count();
        int visibilityPct = fightDamage.isEmpty() ? 0
                : (int) Math.round(visibleEvents * 100.0 / fightDamage.size());
        List<JsonObject> nearby = wardRows.stream()
                .filter(ward -> teamName.equals(stringValue(ward, "team"))
                        && intValue(ward, "placedAt", 0) <= end && intValue(ward, "endedAt", 0) >= start
                        && wardDistance(position, ward) <= 16.0)
                .toList();
        int observer = (int) nearby.stream().filter(ward -> "observer".equals(stringValue(ward, "type"))).count();
        int sentry = (int) nearby.stream().filter(ward -> "sentry".equals(stringValue(ward, "type"))).count();
        int setupObserver = (int) nearby.stream().filter(ward -> "observer".equals(stringValue(ward, "type"))
                && intValue(ward, "placedAt", 0) >= start - 90).count();
        int setupSentry = (int) nearby.stream().filter(ward -> "sentry".equals(stringValue(ward, "type"))
                && intValue(ward, "placedAt", 0) >= start - 90).count();
        boolean observerCoverage = nearby.stream().anyMatch(ward -> "observer".equals(stringValue(ward, "type"))
                && wardCovers(position, ward));
        boolean sentryCoverage = nearby.stream().anyMatch(ward -> "sentry".equals(stringValue(ward, "type"))
                && wardCovers(position, ward));
        JsonObject row = new JsonObject();
        row.addProperty("combat_log_visibility_pct", visibilityPct);
        row.addProperty("visible_damage_events", visibleEvents);
        row.addProperty("damage_events", fightDamage.size());
        row.addProperty("nearby_observers", observer);
        row.addProperty("nearby_sentries", sentry);
        row.addProperty("setup_observers", setupObserver);
        row.addProperty("setup_sentries", setupSentry);
        row.addProperty("observer_coverage", observerCoverage);
        row.addProperty("sentry_coverage", sentryCoverage);
        JsonArray wardIds = new JsonArray();
        nearby.forEach(ward -> wardIds.add(stringValue(ward, "id")));
        row.add("ward_ids", wardIds);
        row.addProperty("evidence", "mixed");
        return row;
    }

    private JsonArray buildFightContributions(int duration, int start, int end, Position position,
            Set<Integer> participants, List<DeathPoint> group, List<DamagePoint> fightDamage,
            List<HealPoint> fightHeals, List<ControlPoint> fightControls, List<ActorEvent> fightUsages,
            List<JsonObject> wardRows, Map<Integer, LaneAssignment> laneAssignments) {
        JsonArray rows = new JsonArray();
        Set<Integer> killedSlots = new HashSet<>();
        group.stream().filter(death -> death.targetSlot != null).forEach(death -> killedSlots.add(death.targetSlot));
        for (int slot : participants.stream().sorted().toList()) {
            LaneAssignment assignment = laneAssignments.get(slot);
            int playerPosition = assignment == null ? slot % 5 + 1 : assignment.position;
            int roleConfidence = assignment == null ? 0 : (int) Math.round(assignment.confidence * 100);
            String role = "position_" + playerPosition;
            String roleGroup = playerPosition <= 3 ? "core" : "support";
            int damage = fightDamage.stream()
                    .filter(point -> point.attackerSlot != null && point.attackerSlot == slot)
                    .mapToInt(point -> point.value).sum();
            int teamDamage = fightDamage.stream()
                    .filter(point -> point.attackerSlot != null && (point.attackerSlot < 5) == (slot < 5))
                    .mapToInt(point -> point.value).sum();
            int damageTaken = fightDamage.stream()
                    .filter(point -> point.targetSlot != null && point.targetSlot == slot)
                    .mapToInt(point -> point.value).sum();
            int teamDamageTaken = fightDamage.stream()
                    .filter(point -> point.targetSlot != null && (point.targetSlot < 5) == (slot < 5))
                    .mapToInt(point -> point.value).sum();
            int damageToKills = fightDamage.stream()
                    .filter(point -> point.attackerSlot != null && point.attackerSlot == slot
                            && point.targetSlot != null && killedSlots.contains(point.targetSlot))
                    .mapToInt(point -> point.value).sum();
            int abilityCasts = (int) fightUsages.stream()
                    .filter(event -> event.slot == slot && event.kind.equals("ability_use")).count();
            int itemUses = (int) fightUsages.stream()
                    .filter(event -> event.slot == slot && event.kind.equals("item_use")).count();
            double controlSeconds = fightControls.stream()
                    .filter(point -> point.attackerSlot != null && point.attackerSlot == slot)
                    .mapToDouble(point -> point.duration).sum();
            int healing = fightHeals.stream()
                    .filter(point -> point.attackerSlot != null && point.attackerSlot == slot)
                    .mapToInt(point -> point.value).sum();
            int kills = (int) group.stream().filter(death -> death.attackerSlot != null && death.attackerSlot == slot).count();
            int playerDeaths = (int) group.stream().filter(death -> death.targetSlot != null && death.targetSlot == slot).count();
            int presencePct = fightPresencePercent(slot, start, end, position);
            int arrivalDelay = fightArrivalDelay(slot, start, end, group, fightDamage, fightHeals, fightControls, fightUsages);
            int setupObserver = wardSetupCount(slot, "observer", start, end, position, wardRows);
            int setupSentry = wardSetupCount(slot, "sentry", start, end, position, wardRows);
            ResponsibilityGate responsibilityGate = buildResponsibilityGate(slot, start, end);
            boolean spellJudgmentAllowed = responsibilityGate.status.equals("passed")
                    && responsibilityGate.opportunitySeconds >= 2;
            boolean sentryCheckRequired = sentryCheckRequired(position);
            double damageShare = teamDamage == 0 ? 0 : damage / (double) teamDamage;
            double damageTakenShare = teamDamageTaken == 0 ? 0 : damageTaken / (double) teamDamageTaken;
            double conversionShare = damage == 0 ? 0 : damageToKills / (double) damage;
            int score;
            List<String> issues = new ArrayList<>();
            score = switch (playerPosition) {
                case 1 -> (int) Math.round(24 + Math.min(38, damageShare * 100)
                        + Math.min(12, conversionShare * 14) + Math.min(10, abilityCasts * 2.5)
                        + presencePct * 0.14 - playerDeaths * 7);
                case 2 -> (int) Math.round(24 + Math.min(34, damageShare * 100)
                        + Math.min(14, abilityCasts * 3) + Math.min(10, controlSeconds * 2)
                        + Math.max(0, 10 - arrivalDelay * 2) + presencePct * 0.12 - playerDeaths * 6);
                case 3 -> (int) Math.round(24 + Math.min(24, damageShare * 100)
                        + Math.min(18, damageTakenShare * 100) + Math.min(18, controlSeconds * 3)
                        + Math.min(8, abilityCasts * 2) + presencePct * 0.12 - playerDeaths * 4);
                case 4 -> (int) Math.round(26 + Math.min(20, abilityCasts * 4)
                        + Math.min(20, controlSeconds * 3) + Math.min(10, healing / 220.0)
                        + Math.min(10, (setupObserver + setupSentry) * 5)
                        + Math.min(8, itemUses * 2) + presencePct * 0.10 - playerDeaths * 5);
                default -> (int) Math.round(26 + Math.min(18, abilityCasts * 4)
                        + Math.min(18, controlSeconds * 3) + Math.min(16, healing / 180.0)
                        + Math.min(12, (setupObserver + setupSentry) * 6)
                        + Math.min(8, itemUses * 2) + presencePct * 0.10 - playerDeaths * 5);
            };
            if (abilityCasts == 0 && spellJudgmentAllowed) {
                issues.add(playerPosition <= 3 ? "no_spell_output" : "no_spell_cast");
            }
            if (roleConfidence >= 65) {
                switch (playerPosition) {
                    case 1 -> {
                        if (damageShare < 0.18 && spellJudgmentAllowed) issues.add("low_carry_damage_share");
                        if (!killedSlots.isEmpty() && damageToKills == 0) issues.add("no_kill_conversion");
                    }
                    case 2 -> {
                        if (damageShare < 0.16 && spellJudgmentAllowed) issues.add("low_mid_combat_output");
                        if (arrivalDelay > 4) issues.add("late_tempo_arrival");
                    }
                    case 3 -> {
                        if (controlSeconds == 0 && damageTakenShare < 0.12 && spellJudgmentAllowed) {
                            issues.add("low_initiation_or_frontline_value");
                        }
                    }
                    case 4 -> {
                        if (controlSeconds == 0 && healing == 0 && damageShare < 0.06 && spellJudgmentAllowed) {
                            issues.add("low_roamer_utility_output");
                        }
                    }
                    default -> {
                        if (controlSeconds == 0 && healing == 0 && itemUses == 0 && spellJudgmentAllowed) {
                            issues.add("low_save_or_control_output");
                        }
                    }
                }
                if (playerPosition >= 4 && sentryCheckRequired && setupSentry == 0 && presencePct >= 45) {
                    issues.add("no_sentry_setup");
                }
                if (presencePct < 35 && arrivalDelay > 4) issues.add("late_or_absent");
            }
            score = Math.max(0, Math.min(100, score));
            int evidenceCount = abilityCasts + itemUses + (int) Math.ceil(controlSeconds) + (damage > 0 ? 2 : 0)
                    + (healing > 0 ? 1 : 0);
            int confidence = responsibilityGate.status.equals("insufficient_evidence")
                    ? Math.min(62, 42 + evidenceCount * 2)
                    : Math.min(94, 58 + evidenceCount * 3 + (presencePct > 0 ? 8 : 0));

            JsonObject row = new JsonObject();
            row.addProperty("slot", slot);
            row.addProperty("role", role);
            row.addProperty("role_group", roleGroup);
            row.addProperty("position", playerPosition);
            row.addProperty("role_confidence", roleConfidence);
            row.addProperty("responsibility_model", "position-responsibility/1.0");
            row.addProperty("damage", damage);
            row.addProperty("damageTaken", damageTaken);
            row.addProperty("teamDamageShare", Math.round(damageShare * 1000) / 10.0);
            row.addProperty("teamDamageTakenShare", Math.round(damageTakenShare * 1000) / 10.0);
            row.addProperty("damageToKills", damageToKills);
            row.addProperty("killConversion", Math.round(conversionShare * 1000) / 10.0);
            row.addProperty("abilityCasts", abilityCasts);
            row.addProperty("itemUses", itemUses);
            row.addProperty("controlSeconds", Math.round(controlSeconds * 10) / 10.0);
            row.addProperty("healing", healing);
            row.addProperty("kills", kills);
            row.addProperty("deaths", playerDeaths);
            row.addProperty("presencePct", presencePct);
            row.addProperty("arrivalDelay", arrivalDelay);
            row.addProperty("setupObservers", setupObserver);
            row.addProperty("setupSentries", setupSentry);
            row.addProperty("sentryCheckRequired", sentryCheckRequired);
            row.addProperty("responsibilityScore", score);
            row.addProperty("status", responsibilityGate.status.equals("insufficient_evidence") || roleConfidence < 65
                    ? "insufficient_evidence" : score >= 72 ? "ok" : score >= 48 ? "watch" : "issue");
            row.addProperty("confidence", confidence);
            JsonArray issueRows = new JsonArray();
            issues.forEach(issueRows::add);
            row.add("issues", issueRows);
            row.add("responsibility_gate", responsibilityGate.toJson());
            row.addProperty("evidence", "facts_plus_hard_opportunity_gate");
            rows.add(row);
        }
        return rows;
    }

    private ResponsibilityGate buildResponsibilityGate(int slot, int start, int end) {
        int totalSeconds = Math.max(1, end - start + 1);
        int snapshotSeconds = 0;
        int abilityStateSeconds = 0;
        int candidateSamples = 0;
        int decisiveSamples = 0;
        int opportunitySeconds = 0;
        int metadataSamples = 0;
        Map<String, Integer> blockers = new LinkedHashMap<>();
        Map<String, AbilityWindow> activeWindows = new HashMap<>();
        List<AbilityWindow> windows = new ArrayList<>();

        for (int second = start; second <= end; second++) {
            Snapshot snapshot = snapshotFloorAt(slot, second, 2);
            if (snapshot == null) {
                increment(blockers, "snapshot_missing");
                continue;
            }
            snapshotSeconds++;
            if (snapshot.lifeState != null && snapshot.lifeState != 0) {
                increment(blockers, "dead");
                continue;
            }
            if (snapshot.abilities == null || snapshot.abilities.isEmpty()) {
                increment(blockers, "ability_state_missing");
                continue;
            }
            abilityStateSeconds++;
            String control = activeCastBlockingControl(slot, second);
            boolean opportunityThisSecond = false;
            for (JsonElement element : snapshot.abilities) {
                if (!element.isJsonObject()) continue;
                JsonObject ability = element.getAsJsonObject();
                String key = stringValue(ability, "key");
                Integer level = integerValue(ability, "level");
                if (key == null || level == null || level <= 0 || key.contains("special_bonus")
                        || key.equals("generic_hidden")) continue;
                Float cooldownLength = floatValue(ability, "cooldown_length");
                Integer manaCost = integerValue(ability, "mana_cost");
                Integer charges = integerValue(ability, "charges");
                PatchAbilityMetadata.AbilityProfile profile = abilityMetadata.ability(key);
                if (profile == null) {
                    candidateSamples++;
                    increment(blockers, "patch_metadata_missing");
                    continue;
                }
                if (!profile.responsibilityCandidate()) continue;
                if ((cooldownLength == null || cooldownLength <= 0)
                        && (manaCost == null || manaCost <= 0) && charges == null) {
                    continue;
                }
                candidateSamples++;
                metadataSamples++;

                if (!profile.targetSemanticsKnown()) {
                    increment(blockers, "ability_semantics_unknown");
                    continue;
                }

                if (control != null) {
                    increment(blockers, control);
                    decisiveSamples++;
                    continue;
                }
                Float cooldown = floatValue(ability, "cooldown");
                boolean chargeReady = charges != null && charges > 0;
                if (!chargeReady && cooldown == null) {
                    increment(blockers, "cooldown_unknown");
                    continue;
                }
                if (!chargeReady && cooldown > 0.25f) {
                    increment(blockers, "cooldown");
                    decisiveSamples++;
                    continue;
                }
                if (manaCost == null || snapshot.mana == null) {
                    increment(blockers, "mana_unknown");
                    continue;
                }
                if (snapshot.mana + 0.01f < manaCost) {
                    increment(blockers, "mana");
                    decisiveSamples++;
                    continue;
                }
                Float castRange = floatValue(ability, "cast_range");
                float effectiveRange = profile.effectiveRange(level, castRange);
                if (effectiveRange <= 0) {
                    increment(blockers, "range_unknown");
                    continue;
                }
                if (!hasReasonableAbilityTarget(slot, second, profile, level, castRange)) {
                    increment(blockers, "target_or_range");
                    decisiveSamples++;
                    continue;
                }
                decisiveSamples++;
                opportunityThisSecond = true;
                AbilityWindow active = activeWindows.get(key);
                if (active == null || active.end != second - 1) {
                    active = new AbilityWindow(key, second, effectiveRange,
                            profile.targetMode().name().toLowerCase(Locale.ROOT));
                    activeWindows.put(key, active);
                    windows.add(active);
                } else {
                    active.end = second;
                }
            }
            if (opportunityThisSecond) opportunitySeconds++;
        }

        int coverage = (int) Math.round(abilityStateSeconds * 100.0 / totalSeconds);
        String status;
        if (opportunitySeconds > 0) {
            status = "passed";
        } else if (coverage >= 50 && candidateSamples > 0 && decisiveSamples == candidateSamples) {
            status = "blocked";
        } else {
            status = "insufficient_evidence";
        }
        return new ResponsibilityGate(status, coverage, snapshotSeconds, abilityStateSeconds,
                candidateSamples, decisiveSamples, opportunitySeconds, metadataSamples,
                abilityMetadata.exactMatch(), blockers, windows);
    }

    private String activeCastBlockingControl(int slot, int second) {
        for (ControlPoint control : controls) {
            if (!Integer.valueOf(slot).equals(control.targetSlot)) continue;
            int end = control.time + Math.max(1, (int) Math.ceil(control.duration));
            if (control.time <= second && second < end
                    && (control.controlType.equals("stun") || control.controlType.equals("silence"))) {
                return control.controlType;
            }
        }
        return null;
    }

    private boolean hasReasonableAbilityTarget(int slot, int second,
            PatchAbilityMetadata.AbilityProfile profile, int level, Float replayCastRange) {
        Snapshot player = snapshotFloorAt(slot, second, 2);
        Position origin = positionOf(player);
        if (origin == null) return false;
        double radius = worldDistanceToPercent(profile.effectiveRange(level, replayCastRange) + 150.0);
        if (profile.targetsEnemyHero()) {
            int perspectiveTeam = teamForSlot(slot);
            for (int target : enemySlots(slot)) {
                VisibilitySample visible = visibilityIndex.getOrDefault(perspectiveTeam, Map.of())
                        .getOrDefault(target, new TreeMap<>()).get(second);
                if (visible == null || !(visible.state.equals("confirmed") || visible.state.equals("probable"))) {
                    continue;
                }
                if (visible.position != null && distance(origin, visible.position) <= radius) return true;
            }
        }
        if (profile.targetsFriendlyHero()) {
            int teamStart = slot < 5 ? 0 : 5;
            for (int ally = teamStart; ally < teamStart + 5; ally++) {
                if (ally == slot) continue;
                Snapshot target = snapshotFloorAt(ally, second, 2);
                if (target == null || target.lifeState != null && target.lifeState != 0
                        || target.hp == null || target.maxHp == null || target.maxHp <= 0
                        || target.hp / target.maxHp > 0.8f) continue;
                Position targetPosition = positionOf(target);
                if (targetPosition != null && distance(origin, targetPosition) <= radius) return true;
            }
        }
        return false;
    }

    private boolean sentryCheckRequired(Position position) {
        if (position == null) return false;
        return coordinates.roshanPits().stream().map(ProductAnalysis::position)
                .anyMatch(pit -> distance(position, pit) <= ROSHAN_PIT_CONTEXT_RADIUS_PCT);
    }

    private static void increment(Map<String, Integer> counts, String key) {
        counts.merge(key, 1, Integer::sum);
    }

    private String roleForSlot(int slot, int duration) {
        int teamStart = slot < 5 ? 0 : 5;
        int sampleTime = Math.min(duration, 600);
        List<Integer> teamSlots = new ArrayList<>();
        for (int candidate = teamStart; candidate < teamStart + 5; candidate++) teamSlots.add(candidate);
        teamSlots.sort(Comparator.comparingInt((Integer candidate) -> economyAt(candidate, sampleTime)).reversed());
        return teamSlots.indexOf(slot) < 3 ? "core" : "support";
    }

    private int economyAt(int slot, int time) {
        Snapshot snapshot = snapshotAt(slot, time);
        if (snapshot == null) return 0;
        if (snapshot.networth != null) return snapshot.networth;
        return snapshot.lh == null ? 0 : snapshot.lh * 45;
    }

    private int fightPresencePercent(int slot, int start, int end, Position position) {
        if (position == null) return 0;
        NavigableMap<Integer, Snapshot> rows = snapshots.get(slot);
        if (rows == null || rows.isEmpty()) return 0;
        int total = 0;
        int nearby = 0;
        for (Snapshot snapshot : rows.subMap(start, true, end, true).values()) {
            if (snapshot.lifeState != null && snapshot.lifeState != 0) continue;
            Position sample = positionOf(snapshot);
            if (sample == null) continue;
            total++;
            if (distance(position, sample) <= 15.0) nearby++;
        }
        return total == 0 ? 0 : (int) Math.round(nearby * 100.0 / total);
    }

    private int fightArrivalDelay(int slot, int start, int end, List<DeathPoint> group,
            List<DamagePoint> fightDamage, List<HealPoint> fightHeals, List<ControlPoint> fightControls,
            List<ActorEvent> fightUsages) {
        int earliest = Integer.MAX_VALUE;
        for (DeathPoint point : group) {
            if (Integer.valueOf(slot).equals(point.attackerSlot) || Integer.valueOf(slot).equals(point.targetSlot)) {
                earliest = Math.min(earliest, point.time);
            }
        }
        for (DamagePoint point : fightDamage) {
            if (Integer.valueOf(slot).equals(point.attackerSlot) || Integer.valueOf(slot).equals(point.targetSlot)) {
                earliest = Math.min(earliest, point.time);
            }
        }
        for (HealPoint point : fightHeals) {
            if (Integer.valueOf(slot).equals(point.attackerSlot) || Integer.valueOf(slot).equals(point.targetSlot)) {
                earliest = Math.min(earliest, point.time);
            }
        }
        for (ControlPoint point : fightControls) {
            if (Integer.valueOf(slot).equals(point.attackerSlot) || Integer.valueOf(slot).equals(point.targetSlot)) {
                earliest = Math.min(earliest, point.time);
            }
        }
        for (ActorEvent point : fightUsages) {
            if (Integer.valueOf(slot).equals(point.slot)) earliest = Math.min(earliest, point.time);
        }
        return earliest == Integer.MAX_VALUE ? end - start : Math.max(0, earliest - start);
    }

    private int wardSetupCount(int slot, String type, int start, int end, Position position,
            List<JsonObject> wardRows) {
        return (int) wardRows.stream()
                .filter(ward -> Integer.valueOf(slot).equals(integerValue(ward, "playerSlot"))
                        && type.equals(stringValue(ward, "type"))
                        && intValue(ward, "placedAt", 0) >= start - 90
                        && intValue(ward, "placedAt", 0) <= end
                        && wardDistance(position, ward) <= 16.0)
                .count();
    }

    private static double wardDistance(Position position, JsonObject ward) {
        Position wardPosition = jsonPosition(ward);
        return position == null || wardPosition == null
                ? Double.MAX_VALUE : distance(position, wardPosition);
    }

    private static boolean wardCovers(Position position, JsonObject ward) {
        if (position == null) return false;
        double radiusPercent = intValue(ward, "radius", 0)
                / (MapCoordinateService.ENTITY_SPAN * 128.0) * 100.0;
        return radiusPercent > 0 && wardDistance(position, ward) <= radiusPercent;
    }

    private JsonObject buildDamageBreakdown(List<DamagePoint> fightDamage) {
        JsonObject bySlot = new JsonObject();
        for (int slot = 0; slot < 10; slot++) {
            final int currentSlot = slot;
            Map<String, Integer> totals = new HashMap<>();
            fightDamage.stream()
                    .filter(damage -> damage.attackerSlot != null && damage.attackerSlot == currentSlot)
                    .forEach(damage -> totals.merge(damage.inflictor == null ? "attack" : damage.inflictor,
                            damage.value, Integer::sum));
            JsonArray rows = new JsonArray();
            totals.entrySet().stream()
                    .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                    .forEach(entry -> {
                        JsonObject row = new JsonObject();
                        row.addProperty("key", entry.getKey());
                        row.addProperty("value", entry.getValue());
                        rows.add(row);
                    });
            bySlot.add(Integer.toString(slot), rows);
        }
        return bySlot;
    }

    private Position fightPosition(List<DeathPoint> group, int start, int end) {
        float x = 0;
        float y = 0;
        int count = 0;
        for (DeathPoint death : group) {
            if (death.targetSlot == null) continue;
            Position position = positionOf(snapshotAt(death.targetSlot, death.time));
            if (position != null) {
                x += position.x;
                y += position.y;
                count++;
            }
        }
        if (count > 0) return new Position(x / count, y / count);
        for (int slot = 0; slot < 10; slot++) {
            Position position = positionOf(snapshotAt(slot, (start + end) / 2));
            if (position != null) {
                x += position.x;
                y += position.y;
                count++;
            }
        }
        return count == 0 ? null : new Position(x / count, y / count);
    }

    private List<JsonObject> buildObjectives(int duration) {
        List<JsonObject> result = new ArrayList<>();
        int index = 0;
        Set<String> seen = new HashSet<>();
        for (ObjectivePoint objective : objectives.stream()
                .sorted((left, right) -> compareEventStamps(left.stamp, right.stamp)).toList()) {
            String dedupe = objective.stamp.gameTimeMs + ":" + objective.kind + ":" + objective.target;
            if (!seen.add(dedupe)) continue;
            JsonObject row = new JsonObject();
            row.addProperty("id", "objective-" + (++index));
            objective.stamp.annotate(row);
            row.addProperty("kind", objective.kind);
            if (objective.target != null) row.addProperty("target", objective.target);
            addNullable(row, "playerSlot", objective.playerSlot);
            addNullable(row, "attackerTeam", objective.attackerTeam);
            Position position = objectivePosition(objective);
            if (position != null) {
                addPosition(row, position);
                row.addProperty("region", regionCode(position));
            }
            result.add(row);
        }
        return result;
    }

    private Position objectivePosition(ObjectivePoint objective) {
        if (objective.playerSlot != null) {
            Position position = positionOf(snapshotAt(objective.playerSlot, objective.time));
            if (position != null) return position;
        }
        String target = objective.target == null ? "" : objective.target;
        Position building = position(coordinates.building(target));
        if (building != null) return building;
        if (objective.kind.equals("roshan") || objective.kind.equals("aegis")) {
            return clusteredHeroPosition(objective.time);
        }
        return null;
    }

    private Position clusteredHeroPosition(int time) {
        List<Snapshot> candidates = new ArrayList<>();
        for (int slot = 0; slot < 10; slot++) {
            Snapshot snapshot = snapshotAt(slot, time);
            if (snapshot != null && snapshot.rawX != null && snapshot.rawY != null
                    && (snapshot.lifeState == null || snapshot.lifeState == 0)) {
                candidates.add(snapshot);
            }
        }
        List<Snapshot> bestCluster = List.of();
        for (Snapshot center : candidates) {
            List<Snapshot> cluster = candidates.stream()
                    .filter(candidate -> rawDistance(center.rawX, center.rawY, candidate.rawX, candidate.rawY) <= 14.0f)
                    .toList();
            if (cluster.size() > bestCluster.size()) bestCluster = cluster;
        }
        if (bestCluster.isEmpty()) return null;
        float rawX = 0;
        float rawY = 0;
        for (Snapshot snapshot : bestCluster) {
            rawX += snapshot.rawX;
            rawY += snapshot.rawY;
        }
        return entityPosition(rawX / bestCluster.size(), rawY / bestCluster.size());
    }

    private List<RoshanAttempt> buildRoshanAttempts() {
        List<DamagePoint> hits = damages.stream()
                .filter(damage -> "npc_dota_roshan".equals(damage.targetName)
                        && damage.attackerSlot != null)
                .sorted((left, right) -> compareEventStamps(left.stamp, right.stamp))
                .toList();
        List<RoshanAttempt> attempts = new ArrayList<>();
        RoshanAttempt current = null;
        for (DamagePoint hit : hits) {
            if (current == null || hit.stamp.gameTimeMs - current.lastHitMs() > 20_000L) {
                current = new RoshanAttempt();
                attempts.add(current);
            }
            current.hits.add(hit);
        }
        List<ObjectivePoint> kills = objectives.stream().filter(objective -> objective.kind.equals("roshan"))
                .sorted((left, right) -> compareEventStamps(left.stamp, right.stamp)).toList();
        for (ObjectivePoint kill : kills) {
            RoshanAttempt target = attempts.stream()
                    .filter(attempt -> attempt.startMs() <= kill.stamp.gameTimeMs + 2_000L
                            && attempt.lastHitMs() + 20_000L >= kill.stamp.gameTimeMs)
                    .max(Comparator.comparingLong(RoshanAttempt::lastHitMs)).orElse(null);
            if (target == null) {
                target = new RoshanAttempt();
                target.fallbackStamp = kill.stamp;
                attempts.add(target);
            }
            target.kill = kill;
        }
        attempts.sort(Comparator.comparingLong(RoshanAttempt::startMs));
        for (int index = 0; index < attempts.size(); index++) attempts.get(index).id = "roshan-attempt-" + (index + 1);
        return attempts;
    }

    private JsonObject buildObjectiveAnalysis(int duration, List<JsonObject> wardRows,
            List<RoshanAttempt> attempts) {
        JsonObject module = new JsonObject();
        module.addProperty("schema", "objective-analysis/1.0");
        JsonArray attemptRows = new JsonArray();
        for (int index = 0; index < attempts.size(); index++) {
            RoshanAttempt next = index + 1 < attempts.size() ? attempts.get(index + 1) : null;
            attemptRows.add(roshanAttemptJson(attempts.get(index), next, wardRows));
        }
        module.add("roshan_attempts", attemptRows);
        module.add("aegis_lifecycles", buildAegisLifecycles(duration, attempts));
        JsonObject contract = new JsonObject();
        contract.addProperty("roshan_health", "observed_on_damage_events");
        contract.addProperty("roshan_alive_state", "kill_fact_plus_8_to_11_minute_uncertain_window");
        contract.addProperty("aegis_holder", "chat_event_cross_checked_with_inventory");
        contract.addProperty("aegis_removal_reason", "death_or_five_minute_timing_inference");
        contract.addProperty("semantic_accuracy", "not_manually_evaluated");
        module.add("evidence_contract", contract);
        return module;
    }

    private JsonObject roshanAttemptJson(RoshanAttempt attempt, RoshanAttempt next,
            List<JsonObject> wardRows) {
        Set<Integer> participants = attempt.participants();
        Position pit = roshanPitPosition(attempt.endMs(), participants);
        Set<Integer> contesting = roshanContestingSlots(attempt, pit);
        Map<Integer, Integer> teamDamage = new LinkedHashMap<>();
        teamDamage.put(RADIANT, 0);
        teamDamage.put(DIRE, 0);
        for (DamagePoint hit : attempt.hits) {
            if (hit.attackerSlot != null) {
                int team = teamForSlot(hit.attackerSlot);
                teamDamage.put(team, teamDamage.get(team) + hit.value);
            }
        }
        int primaryTeam = teamDamage.get(RADIANT) >= teamDamage.get(DIRE) ? RADIANT : DIRE;
        Integer killSlot = attempt.kill == null ? null : attempt.kill.playerSlot;
        Integer killTeam = killSlot == null ? null : teamForSlot(killSlot);
        boolean bothTeamsHitRoshan = teamDamage.get(RADIANT) > 0 && teamDamage.get(DIRE) > 0;
        boolean contested = bothTeamsHitRoshan || contesting.stream().anyMatch(slot -> teamForSlot(slot) != primaryTeam);
        boolean stolen = attempt.kill != null && killTeam != null && killTeam != primaryTeam
                && teamDamage.get(primaryTeam) >= Math.max(500, attempt.damage() * 0.55);
        String classification = attempt.kill == null
                ? attempt.damage() < 800 ? "probe_or_fake_attempt" : "abandoned_attempt"
                : stolen ? "roshan_steal"
                : contested && contesting.size() >= 5 ? "roshan_teamfight"
                : contested ? "contested_roshan" : "uncontested_roshan";
        Integer observedStartHealth = attempt.hits.stream().filter(hit -> hit.eventHealth != null)
                .mapToInt(hit -> hit.eventHealth + hit.value).max().stream().boxed().findFirst().orElse(null);
        Integer observedLowHealth = attempt.hits.stream().filter(hit -> hit.eventHealth != null)
                .mapToInt(hit -> hit.eventHealth).min().stream().boxed().findFirst().orElse(null);

        JsonObject row = new JsonObject();
        row.addProperty("id", attempt.id);
        row.addProperty("start", secondFloor(attempt.startMs()));
        row.addProperty("end", secondCeil(attempt.endMs()));
        row.addProperty("start_ms", attempt.startMs());
        row.addProperty("end_ms", attempt.endMs());
        row.addProperty("classification", classification);
        row.addProperty("completed", attempt.kill != null);
        row.addProperty("contested", contested);
        row.addProperty("stolen", stolen);
        row.addProperty("damage_events", attempt.hits.size());
        row.addProperty("damage_observed", attempt.damage());
        addNullable(row, "health_start_observed", observedStartHealth);
        addNullable(row, "health_low_observed", observedLowHealth);
        row.addProperty("health_continuity", "damage_events_only");
        row.addProperty("primary_damage_team", primaryTeam);
        addNullable(row, "kill_team", killTeam);
        addNullable(row, "killer_slot", killSlot);
        if (attempt.kill != null) {
            row.addProperty("kill_time", attempt.kill.time);
            row.addProperty("kill_time_ms", attempt.kill.stamp.gameTimeMs);
            row.addProperty("respawn_earliest_ms", attempt.kill.stamp.gameTimeMs + 480_000L);
            row.addProperty("respawn_latest_ms", attempt.kill.stamp.gameTimeMs + 660_000L);
            if (next != null && next.kill != null) {
                row.addProperty("next_kill_ms", next.kill.stamp.gameTimeMs);
            }
        }
        JsonArray participantRows = new JsonArray();
        participants.forEach(participantRows::add);
        row.add("participants", participantRows);
        JsonArray contestRows = new JsonArray();
        contesting.forEach(contestRows::add);
        row.add("contesting_slots", contestRows);
        JsonObject damageRows = new JsonObject();
        damageRows.addProperty("radiant", teamDamage.get(RADIANT));
        damageRows.addProperty("dire", teamDamage.get(DIRE));
        row.add("damage_by_team", damageRows);
        if (pit != null) {
            addPosition(row, pit);
            row.addProperty("pit", pit.x < 50 ? "northwest" : "southeast");
            row.add("preparation", roshanPreparationJson(attempt, pit, wardRows));
        }
        row.addProperty("evidence", attempt.kill == null ? "fact_damage_chain" : "fact_damage_and_kill_chain");
        return row;
    }

    private JsonObject roshanPreparationJson(RoshanAttempt attempt, Position pit,
            List<JsonObject> wardRows) {
        long preparationStart = attempt.endMs() - 90_000L;
        JsonObject row = new JsonObject();
        row.addProperty("start_ms", preparationStart);
        row.addProperty("end_ms", attempt.endMs());
        for (String team : List.of("radiant", "dire")) {
            int observers = 0;
            int sentries = 0;
            for (JsonObject ward : wardRows) {
                Long placedAtMs = longValue(ward, "placedAtMs");
                if (!team.equals(stringValue(ward, "team")) || placedAtMs == null
                        || placedAtMs < preparationStart || placedAtMs > attempt.endMs()
                        || !hasValue(ward, "x") || !hasValue(ward, "y")
                        || Math.hypot(floatNumber(ward, "x", 0) - pit.x,
                                floatNumber(ward, "y", 0) - pit.y) > 18.0) continue;
                if ("observer".equals(stringValue(ward, "type"))) observers++; else sentries++;
            }
            JsonObject teamRow = new JsonObject();
            teamRow.addProperty("observers", observers);
            teamRow.addProperty("sentries", sentries);
            row.add(team, teamRow);
        }
        row.addProperty("evidence", "fact_ward_events_with_static_pit_geometry");
        return row;
    }

    private Set<Integer> roshanContestingSlots(RoshanAttempt attempt, Position pit) {
        Set<Integer> slots = new LinkedHashSet<>();
        if (pit == null) return slots;
        for (DamagePoint damage : damages) {
            if (!enemyHeroEvent(damage.attackerSlot, damage.targetSlot)
                    || damage.stamp.gameTimeMs < attempt.startMs() - 10_000L
                    || damage.stamp.gameTimeMs > attempt.endMs() + 5_000L) continue;
            Position point = combatPosition(damage.time, damage.attackerSlot, damage.targetSlot);
            if (point != null && distance(point, pit) <= 16.0) {
                slots.add(damage.attackerSlot);
                slots.add(damage.targetSlot);
            }
        }
        return slots;
    }

    private Position roshanPitPosition(long timeMs, Set<Integer> participants) {
        Position observed = null;
        if (!participants.isEmpty()) {
            float x = 0;
            float y = 0;
            int count = 0;
            for (int slot : participants) {
                Position position = positionOf(snapshotNear(slot, secondFloor(timeMs), 4));
                if (position == null) continue;
                x += position.x;
                y += position.y;
                count++;
            }
            if (count > 0) observed = new Position(x / count, y / count);
        }
        if (observed == null) observed = clusteredHeroPosition(secondFloor(timeMs));
        Position best = null;
        double bestDistance = Double.POSITIVE_INFINITY;
        for (MapCoordinateService.Point point : coordinates.roshanPits()) {
            Position pit = position(point);
            double candidate = observed == null ? 0 : distance(observed, pit);
            if (best == null || candidate < bestDistance) {
                best = pit;
                bestDistance = candidate;
            }
        }
        return best;
    }

    private JsonObject buildFightRoshanContext(long contactStartMs, long contactEndMs,
            Position center, List<RoshanAttempt> attempts) {
        RoshanAttempt attached = attempts.stream()
                .filter(attempt -> attempt.startMs() - 10_000L <= contactEndMs
                        && attempt.endMs() + 5_000L >= contactStartMs)
                .min(Comparator.comparingLong(attempt -> Math.abs(attempt.endMs() - contactStartMs)))
                .orElse(null);
        if (attached != null) {
            JsonObject row = new JsonObject();
            row.addProperty("kind", attached.kill == null ? "roshan_attempt" : "roshan_resolution");
            row.addProperty("attempt_id", attached.id);
            row.addProperty("damage_observed", attached.damage());
            row.addProperty("completed", attached.kill != null);
            addNullable(row, "killer_slot", attached.kill == null ? null : attached.kill.playerSlot);
            row.addProperty("evidence", "fact_time_overlap");
            return row;
        }
        if (center == null) return null;
        double nearest = coordinates.roshanPits().stream().map(point -> position(point))
                .mapToDouble(pit -> distance(center, pit)).min().orElse(Double.POSITIVE_INFINITY);
        if (nearest > ROSHAN_PIT_CONTEXT_RADIUS_PCT) return null;
        JsonObject row = new JsonObject();
        row.addProperty("kind", "roshan_pit_combat_without_roshan_damage");
        row.addProperty("completed", false);
        row.addProperty("pit_distance_pct", round2(nearest));
        row.addProperty("evidence", "derived_static_pit_geometry");
        return row;
    }

    private JsonArray buildAegisLifecycles(int duration, List<RoshanAttempt> attempts) {
        JsonArray rows = new JsonArray();
        List<ObjectivePoint> pickups = objectives.stream().filter(objective -> objective.kind.equals("aegis"))
                .sorted((left, right) -> compareEventStamps(left.stamp, right.stamp)).toList();
        int index = 0;
        for (ObjectivePoint pickup : pickups) {
            JsonObject row = new JsonObject();
            row.addProperty("id", "aegis-" + (++index));
            pickup.stamp.annotate(row);
            addNullable(row, "holder_slot", pickup.playerSlot);
            long expectedEndMs = pickup.stamp.gameTimeMs + 300_000L;
            row.addProperty("expected_reclaim_ms", expectedEndMs);
            InventoryPoint firstSeen = null;
            InventoryPoint removed = null;
            if (pickup.playerSlot != null) {
                boolean seen = false;
                for (InventoryPoint point : inventoryPoints.getOrDefault(pickup.playerSlot, List.of())) {
                    if (point.stamp.gameTimeMs < pickup.stamp.gameTimeMs - 2_000L) continue;
                    boolean contains = inventoryContains(point.items, "aegis");
                    if (!seen && contains && point.stamp.gameTimeMs <= pickup.stamp.gameTimeMs + 10_000L) {
                        firstSeen = point;
                        seen = true;
                    } else if (seen && !contains) {
                        removed = point;
                        break;
                    }
                }
            }
            long endMs = removed == null ? duration * 1000L : removed.stamp.gameTimeMs;
            final InventoryPoint removal = removed;
            DeathPoint holderDeath = pickup.playerSlot == null || removal == null ? null : deaths.stream()
                    .filter(death -> death.targetHero && death.targetSlot != null
                            && death.targetSlot.equals(pickup.playerSlot)
                            && Math.abs(death.stamp.gameTimeMs - removal.stamp.gameTimeMs) <= 3_000L)
                    .min(Comparator.comparingLong(death -> Math.abs(
                            death.stamp.gameTimeMs - removal.stamp.gameTimeMs))).orElse(null);
            boolean matchBoundary = removal != null && removal.stamp.gameTimeMs >= duration * 1000L - 2_000L;
            String state = removed == null || matchBoundary ? "active_at_match_end"
                    : holderDeath != null ? "consumed_on_death"
                    : Math.abs(removed.stamp.gameTimeMs - expectedEndMs) <= 12_000L
                            ? "expired_or_reclaimed"
                            : removed.stamp.gameTimeMs < expectedEndMs - 12_000L
                                    ? "consumed_before_expiry" : "removed_reason_unknown";
            row.addProperty("inventory_confirmed", firstSeen != null);
            if (firstSeen != null) row.addProperty("inventory_first_seen_ms", firstSeen.stamp.gameTimeMs);
            row.addProperty("held_until_ms", endMs);
            row.addProperty("held_seconds", Math.max(0, Math.round((endMs - pickup.stamp.gameTimeMs) / 1000.0)));
            row.addProperty("state", state);
            row.addProperty("removal_reason_evidence", holderDeath != null ? "fact_death_timing"
                    : matchBoundary || removed == null ? "match_end_boundary"
                    : state.equals("consumed_before_expiry") ? "derived_nontransferable_item_disappearance"
                    : "derived_five_minute_timing");
            RoshanAttempt source = attempts.stream().filter(attempt -> attempt.kill != null
                    && attempt.kill.stamp.gameTimeMs <= pickup.stamp.gameTimeMs
                    && pickup.stamp.gameTimeMs - attempt.kill.stamp.gameTimeMs <= 10_000L)
                    .max(Comparator.comparingLong(attempt -> attempt.kill.stamp.gameTimeMs)).orElse(null);
            if (source != null) row.addProperty("roshan_attempt_id", source.id);
            int holderTeam = pickup.playerSlot == null ? 0 : teamForSlot(pickup.playerSlot);
            int teamHeroKills = (int) deaths.stream().filter(death -> death.targetHero && death.targetSlot != null
                    && death.stamp.gameTimeMs >= pickup.stamp.gameTimeMs && death.stamp.gameTimeMs <= endMs
                    && holderTeam != 0 && teamForSlot(death.targetSlot) != holderTeam
                    && (death.attackerTeam != null && death.attackerTeam == holderTeam
                            || death.attackerSlot != null && teamForSlot(death.attackerSlot) == holderTeam)).count();
            int holderKills = pickup.playerSlot == null ? 0 : (int) deaths.stream()
                    .filter(death -> death.targetHero && death.attackerSlot != null
                            && death.attackerSlot.equals(pickup.playerSlot)
                            && death.stamp.gameTimeMs >= pickup.stamp.gameTimeMs
                            && death.stamp.gameTimeMs <= endMs).count();
            int buildings = holderTeam == 0 ? 0 : (int) objectives.stream()
                    .filter(objective -> objective.kind.equals("building")
                            && objective.attackerTeam != null && objective.attackerTeam == holderTeam
                            && objective.stamp.gameTimeMs >= pickup.stamp.gameTimeMs
                            && objective.stamp.gameTimeMs <= endMs).count();
            JsonObject conversion = new JsonObject();
            conversion.addProperty("team_hero_kills", teamHeroKills);
            conversion.addProperty("holder_kills", holderKills);
            conversion.addProperty("buildings", buildings);
            conversion.addProperty("zero_conversion", teamHeroKills == 0 && buildings == 0);
            conversion.addProperty("evidence", "fact_events_within_holding_window");
            row.add("conversion", conversion);
            row.addProperty("evidence", firstSeen == null ? "fact_pickup_inventory_missing"
                    : "fact_pickup_plus_inventory_lifecycle");
            rows.add(row);
        }
        return rows;
    }

    private static boolean inventoryContains(JsonArray items, String key) {
        for (JsonElement item : items) {
            if (item.isJsonObject() && key.equals(stringValue(item.getAsJsonObject(), "key"))) return true;
        }
        return false;
    }

    private JsonObject buildMapModule(List<JsonObject> objectiveRows) {
        JsonObject statsBySlot = new JsonObject();
        for (int slot = 0; slot < 10; slot++) {
            NavigableMap<Integer, Snapshot> rows = snapshots.get(slot);
            JsonObject stats = new JsonObject();
            double distance = 0;
            int lane = 0;
            int jungle = 0;
            int river = 0;
            int dead = 0;
            Snapshot previous = null;
            if (rows != null) {
                for (Snapshot snapshot : rows.values()) {
                    Position position = positionOf(snapshot);
                    if (snapshot.lifeState != null && snapshot.lifeState != 0) dead++;
                    if (position != null) {
                        String zone = zoneType(position);
                        if (zone.equals("lane")) lane++;
                        else if (zone.equals("jungle")) jungle++;
                        else river++;
                    }
                    if (previous != null && previous.rawX != null && previous.rawY != null
                            && snapshot.rawX != null && snapshot.rawY != null) {
                        double delta = rawDistance(previous.rawX, previous.rawY, snapshot.rawX, snapshot.rawY) * 128.0;
                        if (delta < 2500) distance += delta;
                    }
                    previous = snapshot;
                }
            }
            stats.addProperty("distance_units", Math.round(distance));
            stats.addProperty("lane_seconds", lane);
            stats.addProperty("jungle_seconds", jungle);
            stats.addProperty("river_seconds", river);
            stats.addProperty("dead_seconds", dead);
            statsBySlot.add(Integer.toString(slot), stats);
        }
        JsonObject module = new JsonObject();
        module.add("objectives", toArray(objectiveRows));
        module.add("player_stats_by_slot", statsBySlot);
        module.add("calibration_anchors", coordinates.calibrationAnchors());
        return module;
    }

    private JsonObject buildTimelineModule(List<JsonObject> wardRows, List<JsonObject> objectiveRows) {
        List<JsonObject> rows = new ArrayList<>();
        purchases.forEach(event -> rows.add(event.toTimelineJson()));
        uniqueAbilityLevels().forEach(event -> rows.add(event.toTimelineJson()));
        usages.forEach(event -> rows.add(event.toTimelineJson()));
        controls.forEach(event -> rows.add(event.toTimelineJson()));
        heals.stream().filter(heal -> !heal.regen && !heal.lifesteal && heal.value >= 40)
                .forEach(heal -> rows.add(heal.toTimelineJson()));
        goldPoints.stream()
                .filter(point -> point.slot != null && point.value != 0)
                .forEach(point -> rows.add(point.toTimelineJson(goldPosition(point), coordinates)));
        deaths.stream().filter(death -> death.targetHero).forEach(death -> rows.add(death.toTimelineJson()));
        for (JsonObject ward : wardRows) {
            JsonObject placed = new JsonObject();
            placed.addProperty("time", intValue(ward, "placedAt", 0));
            copy(ward, placed, "placedAtMs", "game_time_ms");
            copy(ward, placed, "placedDemoTick", "demo_tick");
            copy(ward, placed, "placedEventSeq", "event_seq");
            placed.addProperty("game_second", intValue(ward, "placedAt", 0));
            copy(ward, placed, "placedTimeSource", "time_source");
            copy(ward, placed, "placedTimePrecision", "time_precision");
            copy(ward, placed, "placedOrderingQuality", "ordering_quality");
            placed.addProperty("kind", "ward_place");
            placed.addProperty("category", "vision");
            copy(ward, placed, "playerSlot", "actor_slot");
            copy(ward, placed, "type", "key");
            copy(ward, placed, "x", "x");
            copy(ward, placed, "y", "y");
            copy(ward, placed, "region", "location");
            copy(ward, placed, "coordinate_space", "coordinate_space");
            copy(ward, placed, "coordinate_source", "coordinate_source");
            placed.addProperty("evidence", "fact");
            rows.add(placed);
            JsonObject ended = new JsonObject();
            ended.addProperty("time", intValue(ward, "endedAt", 0));
            copy(ward, ended, "endedAtMs", "game_time_ms");
            copy(ward, ended, "endedDemoTick", "demo_tick");
            copy(ward, ended, "endedEventSeq", "event_seq");
            ended.addProperty("game_second", intValue(ward, "endedAt", 0));
            copy(ward, ended, "endedTimeSource", "time_source");
            copy(ward, ended, "endedTimePrecision", "time_precision");
            copy(ward, ended, "endedOrderingQuality", "ordering_quality");
            ended.addProperty("kind", "ward_end");
            ended.addProperty("category", "vision");
            copy(ward, ended, "playerSlot", "actor_slot");
            copy(ward, ended, "type", "key");
            copy(ward, ended, "endReason", "reason_text");
            copy(ward, ended, "x", "x");
            copy(ward, ended, "y", "y");
            copy(ward, ended, "region", "location");
            copy(ward, ended, "coordinate_space", "coordinate_space");
            copy(ward, ended, "coordinate_source", "coordinate_source");
            ended.addProperty("evidence", "derived_lifetime".equals(stringValue(ward, "endedTimeSource"))
                    ? "derived" : "fact");
            rows.add(ended);
        }
        for (JsonObject objective : objectiveRows) {
            JsonObject row = objective.deepCopy();
            row.addProperty("kind", "objective");
            row.addProperty("category", "objective");
            row.addProperty("objective_kind", stringValue(objective, "kind"));
            row.addProperty("evidence", "fact");
            rows.add(row);
        }
        rows.sort(ProductAnalysis::compareTimelineRows);
        JsonArray events = new JsonArray();
        int id = 0;
        for (JsonObject row : rows) {
            row.addProperty("id", "timeline-" + (++id));
            Position rowPosition = jsonPosition(row);
            if (!row.has("location") && rowPosition != null) {
                row.addProperty("location", regionCode(rowPosition));
            }
            events.add(row);
        }
        JsonObject module = new JsonObject();
        module.add("events", events);
        return module;
    }

    private JsonObject buildPlayerMetrics(int duration, List<JsonObject> wardRows,
            Map<Integer, LaneAssignment> laneAssignments, JsonObject laningModule, JsonObject combatModule,
            JsonObject farmModule) {
        JsonObject bySlot = new JsonObject();
        for (int slot = 0; slot < 10; slot++) {
            final int currentSlot = slot;
            LaneAssignment assignment = laneAssignments.get(slot);
            Snapshot latest = snapshotAt(slot, duration);
            int damageDealt = damages.stream()
                    .filter(damage -> damage.attackerSlot != null && damage.attackerSlot == currentSlot
                            && damage.targetSlot != null)
                    .mapToInt(damage -> damage.value)
                    .sum();
            int damageTaken = damages.stream()
                    .filter(damage -> damage.targetSlot != null && damage.targetSlot == currentSlot)
                    .mapToInt(damage -> damage.value)
                    .sum();
            int healing = heals.stream()
                    .filter(heal -> heal.attackerSlot != null && heal.attackerSlot == currentSlot
                            && heal.targetSlot != null && !heal.regen && !heal.lifesteal)
                    .mapToInt(heal -> heal.value)
                    .sum();
            double controlSeconds = controls.stream()
                    .filter(control -> control.attackerSlot != null && control.attackerSlot == currentSlot)
                    .mapToDouble(control -> control.duration)
                    .sum();
            int abilityCasts = (int) usages.stream()
                    .filter(event -> event.slot != null && event.slot == currentSlot
                            && event.kind.equals("ability_use"))
                    .count();
            int itemUses = (int) usages.stream()
                    .filter(event -> event.slot != null && event.slot == currentSlot
                            && event.kind.equals("item_use"))
                    .count();
            int teleportUses = (int) teleportChannels.stream()
                    .filter(channel -> channel.slot != null && channel.slot == currentSlot && !channel.removed)
                    .count();
            int deadSeconds = (int) snapshots.getOrDefault(slot, Collections.emptyNavigableMap()).values().stream()
                    .filter(snapshot -> snapshot.time >= 0 && snapshot.time <= duration
                            && snapshot.lifeState != null && snapshot.lifeState != 0)
                    .count();
            int observer = 0;
            int sentry = 0;
            int dewards = 0;
            int visionScore = 0;
            for (JsonObject ward : wardRows) {
                Integer owner = integerValue(ward, "playerSlot");
                if (owner == null || owner != slot) continue;
                if ("observer".equals(stringValue(ward, "type"))) observer++; else sentry++;
                dewards += intValue(ward, "dewards", 0);
                visionScore += intValue(ward, "score", 0);
            }
            JsonObject row = new JsonObject();
            row.addProperty("slot", slot);
            row.addProperty("position", assignment == null ? slot % 5 + 1 : assignment.position);
            row.addProperty("role_confidence", assignment == null ? 0 : Math.round(assignment.confidence * 100));
            row.addProperty("damage_dealt", damageDealt);
            row.addProperty("damage_taken", damageTaken);
            row.addProperty("healing", healing);
            row.addProperty("control_seconds", Math.round(controlSeconds * 10) / 10.0);
            row.addProperty("ability_casts", abilityCasts);
            row.addProperty("item_uses", itemUses);
            row.addProperty("teleport_uses", teleportUses);
            row.addProperty("actions_per_min", Math.round(actionCounts.getOrDefault(slot, 0)
                    * 600.0 / Math.max(1, duration)) / 10.0);
            row.addProperty("dead_seconds", deadSeconds);
            row.addProperty("observer_wards", observer);
            row.addProperty("sentry_wards", sentry);
            row.addProperty("dewards", dewards);
            row.addProperty("vision_score", visionScore);
            row.addProperty("lane_gold", goldInWindow(slot, 0, duration, "lane"));
            row.addProperty("neutral_gold", goldInWindow(slot, 0, duration, "neutral"));
            row.addProperty("combat_gold", goldInWindow(slot, 0, duration, "combat"));
            row.addProperty("other_gold", goldInWindow(slot, 0, duration, "other"));
            JsonObject laneOpportunities = farmModule.getAsJsonObject("lane_opportunities_by_slot");
            if (laneOpportunities != null && laneOpportunities.has(Integer.toString(slot))) {
                JsonObject opportunity = laneOpportunities.getAsJsonObject(Integer.toString(slot));
                if (opportunity.has("summary")) {
                    row.add("lane_opportunity_summary", opportunity.getAsJsonObject("summary").deepCopy());
                }
            }
            JsonObject stackValues = farmModule.getAsJsonObject("stack_value_summary_by_slot");
            if (stackValues != null && stackValues.has(Integer.toString(slot))) {
                row.add("stack_value_summary", stackValues.getAsJsonObject(Integer.toString(slot)).deepCopy());
            }
            if (latest != null) {
                addNullable(row, "networth", latest.networth);
                addNullable(row, "xp", latest.xp);
                addNullable(row, "last_hits", latest.lh);
                addNullable(row, "denies", latest.denies);
                addNullable(row, "level", latest.level);
                addNullable(row, "kills", latest.kills);
                addNullable(row, "deaths", latest.deaths);
                addNullable(row, "assists", latest.assists);
                addNullable(row, "camps_stacked", latest.campsStacked);
                addNullable(row, "rune_pickups", latest.runePickups);
            }
            JsonObject reviews = laningModule.getAsJsonObject("reviews_by_slot");
            if (reviews != null && reviews.has(Integer.toString(slot))
                    && reviews.get(Integer.toString(slot)).isJsonObject()) {
                JsonObject review = reviews.getAsJsonObject(Integer.toString(slot));
                row.addProperty("lane_score", intValue(review, "score", 0));
                row.addProperty("lane_confidence", intValue(review, "confidence", 0));
                row.addProperty("lane_verdict", stringValue(review, "verdict"));
            }
            row.add("fight_summary", playerFightSummary(slot, combatModule));
            row.add("phases", playerPhaseFacts(slot, duration));
            bySlot.add(Integer.toString(slot), row);
        }
        JsonObject module = new JsonObject();
        module.addProperty("schema", "player-facts/1.1");
        module.add("by_slot", bySlot);
        return module;
    }

    private JsonObject playerFightSummary(int slot, JsonObject combatModule) {
        int fights = 0;
        int scoreTotal = 0;
        int presenceTotal = 0;
        int issueCount = 0;
        JsonArray fightRows = combatModule == null ? null : combatModule.getAsJsonArray("fights");
        if (fightRows != null) {
            for (JsonElement fightElement : fightRows) {
                if (!fightElement.isJsonObject()) continue;
                JsonArray contributions = fightElement.getAsJsonObject().getAsJsonArray("contributions");
                if (contributions == null) continue;
                for (JsonElement contributionElement : contributions) {
                    if (!contributionElement.isJsonObject()) continue;
                    JsonObject contribution = contributionElement.getAsJsonObject();
                    if (intValue(contribution, "slot", -1) != slot) continue;
                    fights++;
                    scoreTotal += intValue(contribution, "responsibilityScore", 0);
                    presenceTotal += intValue(contribution, "presencePct", 0);
                    if ("issue".equals(stringValue(contribution, "status"))) issueCount++;
                    break;
                }
            }
        }
        JsonObject result = new JsonObject();
        result.addProperty("fights", fights);
        result.addProperty("average_score", fights == 0 ? 0 : Math.round(scoreTotal / (double) fights));
        result.addProperty("average_presence", fights == 0 ? 0 : Math.round(presenceTotal / (double) fights));
        result.addProperty("issue_fights", issueCount);
        return result;
    }

    private JsonArray playerPhaseFacts(int slot, int duration) {
        JsonArray rows = new JsonArray();
        int firstEnd = Math.min(duration, 600);
        if (firstEnd > 0) rows.add(playerPhaseFact(slot, "laning", 0, firstEnd));
        int secondEnd = Math.min(duration, 1200);
        if (secondEnd > firstEnd) rows.add(playerPhaseFact(slot, "mid_game", firstEnd, secondEnd));
        if (duration > secondEnd) rows.add(playerPhaseFact(slot, "late_game", secondEnd, duration));
        return rows;
    }

    private JsonObject playerPhaseFact(int slot, String phase, int start, int end) {
        Snapshot first = snapshotAt(slot, start);
        Snapshot last = snapshotAt(slot, end);
        JsonObject row = new JsonObject();
        row.addProperty("phase", phase);
        row.addProperty("start", start);
        row.addProperty("end", end);
        row.addProperty("networth_gain", snapshotDelta(first == null ? null : first.networth,
                last == null ? null : last.networth));
        row.addProperty("xp_gain", snapshotDelta(first == null ? null : first.xp,
                last == null ? null : last.xp));
        row.addProperty("last_hits", snapshotDelta(first == null ? null : first.lh,
                last == null ? null : last.lh));
        row.addProperty("denies", snapshotDelta(first == null ? null : first.denies,
                last == null ? null : last.denies));
        row.addProperty("kills", snapshotDelta(first == null ? null : first.kills,
                last == null ? null : last.kills));
        row.addProperty("deaths", snapshotDelta(first == null ? null : first.deaths,
                last == null ? null : last.deaths));
        row.addProperty("assists", snapshotDelta(first == null ? null : first.assists,
                last == null ? null : last.assists));
        row.addProperty("damage_dealt", damages.stream()
                .filter(damage -> damage.attackerSlot != null && damage.attackerSlot == slot
                        && damage.targetSlot != null && damage.time >= start && damage.time < end)
                .mapToInt(damage -> damage.value).sum());
        row.addProperty("damage_taken", damages.stream()
                .filter(damage -> damage.targetSlot != null && damage.targetSlot == slot
                        && damage.time >= start && damage.time < end)
                .mapToInt(damage -> damage.value).sum());
        row.addProperty("lane_gold", goldInWindow(slot, start, end, "lane"));
        row.addProperty("neutral_gold", goldInWindow(slot, start, end, "neutral"));
        row.addProperty("combat_gold", goldInWindow(slot, start, end, "combat"));
        return row;
    }

    private static int snapshotDelta(Integer first, Integer last) {
        return Math.max(0, valueOrZero(last) - valueOrZero(first));
    }

    private Position goldPosition(GoldPoint point) {
        if (point.positionResolved) return point.position;
        point.positionResolved = true;
        if (point.worldX != null && point.worldY != null) {
            Position world = worldPosition(point.worldX, point.worldY);
            if (world != null) {
                point.position = world;
                return world;
            }
        }
        point.position = positionOf(snapshotAt(point.slot == null ? -1 : point.slot, point.time));
        return point.position;
    }

    private Snapshot snapshotAt(int slot, int time) {
        NavigableMap<Integer, Snapshot> rows = snapshots.get(slot);
        if (rows == null || rows.isEmpty()) return null;
        Map.Entry<Integer, Snapshot> floor = rows.floorEntry(time);
        Map.Entry<Integer, Snapshot> ceiling = rows.ceilingEntry(time);
        if (floor == null) return ceiling == null ? null : ceiling.getValue();
        if (ceiling == null) return floor.getValue();
        return time - floor.getKey() <= ceiling.getKey() - time ? floor.getValue() : ceiling.getValue();
    }

    private Snapshot snapshotFloorAt(int slot, int time, int maxAge) {
        NavigableMap<Integer, Snapshot> rows = snapshots.get(slot);
        if (rows == null || rows.isEmpty()) return null;
        Map.Entry<Integer, Snapshot> floor = rows.floorEntry(time);
        return floor == null || time - floor.getKey() > maxAge ? null : floor.getValue();
    }

    private Set<Integer> visibleEnemies(int slot, int time) {
        int team = slot < 5 ? RADIANT : DIRE;
        Set<Integer> visible = new LinkedHashSet<>();
        Map<Integer, NavigableMap<Integer, VisibilitySample>> indexed = visibilityIndex.get(team);
        if (indexed != null) {
            indexed.forEach((enemySlot, timeline) -> {
                Map.Entry<Integer, VisibilitySample> sample = timeline.floorEntry(time);
                if (sample != null && (sample.getValue().state.equals("confirmed")
                        || sample.getValue().state.equals("probable"))) visible.add(enemySlot);
            });
            return visible;
        }
        damages.stream()
                .filter(damage -> damage.time >= time - 12 && damage.time <= time
                        && (team == RADIANT ? damage.visibleRadiant : damage.visibleDire))
                .forEach(damage -> {
                    if (damage.attackerSlot != null && isEnemySlot(slot, damage.attackerSlot)) visible.add(damage.attackerSlot);
                    if (damage.targetSlot != null && isEnemySlot(slot, damage.targetSlot)) visible.add(damage.targetSlot);
                });
        return visible;
    }

    private JsonArray enemyVisibilityEvidence(int slot, int time) {
        int team = slot < 5 ? RADIANT : DIRE;
        JsonArray rows = new JsonArray();
        visibilityIndex.getOrDefault(team, Map.of()).forEach((enemySlot, timeline) -> {
            Map.Entry<Integer, VisibilitySample> entry = timeline.floorEntry(time);
            if (entry == null) return;
            VisibilitySample sample = entry.getValue();
            JsonObject row = new JsonObject();
            row.addProperty("slot", enemySlot);
            row.addProperty("state", sample.state);
            row.addProperty("source", sample.source);
            if (sample.position != null) addPosition(row, sample.position);
            if (sample.lastSeenAt != null) {
                row.addProperty("last_seen_at", sample.lastSeenAt);
                row.addProperty("last_seen_age", Math.max(0, time - sample.lastSeenAt));
            }
            row.addProperty("uncertainty_radius_pct", round2(sample.uncertaintyRadius));
            rows.add(row);
        });
        return rows;
    }

    private boolean laneWaveObserved(int slot, String lane, int start, int end) {
        int relevantCreepTeam = slot < 5 ? DIRE : RADIANT;
        for (UnitTrack track : unitTracks.values()) {
            if (!track.kind.equals("lane_creep") || track.team == null || track.team != relevantCreepTeam) continue;
            Position reference = track.referencePosition();
            MapCoordinateService.Point point = canonicalPoint(reference);
            if (point == null || !coordinates.nearestLane(point).equals(lane)) continue;
            int expectedSpawn = Math.max(0, Math.round(Math.max(0, track.firstObserved) / 30.0f) * 30);
            if (expectedSpawn <= end + 30 && track.lastObserved >= start - 30) return true;
        }
        return false;
    }

    private boolean campOccupancyObserved(Position position, int start, int end) {
        MapCoordinateService.Point current = canonicalPoint(position);
        MapCoordinateService.CampAnchor currentCamp = coordinates.nearestCamp(current);
        if (currentCamp == null || currentCamp.distance() > 12.0) return false;
        for (UnitTrack track : unitTracks.values()) {
            if (!track.kind.equals("neutral") || track.firstObserved > end + 30 || track.lastObserved < start - 30) continue;
            Position reference = track.firstPosition != null ? track.firstPosition : track.lastPosition;
            MapCoordinateService.CampAnchor trackCamp = coordinates.nearestCamp(canonicalPoint(reference));
            if (trackCamp != null && trackCamp.id().equals(currentCamp.id()) && trackCamp.distance() <= 8.5) return true;
        }
        return false;
    }

    private List<String> activeWardIds(int slot, int time, List<JsonObject> wardRows) {
        String team = slot < 5 ? "radiant" : "dire";
        return wardRows.stream()
                .filter(ward -> team.equals(stringValue(ward, "team"))
                        && intValue(ward, "placedAt", 0) <= time && intValue(ward, "endedAt", 0) >= time)
                .map(ward -> stringValue(ward, "id"))
                .toList();
    }

    private List<String> activeWardIdsNear(int slot, int time, Position position, List<JsonObject> wardRows) {
        if (position == null) return List.of();
        String team = slot < 5 ? "radiant" : "dire";
        return wardRows.stream()
                .filter(ward -> {
                    Position wardPosition = jsonPosition(ward);
                    return wardPosition != null
                            && team.equals(stringValue(ward, "team"))
                            && "observer".equals(stringValue(ward, "type"))
                            && intValue(ward, "placedAt", 0) <= time
                            && intValue(ward, "endedAt", 0) >= time
                            && distance(position, wardPosition) <= 24;
                })
                .map(ward -> stringValue(ward, "id"))
                .toList();
    }

    private static Position jsonPosition(JsonObject row) {
        Float x = floatValue(row, "x");
        Float y = floatValue(row, "y");
        return x == null || y == null ? null : new Position(x, y);
    }

    private int countLaneKills(int slot, int start, int end) {
        return (int) deaths.stream().filter(death -> death.attackerSlot != null && death.attackerSlot == slot
                && death.time >= start && death.time <= end && unitKind(death).equals("lane")).count();
    }

    private int goldInWindow(int slot, int start, int end, String source) {
        return goldPoints.stream()
                .filter(point -> point.slot != null && point.slot == slot && point.value > 0
                        && point.classification.countsAsIncome() && point.time >= start && point.time <= end
                        && goldSourceMatches(point, source))
                .mapToInt(point -> point.value)
                .sum();
    }

    private int countUnitKills(int slot, int start, int end, String kind) {
        return (int) deaths.stream()
                .filter(death -> death.attackerSlot != null && death.attackerSlot == slot
                        && death.time >= start && death.time <= end && unitKind(death).equals(kind))
                .count();
    }

    private int stackDelta(int slot, int start, int end) {
        Snapshot first = snapshotAt(slot, start);
        Snapshot last = snapshotAt(slot, end);
        if (first == null || last == null || first.campsStacked == null || last.campsStacked == null) return 0;
        return Math.max(0, last.campsStacked - first.campsStacked);
    }

    private static int medianPositive(List<Integer> values) {
        List<Integer> positive = values.stream().filter(value -> value > 0).sorted().toList();
        return positive.isEmpty() ? 0 : positive.get(positive.size() / 2);
    }

    private static double farmScore(int expectedGold, int risk, int travelSeconds) {
        return expectedGold - risk * 1.35 - travelSeconds * 1.8;
    }

    private static Position nearestLaneAnchor(Position position) {
        List<Position> anchors = List.of(
                new Position(18.0f, 18.0f),
                new Position(50.0f, 50.0f),
                new Position(82.0f, 82.0f));
        if (position == null) return anchors.get(1);
        return anchors.stream().min(Comparator.comparingDouble(anchor -> distance(position, anchor))).orElse(anchors.get(1));
    }

    private static Position laneAnchor(String lane) {
        return switch (lane) {
            case "top" -> new Position(18.0f, 24.0f);
            case "bottom" -> new Position(82.0f, 76.0f);
            default -> new Position(50.0f, 50.0f);
        };
    }

    private static Position jungleAnchor(int slot) {
        return slot < 5 ? new Position(35.0f, 65.0f) : new Position(65.0f, 35.0f);
    }

    private static boolean goldSourceMatches(GoldPoint point, String source) {
        return switch (source) {
            case "lane" -> point.classification.source().equals("lane_creep");
            case "neutral" -> point.classification.source().equals("neutral")
                    || point.classification.source().equals("ancient");
            case "combat" -> point.classification.category().equals("combat");
            default -> point.classification.source().equals(source)
                    || point.classification.category().equals(source);
        };
    }

    private static String segmentType(String source) {
        return switch (source) {
            case "lane_creep" -> "lane";
            case "neutral", "ancient" -> "neutral";
            case "hero_kill", "hero_assist", "courier", "ward", "summoned_unit" -> "combat";
            case "building", "roshan" -> "objective";
            case "bounty_rune" -> "map_resource";
            case "passive_gold", "ability_gold", "cheat" -> "system";
            case "shared_gold", "abandoned_redistribute" -> "transfer";
            case "none" -> "none";
            default -> "unknown";
        };
    }

    private static String unitKind(DeathPoint death) {
        String target = death.targetName == null ? "" : death.targetName;
        if (death.targetHero) return "hero";
        if (target.contains("creep_goodguys") || target.contains("creep_badguys")) return "lane";
        if (target.contains("neutral")) return death.neutralCampType != null && death.neutralCampType > 0 ? "ancient" : "neutral";
        if (target.contains("tower") || target.contains("fort") || target.contains("rax")) return "tower";
        if (target.contains("courier")) return "courier";
        if (target.contains("roshan")) return "roshan";
        if (target.contains("observer_wards")) return "observer";
        if (target.contains("necronomicon") || target.contains("nec_")) return "necro";
        return "other";
    }

    private String wardPurpose(WardPoint ward) {
        if (ward.team == null || ward.rawX == null || ward.rawY == null) return "defense";
        boolean direHalf = coordinates.isDireHalfEntity(ward.rawX, ward.rawY);
        return ward.team == RADIANT ? (direHalf ? "offense" : "defense") : (direHalf ? "defense" : "offense");
    }

    private String regionCode(Position position) {
        MapCoordinateService.Point point = coordinatePoint(position);
        return coordinates.classify(point).primary();
    }

    private String laneForPosition(Position position) {
        MapCoordinateService.Point point = coordinatePoint(position);
        return coordinates.classify(point).lane();
    }

    private String zoneType(Position position) {
        String region = regionCode(position);
        if (region.endsWith("lane") || region.endsWith("base")) return "lane";
        if (region.endsWith("jungle")) return "jungle";
        return "river";
    }

    private Position positionOf(Snapshot snapshot) {
        if (snapshot == null || snapshot.rawX == null || snapshot.rawY == null) return null;
        if (!snapshot.positionResolved) {
            snapshot.position = entityPosition(snapshot.rawX, snapshot.rawY);
            snapshot.positionResolved = true;
        }
        return snapshot.position;
    }

    private Position entityPosition(float x, float y) {
        return position(coordinates.fromEntity(x, y));
    }

    private Position worldPosition(float x, float y) {
        return position(coordinates.fromWorld(x, y));
    }

    private static Position position(MapCoordinateService.Point point) {
        return point == null ? null
                : new Position(point.x(), point.y(), point.source(), point.sourceX(), point.sourceY());
    }

    private MapCoordinateService.Point coordinatePoint(Position position) {
        return position == null ? null
                : coordinates.canonical(position.x, position.y, position.source, position.sourceX, position.sourceY);
    }

    private static float rawDistance(float x1, float y1, float x2, float y2) {
        return (float) Math.hypot(x1 - x2, y1 - y2);
    }

    private static double distance(Position first, Position second) {
        return Math.hypot(first.x - second.x, first.y - second.y);
    }

    private static int[] enemySlots(int slot) {
        int start = slot < 5 ? 5 : 0;
        return new int[] { start, start + 1, start + 2, start + 3, start + 4 };
    }

    private static boolean isEnemySlot(int perspective, int candidate) {
        return perspective < 5 ? candidate >= 5 : candidate < 5;
    }

    private static JsonArray compactInventory(JsonElement value) {
        if (value == null || !value.isJsonArray()) return null;
        JsonArray result = new JsonArray();
        for (JsonElement element : value.getAsJsonArray()) {
            if (!element.isJsonObject()) continue;
            JsonObject source = element.getAsJsonObject();
            String id = stripPrefix(stringValue(source, "id"), "item_");
            if (id == null) continue;
            JsonObject item = new JsonObject();
            item.addProperty("key", id);
            addNullable(item, "slot", integerValue(source, "slot"));
            addNullable(item, "charges", integerValue(source, "num_charges"));
            addNullable(item, "secondary_charges", integerValue(source, "num_secondary_charges"));
            addNullable(item, "cooldown", floatValue(source, "cooldown"));
            addNullable(item, "cooldown_length", floatValue(source, "cooldown_length"));
            result.add(item);
        }
        return result;
    }

    private JsonArray compactAbilities(JsonElement value) {
        if (value == null || !value.isJsonArray()) return null;
        JsonArray result = new JsonArray();
        for (JsonElement element : value.getAsJsonArray()) {
            if (!element.isJsonObject()) continue;
            JsonObject source = element.getAsJsonObject();
            String id = stringValue(source, "id");
            if (id == null || id.isBlank()) continue;
            Integer level = integerValue(source, "ability_level");
            Float replayCastRange = floatValue(source, "cast_range");
            PatchAbilityMetadata.AbilityProfile profile = abilityMetadata.ability(id);
            Float resolvedCastRange = replayCastRange;
            if ((resolvedCastRange == null || resolvedCastRange <= 0) && profile != null && level != null) {
                float metadataRange = profile.castRange(level, null);
                if (metadataRange > 0) resolvedCastRange = metadataRange;
            }
            JsonObject ability = new JsonObject();
            ability.addProperty("key", id);
            addNullable(ability, "level", level);
            addNullable(ability, "cooldown", floatValue(source, "cooldown"));
            addNullable(ability, "cooldown_length", floatValue(source, "cooldown_length"));
            addNullable(ability, "charges", integerValue(source, "current_charges"));
            addNullable(ability, "mana_cost", integerValue(source, "mana_cost"));
            addNullable(ability, "cast_range", resolvedCastRange);
            ability.addProperty("cast_range_source", replayCastRange != null && replayCastRange > 0
                    ? "replay_entity" : resolvedCastRange != null ? "patch_metadata" : "unavailable");
            if (profile != null) {
                ability.addProperty("target_mode", profile.targetMode().name().toLowerCase(Locale.ROOT));
                ability.addProperty("target_team", profile.targetTeam);
                ability.addProperty("target_type", profile.targetType);
                ability.addProperty("effect_radius", profile.effectRadius(level == null ? 1 : level));
                ability.addProperty("target_semantics_known", profile.targetSemanticsKnown());
            }
            result.add(ability);
        }
        return result;
    }

    private static String inventoryStructureSignature(JsonArray inventory) {
        StringBuilder signature = new StringBuilder();
        for (JsonElement element : inventory) {
            JsonObject item = element.getAsJsonObject();
            signature.append(stringValue(item, "key")).append(':')
                    .append(integerValue(item, "slot")).append(':')
                    .append(integerValue(item, "charges")).append(':')
                    .append(integerValue(item, "secondary_charges")).append('|');
        }
        return signature.toString();
    }

    private static String heroKey(String value) {
        if (value == null) return null;
        return value.toLowerCase(Locale.ROOT)
                .replace("cdota_unit_hero_", "")
                .replace("npc_dota_hero_", "")
                .replace("_", "");
    }

    private static Integer normalizedSlot(Integer slot) {
        if (slot == null || slot < 0) return null;
        if (slot >= 128 && slot <= 132) return slot - 123;
        return slot <= 9 ? slot : null;
    }

    private static String stripPrefix(String value, String prefix) {
        return value != null && value.startsWith(prefix) ? value.substring(prefix.length()) : value;
    }

    private static JsonArray toArray(List<JsonObject> rows) {
        JsonArray result = new JsonArray();
        rows.forEach(result::add);
        return result;
    }

    private void addPosition(JsonObject object, Position position) {
        addPosition(coordinates, object, position);
    }

    private static void addPosition(MapCoordinateService coordinates, JsonObject object, Position position) {
        MapCoordinateService.Point point = position == null ? null
                : coordinates.canonical(position.x, position.y, position.source, position.sourceX, position.sourceY);
        coordinates.annotate(object, point, true);
    }

    private static void copy(JsonObject source, JsonObject target, String sourceField, String targetField) {
        JsonElement value = source.get(sourceField);
        if (value != null) target.add(targetField, value.deepCopy());
    }

    private static boolean hasValue(JsonObject object, String field) {
        JsonElement value = object.get(field);
        return value != null && !value.isJsonNull();
    }

    private static String stringValue(JsonObject object, String field) {
        JsonElement value = object.get(field);
        return value == null || value.isJsonNull() ? null : value.getAsString();
    }

    private static Integer integerValue(JsonObject object, String field) {
        JsonElement value = object.get(field);
        if (value == null || value.isJsonNull()) return null;
        try {
            return value.getAsInt();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static Long longValue(JsonObject object, String field) {
        JsonElement value = object.get(field);
        if (value == null || value.isJsonNull()) return null;
        try {
            return value.getAsLong();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static Float floatValue(JsonObject object, String field) {
        JsonElement value = object.get(field);
        if (value == null || value.isJsonNull()) return null;
        try {
            return value.getAsFloat();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static Boolean booleanValue(JsonObject object, String field) {
        JsonElement value = object.get(field);
        if (value == null || value.isJsonNull()) return null;
        try {
            return value.getAsBoolean();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static int intValue(JsonObject object, String field, int fallback) {
        Integer value = integerValue(object, field);
        return value == null ? fallback : value;
    }

    private static float floatNumber(JsonObject object, String field, float fallback) {
        Float value = floatValue(object, field);
        return value == null ? fallback : value;
    }

    private static Integer firstInteger(JsonObject object, String... fields) {
        for (String field : fields) {
            Integer value = integerValue(object, field);
            if (value != null) return value;
        }
        return null;
    }

    private static EventStamp eventStamp(JsonObject event) {
        Long gameTimeMs = longValue(event, "game_time_ms");
        Integer legacySecond = integerValue(event, "time");
        if (gameTimeMs == null && legacySecond == null) return null;
        if (gameTimeMs == null) gameTimeMs = legacySecond * 1000L;
        int gameSecond = (int) Math.floorDiv(gameTimeMs, 1000L);
        Integer sourceDemoTick = integerValue(event, "demo_tick");
        Long sourceEventSequence = longValue(event, "event_seq");
        int demoTick = sourceDemoTick == null ? -1 : sourceDemoTick;
        long eventSequence = sourceEventSequence == null ? -1L : sourceEventSequence;
        String type = stringValue(event, "type");
        String source = type == null ? "unknown"
                : type.equals("interval") ? "interval"
                : type.startsWith("DOTA_") ? "combat_log"
                : type.startsWith("CHAT_MESSAGE_") ? "game_event"
                : type.equals("obs") || type.equals("sen") || type.endsWith("_left") ? "entity"
                : "replay_event";
        return new EventStamp(gameTimeMs, gameSecond, demoTick, eventSequence, source,
                legacySecond != null && longValue(event, "game_time_ms") == null ? "second" : "millisecond",
                sourceDemoTick == null || sourceEventSequence == null ? "missing_source_order" : "exact");
    }

    private static int compareEventStamps(EventStamp left, EventStamp right) {
        int time = Long.compare(left.gameTimeMs, right.gameTimeMs);
        if (time != 0) return time;
        int tick = Integer.compare(left.demoTick, right.demoTick);
        if (tick != 0) return tick;
        return Long.compare(left.eventSequence, right.eventSequence);
    }

    private static int compareTimelineRows(JsonObject left, JsonObject right) {
        int time = Long.compare(longValue(left, "game_time_ms") == null
                        ? intValue(left, "time", 0) * 1000L : longValue(left, "game_time_ms"),
                longValue(right, "game_time_ms") == null
                        ? intValue(right, "time", 0) * 1000L : longValue(right, "game_time_ms"));
        if (time != 0) return time;
        int tick = Integer.compare(intValue(left, "demo_tick", Integer.MAX_VALUE),
                intValue(right, "demo_tick", Integer.MAX_VALUE));
        if (tick != 0) return tick;
        Long leftSequence = longValue(left, "event_seq");
        Long rightSequence = longValue(right, "event_seq");
        return Long.compare(leftSequence == null ? Long.MAX_VALUE : leftSequence,
                rightSequence == null ? Long.MAX_VALUE : rightSequence);
    }

    private static void addNullable(JsonObject object, String field, Number value) {
        if (value == null) object.add(field, null); else object.addProperty(field, value);
    }

    private static void addNullable(JsonObject object, String field, Boolean value) {
        if (value == null) object.add(field, null); else object.addProperty(field, value);
    }

    private record EventStamp(long gameTimeMs, int gameSecond, int demoTick, long eventSequence,
            String source, String timePrecision, String orderingQuality) {
        void annotate(JsonObject row) {
            row.addProperty("time", gameSecond);
            annotateMetadata(row);
        }

        void annotateMetadata(JsonObject row) {
            row.addProperty("game_time_ms", gameTimeMs);
            row.addProperty("game_second", gameSecond);
            row.addProperty("demo_tick", demoTick);
            row.addProperty("event_seq", eventSequence);
            row.addProperty("time_source", source);
            row.addProperty("time_precision", timePrecision);
            row.addProperty("ordering_quality", orderingQuality);
        }
    }

    private static final class UnitTrack {
        final int handle;
        final String unit;
        final String kind;
        Integer team;
        final int firstObserved;
        final EventStamp firstStamp;
        int lastObserved;
        EventStamp lastStamp;
        Integer deathTime;
        EventStamp deathStamp;
        Integer leftTime;
        EventStamp leftStamp;
        Position firstPosition;
        Position lastPosition;
        Float maxHp;
        boolean deathByLifeState;
        boolean deathByHpZero;
        DeathPoint combatDeath;
        Integer observedGold;
        int samples;

        UnitTrack(int handle, String unit, String kind, Integer team, EventStamp firstStamp) {
            this.handle = handle;
            this.unit = unit;
            this.kind = kind;
            this.team = team;
            this.firstStamp = firstStamp;
            this.firstObserved = firstStamp.gameSecond;
            this.lastObserved = firstStamp.gameSecond;
            this.lastStamp = firstStamp;
        }

        void observe(String type, EventStamp stamp, Integer observedTeam, Position position,
                Float hp, Float observedMaxHp, Integer lifeState) {
            int time = stamp.gameSecond;
            samples++;
            if (stamp.gameTimeMs >= lastStamp.gameTimeMs) {
                lastObserved = time;
                lastStamp = stamp;
            }
            if (team == null) team = observedTeam;
            if (position != null) {
                if (firstPosition == null) firstPosition = position;
                lastPosition = position;
            }
            if (observedMaxHp != null && observedMaxHp > 0) maxHp = observedMaxHp;
            if ((lifeState != null && lifeState != 0) || hp != null && hp <= 0) {
                if (deathStamp == null || stamp.gameTimeMs < deathStamp.gameTimeMs) {
                    deathTime = time;
                    deathStamp = stamp;
                }
                deathByLifeState |= lifeState != null && lifeState != 0;
                deathByHpZero |= hp != null && hp <= 0;
            }
            if (type.equals("unit_left")) {
                leftTime = time;
                leftStamp = stamp;
            }
        }

        Position referencePosition() {
            return lastPosition != null ? lastPosition : firstPosition;
        }
    }

    private static final class LaneWaveAggregate {
        final int team;
        final String lane;
        final int waveIndex;
        final int expectedSpawn;
        int firstEnter = Integer.MAX_VALUE;
        int lastEnter = Integer.MIN_VALUE;
        int observedUntil = Integer.MIN_VALUE;
        int deaths;
        int visibilityLost;
        int clearedAt = Integer.MIN_VALUE;
        int visibilityLostAt = Integer.MIN_VALUE;
        int units;
        int samples;
        final List<UnitTrack> tracks = new ArrayList<>();

        LaneWaveAggregate(int team, String lane, int waveIndex, int expectedSpawn) {
            this.team = team;
            this.lane = lane;
            this.waveIndex = waveIndex;
            this.expectedSpawn = expectedSpawn;
        }

        void add(UnitTrack track) {
            tracks.add(track);
            units++;
            samples += track.samples;
            firstEnter = Math.min(firstEnter, track.firstObserved);
            lastEnter = Math.max(lastEnter, track.firstObserved);
            observedUntil = Math.max(observedUntil, track.lastObserved);
            if (track.deathTime != null) {
                deaths++;
                clearedAt = Math.max(clearedAt, track.deathTime);
            } else if (track.leftTime != null) {
                visibilityLost++;
                visibilityLostAt = Math.max(visibilityLostAt, track.leftTime);
            }
        }

        JsonObject toJson() {
            JsonObject row = new JsonObject();
            row.addProperty("id", "wave-" + team + "-" + lane + "-" + waveIndex);
            row.addProperty("team_id", team);
            row.addProperty("team", team == RADIANT ? "radiant" : "dire");
            row.addProperty("lane", lane);
            row.addProperty("wave_index", waveIndex);
            row.addProperty("expected_spawn", expectedSpawn);
            row.addProperty("observed_enter_start", firstEnter);
            row.addProperty("observed_enter_end", lastEnter);
            row.addProperty("observed_until", observedUntil);
            row.addProperty("unit_count", units);
            row.addProperty("observed_deaths", deaths);
            row.addProperty("visibility_lost", visibilityLost);
            row.addProperty("sample_count", samples);
            Map<Integer, Integer> lastHitsBySlot = new TreeMap<>();
            Map<Integer, Integer> deniesBySlot = new TreeMap<>();
            Map<Integer, Integer> goldBySlot = new TreeMap<>();
            int unclaimed = 0;
            for (UnitTrack track : tracks) {
                DeathPoint death = track.combatDeath;
                if (death == null || death.attackerSlot == null) {
                    if (track.deathTime != null) unclaimed++;
                    continue;
                }
                if (track.team != null && teamForSlot(death.attackerSlot) == track.team) {
                    deniesBySlot.merge(death.attackerSlot, 1, Integer::sum);
                } else {
                    lastHitsBySlot.merge(death.attackerSlot, 1, Integer::sum);
                    if (track.observedGold != null) {
                        goldBySlot.merge(death.attackerSlot, track.observedGold, Integer::sum);
                    }
                }
            }
            row.add("last_hits_by_slot", integerMap(lastHitsBySlot));
            row.add("denies_by_slot", integerMap(deniesBySlot));
            row.add("observed_gold_by_slot", integerMap(goldBySlot));
            row.addProperty("unclaimed_or_unattributed_deaths", unclaimed);
            row.addProperty("state", deaths == units ? "observed_cleared"
                    : visibilityLost > 0 ? "visibility_lost" : "observed_present");
            JsonArray transitions = new JsonArray();
            transitions.add(resourceTransition(firstEnter, "observed_present"));
            if (deaths == units && clearedAt != Integer.MIN_VALUE) {
                transitions.add(resourceTransition(clearedAt, "observed_cleared"));
                row.addProperty("cleared_at", clearedAt);
            } else if (visibilityLostAt != Integer.MIN_VALUE) {
                transitions.add(resourceTransition(visibilityLostAt, "visibility_lost"));
            }
            row.add("transitions", transitions);
            int offset = Math.abs(firstEnter - expectedSpawn);
            row.addProperty("confidence", offset <= 12 ? 92 : offset <= 25 ? 72 : 48);
            row.addProperty("evidence", "replay_lane_creep_lifecycle");
            row.addProperty("observed_enter_is_spawn_proof", false);
            return row;
        }
    }

    private static final class CampCycleAggregate {
        final int cycleStart;
        int firstObserved = Integer.MAX_VALUE;
        int lastObserved = Integer.MIN_VALUE;
        int units;
        int deaths;
        int visibilityLost;
        int clearedAt = Integer.MIN_VALUE;
        int visibilityLostAt = Integer.MIN_VALUE;
        long overlapFromPrevious;
        final Set<Integer> stackSlots = new LinkedHashSet<>();
        final List<UnitTrack> tracks = new ArrayList<>();

        CampCycleAggregate(int cycleStart) {
            this.cycleStart = cycleStart;
        }

        void add(UnitTrack track) {
            tracks.add(track);
            units++;
            firstObserved = Math.min(firstObserved, track.firstObserved);
            lastObserved = Math.max(lastObserved, track.lastObserved);
            if (track.deathTime != null) {
                deaths++;
                clearedAt = Math.max(clearedAt, track.deathTime);
            } else if (track.leftTime != null) {
                visibilityLost++;
                visibilityLostAt = Math.max(visibilityLostAt, track.leftTime);
            }
        }

        JsonObject toJson() {
            JsonObject row = new JsonObject();
            row.addProperty("cycle_start", cycleStart);
            row.addProperty("observed_enter_start", firstObserved);
            row.addProperty("observed_until", lastObserved);
            row.addProperty("unit_count", units);
            row.addProperty("observed_deaths", deaths);
            row.addProperty("visibility_lost", visibilityLost);
            Map<Integer, Integer> killsBySlot = new TreeMap<>();
            Map<Integer, Integer> goldBySlot = new TreeMap<>();
            int laneCreepKills = 0;
            for (UnitTrack track : tracks) {
                DeathPoint death = track.combatDeath;
                if (death == null) continue;
                if (death.attackerSlot != null) {
                    killsBySlot.merge(death.attackerSlot, 1, Integer::sum);
                    if (track.observedGold != null) {
                        goldBySlot.merge(death.attackerSlot, track.observedGold, Integer::sum);
                    }
                } else if (death.attackerName != null && (death.attackerName.contains("creep_goodguys")
                        || death.attackerName.contains("creep_badguys"))) {
                    laneCreepKills++;
                }
            }
            row.add("kills_by_slot", integerMap(killsBySlot));
            row.add("observed_gold_by_slot", integerMap(goldBySlot));
            row.addProperty("lane_creep_kills", laneCreepKills);
            row.addProperty("pull_evidence", laneCreepKills > 0 ? "confirmed_cross_unit_death" : "not_observed");
            row.addProperty("overlap_from_previous_cycle", overlapFromPrevious);
            JsonArray stackActors = new JsonArray();
            stackSlots.forEach(stackActors::add);
            row.add("stacked_by_slots", stackActors);
            row.addProperty("stack_status", !stackSlots.isEmpty() ? "confirmed_player_counter"
                    : overlapFromPrevious > 0 ? "observed_cohort_overlap" : "not_observed");
            row.addProperty("spawn_window_observed", firstObserved >= cycleStart
                    && firstObserved <= cycleStart + 12);
            row.addProperty("state", deaths == units ? "observed_cleared"
                    : visibilityLost > 0 ? "visibility_lost" : "observed_present");
            JsonArray transitions = new JsonArray();
            transitions.add(resourceTransition(firstObserved, "observed_present"));
            if (deaths == units && clearedAt != Integer.MIN_VALUE) {
                transitions.add(resourceTransition(clearedAt, "observed_cleared"));
                row.addProperty("cleared_at", clearedAt);
            } else if (visibilityLostAt != Integer.MIN_VALUE) {
                transitions.add(resourceTransition(visibilityLostAt, "visibility_lost"));
            }
            row.add("transitions", transitions);
            row.addProperty("confidence", Math.abs(firstObserved - cycleStart) <= 18 ? 82 : 58);
            row.addProperty("evidence", "observed_presence_not_exact_spawn");
            return row;
        }
    }

    private static JsonObject integerMap(Map<Integer, Integer> values) {
        JsonObject row = new JsonObject();
        values.forEach((key, value) -> row.addProperty(Integer.toString(key), value));
        return row;
    }

    private static JsonObject resourceTransition(int time, String state) {
        JsonObject row = new JsonObject();
        row.addProperty("time", time);
        row.addProperty("state", state);
        return row;
    }

    private static final class HeroVisibilityEvent {
        final int time;
        Integer slot;
        final String heroKey;
        final int visibleByTeam;

        HeroVisibilityEvent(int time, Integer slot, String heroKey, int visibleByTeam) {
            this.time = time;
            this.slot = slot;
            this.heroKey = heroKey;
            this.visibleByTeam = visibleByTeam;
        }
    }

    private record VisibilitySample(int time, String state, String source, Position position,
            Integer lastSeenAt, float uncertaintyRadius) {}

    private static final class VisibilityRun {
        final int start;
        int end;
        final String state;
        final String source;
        final Position startPosition;
        Position endPosition;
        final Integer lastSeenAt;
        final float startUncertainty;
        float endUncertainty;

        VisibilityRun(VisibilitySample sample) {
            start = sample.time;
            end = sample.time;
            state = sample.state;
            source = sample.source;
            startPosition = sample.position;
            endPosition = sample.position;
            lastSeenAt = sample.lastSeenAt;
            startUncertainty = sample.uncertaintyRadius;
            endUncertainty = sample.uncertaintyRadius;
        }

        boolean canMerge(VisibilitySample sample) {
            return sample.time == end + 1 && state.equals(sample.state) && source.equals(sample.source)
                    && (!state.equals("last_seen") || java.util.Objects.equals(lastSeenAt, sample.lastSeenAt));
        }

        void add(VisibilitySample sample) {
            end = sample.time;
            endPosition = sample.position;
            endUncertainty = sample.uncertaintyRadius;
        }

        JsonObject toJson() {
            JsonObject row = new JsonObject();
            row.addProperty("start", start);
            row.addProperty("end", end);
            row.addProperty("sample_count", end - start + 1);
            row.addProperty("state", state);
            row.addProperty("source", source);
            if (startPosition != null) {
                row.addProperty("start_x", round2(startPosition.x));
                row.addProperty("start_y", round2(startPosition.y));
            }
            if (endPosition != null) {
                row.addProperty("end_x", round2(endPosition.x));
                row.addProperty("end_y", round2(endPosition.y));
            }
            if (lastSeenAt != null) row.addProperty("last_seen_at", lastSeenAt);
            row.addProperty("uncertainty_start_pct", round2(startUncertainty));
            row.addProperty("uncertainty_end_pct", round2(endUncertainty));
            return row;
        }
    }

    private static final class AbilityWindow {
        final String key;
        final int start;
        int end;
        final float effectiveRange;
        final String targetMode;

        AbilityWindow(String key, int start, float effectiveRange, String targetMode) {
            this.key = key;
            this.start = start;
            this.end = start;
            this.effectiveRange = effectiveRange;
            this.targetMode = targetMode;
        }

        JsonObject toJson() {
            JsonObject row = new JsonObject();
            row.addProperty("ability", key);
            row.addProperty("start", start);
            row.addProperty("end", end);
            row.addProperty("seconds", end - start + 1);
            row.addProperty("effective_range", round2(effectiveRange));
            row.addProperty("target_mode", targetMode);
            return row;
        }
    }

    private static final class ResponsibilityGate {
        final String status;
        final int coverage;
        final int snapshotSeconds;
        final int abilityStateSeconds;
        final int candidateSamples;
        final int decisiveSamples;
        final int opportunitySeconds;
        final int metadataSamples;
        final boolean patchMetadataMatched;
        final Map<String, Integer> blockers;
        final List<AbilityWindow> opportunities;

        ResponsibilityGate(String status, int coverage, int snapshotSeconds, int abilityStateSeconds,
                int candidateSamples, int decisiveSamples, int opportunitySeconds,
                int metadataSamples, boolean patchMetadataMatched,
                Map<String, Integer> blockers, List<AbilityWindow> opportunities) {
            this.status = status;
            this.coverage = coverage;
            this.snapshotSeconds = snapshotSeconds;
            this.abilityStateSeconds = abilityStateSeconds;
            this.candidateSamples = candidateSamples;
            this.decisiveSamples = decisiveSamples;
            this.opportunitySeconds = opportunitySeconds;
            this.metadataSamples = metadataSamples;
            this.patchMetadataMatched = patchMetadataMatched;
            this.blockers = blockers;
            this.opportunities = opportunities;
        }

        JsonObject toJson() {
            JsonObject row = new JsonObject();
            row.addProperty("model", "combat-responsibility-hard-gate/1.1");
            row.addProperty("status", status);
            row.addProperty("coverage_pct", coverage);
            row.addProperty("snapshot_seconds", snapshotSeconds);
            row.addProperty("ability_state_seconds", abilityStateSeconds);
            row.addProperty("candidate_samples", candidateSamples);
            row.addProperty("decisive_samples", decisiveSamples);
            row.addProperty("opportunity_seconds", opportunitySeconds);
            row.addProperty("metadata_samples", metadataSamples);
            row.addProperty("patch_metadata_match", patchMetadataMatched ? "exact" : "unavailable");
            row.addProperty("judgment_suppressed", !status.equals("passed"));
            JsonObject blockerRows = new JsonObject();
            blockers.forEach(blockerRows::addProperty);
            row.add("blockers", blockerRows);
            JsonArray opportunityRows = new JsonArray();
            opportunities.forEach(window -> opportunityRows.add(window.toJson()));
            row.add("opportunities", opportunityRows);
            JsonArray requirements = new JsonArray();
            for (String requirement : List.of("learned", "cooldown_ready", "mana_ready", "not_disabled",
                    "patch_metadata_exact", "target_semantics_known", "cast_range_known",
                    "reasonable_visible_target_in_range")) requirements.add(requirement);
            row.add("requirements", requirements);
            row.addProperty("ability_semantics_modeled", patchMetadataMatched && metadataSamples > 0);
            return row;
        }
    }

    private static final class Snapshot {
        final EventStamp stamp;
        final int time;
        final int slot;
        final Integer gold;
        final Integer networth;
        final Integer xp;
        final Integer lh;
        final Float rawX;
        final Float rawY;
        final Float rawZ;
        final Float hp;
        final Float maxHp;
        final Float mana;
        final Float maxMana;
        final Integer level;
        final Integer kills;
        final Integer deaths;
        final Integer assists;
        final Integer denies;
        final Integer lifeState;
        final Integer campsStacked;
        final Integer creepsStacked;
        final Integer runePickups;
        final Integer observersPlaced;
        final Integer sentriesPlaced;
        final Integer moveSpeed;
        final Integer visibleByTeam;
        final Integer dayVisionRange;
        final Integer nightVisionRange;
        final Integer fowTeam;
        final Float revealRadius;
        final Boolean selectionRingVisible;
        final JsonArray abilities;
        final JsonArray inventory;
        Position position;
        boolean positionResolved;

        Snapshot(EventStamp stamp, int slot, Integer gold, Integer networth, Integer xp, Integer lh,
                Float rawX, Float rawY, Float rawZ, Float hp, Float maxHp, Float mana, Float maxMana,
                Integer level, Integer kills, Integer deaths, Integer assists, Integer denies,
                Integer lifeState, Integer campsStacked, Integer creepsStacked, Integer runePickups,
                Integer observersPlaced, Integer sentriesPlaced, Integer moveSpeed, Integer visibleByTeam,
                Integer dayVisionRange, Integer nightVisionRange, Integer fowTeam, Float revealRadius,
                Boolean selectionRingVisible, JsonArray abilities, JsonArray inventory) {
            this.stamp = stamp;
            this.time = stamp.gameSecond;
            this.slot = slot;
            this.gold = gold;
            this.networth = networth;
            this.xp = xp;
            this.lh = lh;
            this.rawX = rawX;
            this.rawY = rawY;
            this.rawZ = rawZ;
            this.hp = hp;
            this.maxHp = maxHp;
            this.mana = mana;
            this.maxMana = maxMana;
            this.level = level;
            this.kills = kills;
            this.deaths = deaths;
            this.assists = assists;
            this.denies = denies;
            this.lifeState = lifeState;
            this.campsStacked = campsStacked;
            this.creepsStacked = creepsStacked;
            this.runePickups = runePickups;
            this.observersPlaced = observersPlaced;
            this.sentriesPlaced = sentriesPlaced;
            this.moveSpeed = moveSpeed;
            this.visibleByTeam = visibleByTeam;
            this.dayVisionRange = dayVisionRange;
            this.nightVisionRange = nightVisionRange;
            this.fowTeam = fowTeam;
            this.revealRadius = revealRadius;
            this.selectionRingVisible = selectionRingVisible;
            this.abilities = abilities;
            this.inventory = inventory;
        }

        JsonObject toJson(MapCoordinateService coordinates, Position position) {
            JsonObject row = new JsonObject();
            row.addProperty("second", time);
            addNullable(row, "gold", gold);
            addNullable(row, "networth", networth);
            addNullable(row, "xp", xp);
            addNullable(row, "lh", lh);
            if (rawX != null && rawY != null) {
                MapCoordinateService.Point point = position == null ? null
                        : coordinates.canonical(position.x, position.y, position.source,
                                position.sourceX, position.sourceY);
                coordinates.annotate(row, point, false);
            }
            addNullable(row, "hp", hp);
            addNullable(row, "max_hp", maxHp);
            addNullable(row, "mana", mana);
            addNullable(row, "max_mana", maxMana);
            addNullable(row, "level", level);
            addNullable(row, "kills", kills);
            addNullable(row, "deaths", deaths);
            addNullable(row, "assists", assists);
            addNullable(row, "denies", denies);
            addNullable(row, "life_state", lifeState);
            addNullable(row, "camps_stacked", campsStacked);
            addNullable(row, "creeps_stacked", creepsStacked);
            addNullable(row, "rune_pickups", runePickups);
            addNullable(row, "obs_placed", observersPlaced);
            addNullable(row, "sen_placed", sentriesPlaced);
            addNullable(row, "move_speed", moveSpeed);
            addNullable(row, "visible_by_team", visibleByTeam);
            addNullable(row, "day_vision_range", dayVisionRange);
            addNullable(row, "night_vision_range", nightVisionRange);
            addNullable(row, "fow_team", fowTeam);
            addNullable(row, "reveal_radius", revealRadius);
            addNullable(row, "selection_ring_visible", selectionRingVisible);
            return row;
        }
    }

    private static final class InventoryPoint {
        final EventStamp stamp;
        final int time;
        final JsonArray items;

        InventoryPoint(EventStamp stamp, JsonArray items) {
            this.stamp = stamp;
            this.time = stamp.gameSecond;
            this.items = items;
        }

        JsonObject toJson() {
            JsonObject row = new JsonObject();
            stamp.annotate(row);
            row.add("items", items.deepCopy());
            return row;
        }
    }

    private static final class ActorEvent {
        final EventStamp stamp;
        final int time;
        final String kind;
        Integer slot;
        final String actorKey;
        final String targetKey;
        final String key;
        final int value;
        final int auxiliary;
        Integer targetSlot;

        ActorEvent(EventStamp stamp, String kind, Integer slot, String actorKey, String targetKey,
                String key, int value, int auxiliary) {
            this.stamp = stamp;
            this.time = stamp.gameSecond;
            this.kind = kind;
            this.slot = slot;
            this.actorKey = actorKey;
            this.targetKey = targetKey;
            this.key = key;
            this.value = value;
            this.auxiliary = auxiliary;
        }

        void resolve(Map<String, Integer> slots) {
            if (slot == null) slot = slots.get(actorKey);
            if (targetKey != null) targetSlot = slots.get(targetKey);
        }

        JsonObject toJson() {
            JsonObject row = new JsonObject();
            stamp.annotate(row);
            row.addProperty("kind", kind);
            row.addProperty("key", key);
            row.addProperty("value", value);
            if (auxiliary != 0) row.addProperty("auxiliary", auxiliary);
            addNullable(row, "actor_slot", slot);
            addNullable(row, "target_slot", targetSlot);
            return row;
        }

        JsonObject toTimelineJson() {
            JsonObject row = toJson();
            row.addProperty("category", kind.equals("purchase") || kind.contains("use") || kind.equals("ability_level") ? "item" : "combat");
            row.addProperty("evidence", "fact");
            return row;
        }
    }

    private static final class GoldSourceAggregate {
        int events;
        int total;
        int positive;
        int negative;

        void add(int value) {
            events++;
            total += value;
            if (value > 0) positive += value;
            else negative += value;
        }

        JsonObject toJson() {
            JsonObject row = new JsonObject();
            row.addProperty("events", events);
            row.addProperty("total", total);
            row.addProperty("positive", positive);
            row.addProperty("negative", negative);
            return row;
        }
    }

    private static final class GoldPoint {
        final EventStamp stamp;
        final int time;
        final String actorKey;
        final int value;
        final int reason;
        final Float worldX;
        final Float worldY;
        Integer slot;
        GoldReasonCatalog.Entry classification;
        Position position;
        boolean positionResolved;

        GoldPoint(EventStamp stamp, String actorKey, int value, int reason,
                GoldReasonCatalog.Entry classification, Float worldX, Float worldY) {
            this.stamp = stamp;
            this.time = stamp.gameSecond;
            this.actorKey = actorKey;
            this.value = value;
            this.reason = reason;
            this.classification = classification;
            this.worldX = worldX;
            this.worldY = worldY;
        }

        JsonObject toJson() {
            JsonObject row = new JsonObject();
            stamp.annotate(row);
            row.addProperty("value", value);
            row.addProperty("reason", reason);
            row.addProperty("source", classification.source());
            row.addProperty("category", classification.category());
            row.addProperty("mapped", classification.mapped());
            row.addProperty("counts_as_income", classification.countsAsIncome());
            row.addProperty("classification_evidence", classification.evidence());
            return row;
        }

        JsonObject toTimelineJson(Position position, MapCoordinateService coordinates) {
            JsonObject row = toJson();
            row.addProperty("kind", "gold");
            addNullable(row, "actor_slot", slot);
            row.addProperty("evidence", "fact");
            if (position != null) addPosition(coordinates, row, position);
            return row;
        }
    }

    private static final class DeathPoint {
        final EventStamp stamp;
        final int time;
        final String attackerKey;
        final String targetKey;
        final String attackerName;
        final String targetName;
        final boolean targetHero;
        final boolean attackerHero;
        final int value;
        final Integer eventLastHits;
        final Integer neutralCampType;
        final Integer attackerTeam;
        final Integer targetTeam;
        final String inflictor;
        Integer attackerSlot;
        Integer targetSlot;
        Integer unitHandle;

        DeathPoint(EventStamp stamp, String attackerKey, String targetKey, String attackerName,
                String targetName, boolean targetHero, boolean attackerHero, int value,
                Integer eventLastHits, Integer neutralCampType,
                Integer attackerTeam, Integer targetTeam, String inflictor) {
            this.stamp = stamp;
            this.time = stamp.gameSecond;
            this.attackerKey = attackerKey;
            this.targetKey = targetKey;
            this.attackerName = attackerName;
            this.targetName = targetName;
            this.targetHero = targetHero;
            this.attackerHero = attackerHero;
            this.value = value;
            this.eventLastHits = eventLastHits;
            this.neutralCampType = neutralCampType;
            this.attackerTeam = attackerTeam;
            this.targetTeam = targetTeam;
            this.inflictor = inflictor;
        }

        JsonObject toTimelineJson() {
            JsonObject row = new JsonObject();
            stamp.annotate(row);
            row.addProperty("kind", "hero_death");
            row.addProperty("category", "combat");
            addNullable(row, "actor_slot", attackerSlot);
            addNullable(row, "target_slot", targetSlot);
            if (inflictor != null) row.addProperty("key", inflictor);
            row.addProperty("value", value);
            row.addProperty("evidence", "fact");
            return row;
        }
    }

    private static final class DamagePoint {
        final EventStamp stamp;
        final int time;
        final String attackerKey;
        final String targetKey;
        final String attackerName;
        final String targetName;
        final String inflictor;
        final int value;
        final boolean visibleRadiant;
        final boolean visibleDire;
        final boolean attackerHero;
        final boolean targetHero;
        final Integer attackerTeam;
        final Integer targetTeam;
        final Integer eventHealth;
        Integer attackerSlot;
        Integer targetSlot;

        DamagePoint(EventStamp stamp, String attackerKey, String targetKey, String attackerName,
                String targetName, String inflictor, int value, boolean visibleRadiant,
                boolean visibleDire, boolean attackerHero, boolean targetHero,
                Integer attackerTeam, Integer targetTeam, Integer eventHealth) {
            this.stamp = stamp;
            this.time = stamp.gameSecond;
            this.attackerKey = attackerKey;
            this.targetKey = targetKey;
            this.attackerName = attackerName;
            this.targetName = targetName;
            this.inflictor = inflictor;
            this.value = value;
            this.visibleRadiant = visibleRadiant;
            this.visibleDire = visibleDire;
            this.attackerHero = attackerHero;
            this.targetHero = targetHero;
            this.attackerTeam = attackerTeam;
            this.targetTeam = targetTeam;
            this.eventHealth = eventHealth;
        }

        JsonObject toTimelineJson() {
            JsonObject row = new JsonObject();
            stamp.annotate(row);
            row.addProperty("kind", "damage");
            row.addProperty("category", "combat");
            addNullable(row, "actor_slot", attackerSlot);
            addNullable(row, "target_slot", targetSlot);
            row.addProperty("key", inflictor == null ? "attack" : inflictor);
            row.addProperty("value", value);
            row.addProperty("evidence", "fact");
            return row;
        }
    }

    private static final class HealPoint {
        final EventStamp stamp;
        final int time;
        final String attackerKey;
        final String targetKey;
        final String inflictor;
        final int value;
        final boolean regen;
        final boolean lifesteal;
        Integer attackerSlot;
        Integer targetSlot;

        HealPoint(EventStamp stamp, String attackerKey, String targetKey, String inflictor, int value,
                boolean regen, boolean lifesteal) {
            this.stamp = stamp;
            this.time = stamp.gameSecond;
            this.attackerKey = attackerKey;
            this.targetKey = targetKey;
            this.inflictor = inflictor;
            this.value = value;
            this.regen = regen;
            this.lifesteal = lifesteal;
        }

        JsonObject toTimelineJson() {
            JsonObject row = new JsonObject();
            stamp.annotate(row);
            row.addProperty("kind", "heal");
            row.addProperty("category", "combat");
            addNullable(row, "actor_slot", attackerSlot);
            addNullable(row, "target_slot", targetSlot);
            row.addProperty("key", inflictor == null ? "heal" : inflictor);
            row.addProperty("value", value);
            row.addProperty("evidence", "fact");
            return row;
        }
    }

    private static final class ControlPoint {
        final EventStamp stamp;
        final int time;
        final String attackerKey;
        final String targetKey;
        final String inflictor;
        final String controlType;
        final float duration;
        Integer attackerSlot;
        Integer targetSlot;

        ControlPoint(EventStamp stamp, String attackerKey, String targetKey, String inflictor,
                String controlType, float duration) {
            this.stamp = stamp;
            this.time = stamp.gameSecond;
            this.attackerKey = attackerKey;
            this.targetKey = targetKey;
            this.inflictor = inflictor;
            this.controlType = controlType;
            this.duration = duration;
        }

        JsonObject toTimelineJson() {
            JsonObject row = new JsonObject();
            stamp.annotate(row);
            row.addProperty("kind", "control");
            row.addProperty("category", "combat");
            addNullable(row, "actor_slot", attackerSlot);
            addNullable(row, "target_slot", targetSlot);
            row.addProperty("key", inflictor == null ? controlType : inflictor);
            row.addProperty("control_type", controlType);
            row.addProperty("value", Math.round(duration * 10) / 10.0);
            row.addProperty("evidence", "fact");
            return row;
        }
    }

    private static final class TeleportChannelPoint {
        final EventStamp stamp;
        final int time;
        final String targetKey;
        final boolean removed;
        final float expectedDuration;
        final float elapsedDuration;
        final boolean purged;
        final String source;
        Integer slot;

        TeleportChannelPoint(EventStamp stamp, String targetKey, boolean removed,
                float expectedDuration, float elapsedDuration, boolean purged, String source) {
            this.stamp = stamp;
            this.time = stamp.gameSecond;
            this.targetKey = targetKey;
            this.removed = removed;
            this.expectedDuration = expectedDuration;
            this.elapsedDuration = elapsedDuration;
            this.purged = purged;
            this.source = source;
        }
    }

    private enum StealthKind {
        SMOKE,
        INVISIBLE
    }

    private static final class StealthModifierEvent {
        final EventStamp stamp;
        final int time;
        final String targetKey;
        final String modifier;
        final boolean removed;
        final StealthKind kind;
        final boolean trueSightRevealable;
        Integer slot;

        StealthModifierEvent(EventStamp stamp, String targetKey, String modifier, boolean removed,
                StealthKind kind, boolean trueSightRevealable) {
            this.stamp = stamp;
            this.time = stamp.gameSecond;
            this.targetKey = targetKey;
            this.modifier = modifier;
            this.removed = removed;
            this.kind = kind;
            this.trueSightRevealable = trueSightRevealable;
        }
    }

    private record StealthInterval(int start, int endExclusive, StealthKind kind,
            boolean trueSightRevealable) {}

    private record StealthState(boolean smoked, boolean invisible, boolean trueSightRevealable) {}

    private static final class WardPoint {
        final int handle;
        EventStamp placedStamp;
        EventStamp endedStamp;
        int placedAt;
        Integer endedAt;
        String type;
        Integer team;
        Integer ownerSlot;
        Float rawX;
        Float rawY;
        Integer visionRange;
        Long lifetimeMs;
        String endReason;
        String killerKey;
        Integer killerSlot;

        WardPoint(int handle) {
            this.handle = handle;
        }
    }

    private static final class ObjectivePoint {
        final EventStamp stamp;
        final int time;
        final String kind;
        final String target;
        final Integer playerSlot;
        final Integer attackerTeam;
        final Integer targetTeam;

        ObjectivePoint(EventStamp stamp, String kind, String target, Integer playerSlot,
                Integer attackerTeam, Integer targetTeam) {
            this.stamp = stamp;
            this.time = stamp.gameSecond;
            this.kind = kind;
            this.target = target;
            this.playerSlot = playerSlot;
            this.attackerTeam = attackerTeam;
            this.targetTeam = targetTeam;
        }
    }

    private static final class RoshanAttempt {
        String id;
        final List<DamagePoint> hits = new ArrayList<>();
        EventStamp fallbackStamp;
        ObjectivePoint kill;

        long startMs() {
            return hits.isEmpty() ? fallbackStamp.gameTimeMs : hits.get(0).stamp.gameTimeMs;
        }

        long lastHitMs() {
            return hits.isEmpty() ? fallbackStamp.gameTimeMs : hits.get(hits.size() - 1).stamp.gameTimeMs;
        }

        long endMs() {
            return kill == null ? lastHitMs() : Math.max(lastHitMs(), kill.stamp.gameTimeMs);
        }

        int damage() {
            return hits.stream().mapToInt(hit -> hit.value).sum();
        }

        Set<Integer> participants() {
            Set<Integer> result = new LinkedHashSet<>();
            hits.stream().filter(hit -> hit.attackerSlot != null)
                    .forEach(hit -> result.add(hit.attackerSlot));
            if (kill != null && kill.playerSlot != null) result.add(kill.playerSlot);
            return result;
        }
    }

    private static final class HeatCell {
        final int slot;
        final int start;
        final int end;
        final String source;
        final String category;
        final int bucketX;
        final int bucketY;
        int gold;
        int units;
        float weightedX;
        float weightedY;

        HeatCell(int slot, int window, String source, String category, int bucketX, int bucketY) {
            this.slot = slot;
            this.start = window * 300;
            this.end = this.start + 299;
            this.source = source;
            this.category = category;
            this.bucketX = bucketX;
            this.bucketY = bucketY;
        }

        void add(GoldPoint point, Position position) {
            gold += point.value;
            units++;
            weightedX += position.x * point.value;
            weightedY += position.y * point.value;
        }

        JsonObject toJson(int duration, MapCoordinateService coordinates) {
            JsonObject row = new JsonObject();
            row.addProperty("id", "heat-" + slot + "-" + start + "-" + source + "-" + bucketX + "-" + bucketY);
            row.addProperty("start", start);
            row.addProperty("end", Math.min(duration, end));
            row.addProperty("source", source);
            row.addProperty("category", category);
            row.addProperty("gold", gold);
            row.addProperty("units", units);
            Position position = new Position(weightedX / Math.max(1, gold), weightedY / Math.max(1, gold));
            addPosition(coordinates, row, position);
            return row;
        }
    }

    private static final class UnitKills {
        final int slot;
        final Map<String, Integer> counts = new HashMap<>();

        UnitKills(int slot) {
            this.slot = slot;
        }

        void add(DeathPoint death) {
            counts.merge(unitKind(death), 1, Integer::sum);
        }

        JsonObject toJson() {
            JsonObject row = new JsonObject();
            row.addProperty("slot", slot);
            for (String key : List.of("hero", "lane", "neutral", "ancient", "tower", "courier", "roshan", "observer", "necro", "other")) {
                row.addProperty(key, counts.getOrDefault(key, 0));
            }
            return row;
        }
    }

    private static final class CombatSignal {
        final EventStamp stamp;
        final long timeMs;
        final int time;
        final String kind;
        final Integer actorSlot;
        final Integer targetSlot;
        final int value;
        final float duration;
        final Position position;

        CombatSignal(EventStamp stamp, String kind, Integer actorSlot, Integer targetSlot,
                int value, float duration, Position position) {
            this.stamp = stamp;
            this.timeMs = stamp.gameTimeMs;
            this.time = stamp.gameSecond;
            this.kind = kind;
            this.actorSlot = actorSlot;
            this.targetSlot = targetSlot;
            this.value = value;
            this.duration = duration;
            this.position = position;
        }

        double intensity() {
            return switch (kind) {
                case "death" -> 1500;
                case "control" -> Math.max(180, duration * 260);
                default -> value;
            };
        }

        double locationWeight() {
            return switch (kind) {
                case "death" -> 10.0;
                case "control" -> Math.max(2.5, Math.min(6.0, duration * 1.8));
                default -> Math.max(1.0, Math.min(7.0, value / 140.0));
            };
        }
    }

    private static final class CombatCluster {
        final List<CombatSignal> signals = new ArrayList<>();
        final Set<Integer> participants = new LinkedHashSet<>();

        void add(CombatSignal signal) {
            signals.add(signal);
            if (signal.actorSlot != null) participants.add(signal.actorSlot);
            if (signal.targetSlot != null) participants.add(signal.targetSlot);
        }

        long firstTimeMs() {
            return signals.get(0).timeMs;
        }

        long lastTimeMs() {
            return signals.get(signals.size() - 1).timeMs;
        }

        int count(String kind) {
            return (int) signals.stream().filter(signal -> signal.kind.equals(kind)).count();
        }

        int damage() {
            return signals.stream().filter(signal -> signal.kind.equals("damage"))
                    .mapToInt(signal -> signal.value).sum();
        }

        double controlSeconds() {
            return signals.stream().filter(signal -> signal.kind.equals("control"))
                    .mapToDouble(signal -> signal.duration).sum();
        }

        boolean sharesParticipant(CombatSignal signal) {
            return signal.actorSlot != null && participants.contains(signal.actorSlot)
                    || signal.targetSlot != null && participants.contains(signal.targetSlot);
        }

        void merge(CombatCluster other) {
            signals.addAll(other.signals);
            signals.sort((left, right) -> compareEventStamps(left.stamp, right.stamp));
            participants.addAll(other.participants);
        }

        Position center() {
            double totalWeight = signals.stream().filter(signal -> signal.position != null)
                    .mapToDouble(CombatSignal::locationWeight).sum();
            if (totalWeight == 0) return null;
            double x = signals.stream().filter(signal -> signal.position != null)
                    .mapToDouble(signal -> signal.position.x * signal.locationWeight()).sum() / totalWeight;
            double y = signals.stream().filter(signal -> signal.position != null)
                    .mapToDouble(signal -> signal.position.y * signal.locationWeight()).sum() / totalWeight;
            return new Position((float) x, (float) y);
        }
    }

    private record CombatPeak(long startMs, long endMs) {}
    private record CombatLocation(Position position, double scatterRadius, int confidence) {}
    private record TeleportLanding(int time, long timeMs, Position position, double displacement) {}
    private record TeleportChannelEvidence(TeleportChannelPoint started, TeleportChannelPoint ended,
            boolean completed, boolean interrupted) {}
    private static final class TeleportResponse {
        final int slot;
        final String key;
        final int castStart;
        final long castStartMs;
        final Integer completedAt;
        final Long completedAtMs;
        final Position origin;
        final Position landing;
        final double displacement;
        final double centerDistance;
        final Integer firstAction;
        final Long firstActionMs;
        final int responseDelay;
        final long responseDelayMs;
        final int localAlliesBefore;
        final int localAlliesAfter;
        final int localEnemiesBefore;
        final int localEnemiesAfter;
        final String status;
        final boolean completedNearBattle;
        final boolean support;
        final boolean channelObserved;
        final boolean channelCompleted;
        final boolean channelInterrupted;
        final Float channelExpectedSeconds;
        final Float channelElapsedSeconds;
        final int enemyDeathsAfter;
        final int allyDeathsAfter;
        final int lowHealthAlliesSurvived;
        final String outcome;
        int arrivalOrder;
        int arrivalGroupSize;

        TeleportResponse(int slot, String key, int castStart, long castStartMs,
                Integer completedAt, Long completedAtMs, Position origin, Position landing,
                double displacement, double centerDistance, Integer firstAction, Long firstActionMs,
                int responseDelay, long responseDelayMs, int localAlliesBefore, int localAlliesAfter,
                int localEnemiesBefore, int localEnemiesAfter, String status,
                boolean completedNearBattle, boolean support, boolean channelObserved,
                boolean channelCompleted, boolean channelInterrupted, Float channelExpectedSeconds,
                Float channelElapsedSeconds, int enemyDeathsAfter, int allyDeathsAfter,
                int lowHealthAlliesSurvived, String outcome) {
            this.slot = slot;
            this.key = key;
            this.castStart = castStart;
            this.castStartMs = castStartMs;
            this.completedAt = completedAt;
            this.completedAtMs = completedAtMs;
            this.origin = origin;
            this.landing = landing;
            this.displacement = displacement;
            this.centerDistance = centerDistance;
            this.firstAction = firstAction;
            this.firstActionMs = firstActionMs;
            this.responseDelay = responseDelay;
            this.responseDelayMs = responseDelayMs;
            this.localAlliesBefore = localAlliesBefore;
            this.localAlliesAfter = localAlliesAfter;
            this.localEnemiesBefore = localEnemiesBefore;
            this.localEnemiesAfter = localEnemiesAfter;
            this.status = status;
            this.completedNearBattle = completedNearBattle;
            this.support = support;
            this.channelObserved = channelObserved;
            this.channelCompleted = channelCompleted;
            this.channelInterrupted = channelInterrupted;
            this.channelExpectedSeconds = channelExpectedSeconds;
            this.channelElapsedSeconds = channelElapsedSeconds;
            this.enemyDeathsAfter = enemyDeathsAfter;
            this.allyDeathsAfter = allyDeathsAfter;
            this.lowHealthAlliesSurvived = lowHealthAlliesSurvived;
            this.outcome = outcome;
        }
    }
    private record CombatFeatures(int activePlayers, int radiantPlayers, int direPlayers,
            int activeDuration, int deaths, int totalDamage, double damageHpRatio,
            double damageReciprocity, double targetConcentration, double interactionGraphDensity,
            int interactionEdges, int abilityCasts, int itemUses, double controlSeconds,
            boolean laneContext, int tpSupports, boolean teamfightParticipantGate,
            boolean standardDurationGate, boolean burstOverride, int teamfightEvidence,
            int highCommitmentEvidence) {
        JsonObject toJson() {
            JsonObject row = new JsonObject();
            row.addProperty("active_players", activePlayers);
            row.addProperty("radiant_players", radiantPlayers);
            row.addProperty("dire_players", direPlayers);
            row.addProperty("active_duration", activeDuration);
            row.addProperty("deaths", deaths);
            row.addProperty("total_damage", totalDamage);
            row.addProperty("damage_hp_ratio", round2(damageHpRatio));
            row.addProperty("damage_reciprocity", round2(damageReciprocity));
            row.addProperty("target_concentration", round2(targetConcentration));
            row.addProperty("interaction_graph_density", round2(interactionGraphDensity));
            row.addProperty("interaction_edges", interactionEdges);
            row.addProperty("ability_casts", abilityCasts);
            row.addProperty("item_uses", itemUses);
            row.addProperty("control_seconds", round2(controlSeconds));
            row.addProperty("lane_context", laneContext);
            row.addProperty("tp_supports", tpSupports);
            row.addProperty("teamfight_participant_gate", teamfightParticipantGate);
            row.addProperty("standard_duration_gate", standardDurationGate);
            row.addProperty("burst_override", burstOverride);
            row.addProperty("teamfight_evidence", teamfightEvidence);
            row.addProperty("high_commitment_evidence", highCommitmentEvidence);
            return row;
        }
    }
    private record CombatClassification(String kind, int intensity, int radiantParticipants,
            int direParticipants, int activeDuration, int confidence, Map<String, Integer> scores,
            List<String> contextTags, List<String> reasons, CombatFeatures features) {
        JsonObject toJson() {
            JsonObject row = new JsonObject();
            row.addProperty("kind", kind);
            row.addProperty("intensity_score", intensity);
            row.addProperty("radiant_participants", radiantParticipants);
            row.addProperty("dire_participants", direParticipants);
            row.addProperty("active_duration", activeDuration);
            row.addProperty("confidence", confidence);
            row.addProperty("calibration", "uncalibrated");
            JsonObject scoreRows = new JsonObject();
            scores.forEach(scoreRows::addProperty);
            row.add("scores", scoreRows);
            JsonArray tagRows = new JsonArray();
            contextTags.forEach(tagRows::add);
            row.add("context_tags", tagRows);
            JsonArray reasonRows = new JsonArray();
            reasons.forEach(reasonRows::add);
            row.add("reasons", reasonRows);
            row.add("features", features.toJson());
            row.addProperty("source", "automatic_weak_supervision");
            row.addProperty("model", "combat-automatic-hybrid-v5");
            return row;
        }
    }

    private record Position(float x, float y, String source, Float sourceX, Float sourceY) {
        Position(float x, float y) {
            this(x, y, "map_percent", x, y);
        }
    }
    private record Detection(int time, int heroSlot) {}
    private record LaneAssignment(int slot, int position, String lane, double confidence) {}

    private record LaneComparison(int score, int lhDiff, int denyDiff, int levelDiff, int coreXpDiff,
            int pairXpDiff, int pairNetworthDiff, int supportXpDiff, int supportLevelDiff,
            int ownCoreSupportXpGap, int enemyCoreSupportXpGap, int ownDeaths, int enemyDeaths) {
        JsonObject coreJson() {
            JsonObject row = new JsonObject();
            row.addProperty("last_hits_diff", lhDiff);
            row.addProperty("denies_diff", denyDiff);
            row.addProperty("level_diff", levelDiff);
            row.addProperty("xp_diff", coreXpDiff);
            return row;
        }

        JsonObject pairJson() {
            JsonObject row = new JsonObject();
            row.addProperty("xp_diff", pairXpDiff);
            row.addProperty("networth_diff", pairNetworthDiff);
            row.addProperty("own_deaths", ownDeaths);
            row.addProperty("enemy_deaths", enemyDeaths);
            return row;
        }

        JsonObject supportJson() {
            JsonObject row = new JsonObject();
            row.addProperty("xp_diff", supportXpDiff);
            row.addProperty("level_diff", supportLevelDiff);
            row.addProperty("own_core_support_xp_gap", ownCoreSupportXpGap);
            row.addProperty("enemy_core_support_xp_gap", enemyCoreSupportXpGap);
            return row;
        }

        JsonObject checkpointJson(int time) {
            JsonObject row = new JsonObject();
            row.addProperty("time", time);
            row.addProperty("score", score);
            row.addProperty("verdict", laneVerdict(score));
            row.addProperty("last_hits_diff", lhDiff);
            row.addProperty("level_diff", levelDiff);
            row.addProperty("core_xp_diff", coreXpDiff);
            row.addProperty("pair_xp_diff", pairXpDiff);
            row.addProperty("support_xp_diff", supportXpDiff);
            row.addProperty("networth_diff", pairNetworthDiff);
            return row;
        }
    }

    private record SupportRoute(int laneSeconds, int awaySeconds, int soloXpSeconds, int stacks, int runes,
            int wardsPlaced, int awayAssists, int awayKills, int coreDeathsAway, int coreXpAway,
            int coreLastHitsAway, int score, String interpretation, List<RouteSegment> route) {
        static SupportRoute empty() {
            return new SupportRoute(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, "无辅助路线样本", List.of());
        }

        JsonObject toJson(MapCoordinateService coordinates) {
            JsonObject row = new JsonObject();
            int total = laneSeconds + awaySeconds;
            row.addProperty("lane_seconds", laneSeconds);
            row.addProperty("away_seconds", awaySeconds);
            row.addProperty("lane_presence_pct", total == 0 ? 0 : Math.round(laneSeconds * 1000.0 / total) / 10.0);
            row.addProperty("core_solo_xp_seconds", soloXpSeconds);
            row.addProperty("stacks", stacks);
            row.addProperty("runes", runes);
            row.addProperty("wards", wardsPlaced);
            row.addProperty("away_assists", awayAssists);
            row.addProperty("away_kills", awayKills);
            row.addProperty("core_deaths_away", coreDeathsAway);
            row.addProperty("core_xp_away", coreXpAway);
            row.addProperty("core_last_hits_away", coreLastHitsAway);
            row.addProperty("score", score);
            row.addProperty("interpretation", interpretation);
            JsonArray routeRows = new JsonArray();
            route.forEach(segment -> routeRows.add(segment.toJson(coordinates)));
            row.add("route", routeRows);
            return row;
        }
    }

    private record RouteSegment(int start, int end, String region, Position position) {
        JsonObject toJson(MapCoordinateService coordinates) {
            JsonObject row = new JsonObject();
            row.addProperty("start", start);
            row.addProperty("end", end);
            row.addProperty("region", region);
            if (position != null) addPosition(coordinates, row, position);
            return row;
        }
    }

    private record ObservedFarmCycle(int start, int jungleAt, int end, String lane, int laneGold,
            int neutralGold, int laneKills, int neutralKills) {
        JsonObject toJson(int slot) {
            JsonObject row = new JsonObject();
            row.addProperty("id", "cycle-" + slot + "-" + start);
            row.addProperty("start", start);
            row.addProperty("jungle_at", jungleAt);
            row.addProperty("end", end);
            row.addProperty("return_seconds", end - jungleAt);
            row.addProperty("lane", lane);
            row.addProperty("lane_gold", laneGold);
            row.addProperty("neutral_gold", neutralGold);
            row.addProperty("total_gold", laneGold + neutralGold);
            row.addProperty("lane_kills", laneKills);
            row.addProperty("neutral_kills", neutralKills);
            row.addProperty("evidence", "observed_lane_jungle_lane_sequence");
            return row;
        }
    }

    private record FarmWindow(int start, int end, int laneGold, int neutralGold, int combatGold,
            int otherGold, Position position, int laneKills, int neutralKills, int stackDelta,
            boolean alive) {
        int totalGold() {
            return laneGold + neutralGold + combatGold + otherGold;
        }
    }

    private record FarmBenchmarks(int medianGold, int threshold, int laneGold, int neutralGold) {}

    private record FarmCandidate(String kind, int expectedGold, int risk, int travelSeconds,
            int deadlineSeconds, double score, String evidence, Position target) {
        JsonObject toJson() {
            JsonObject row = new JsonObject();
            row.addProperty("kind", kind);
            row.addProperty("expectedGold", expectedGold);
            row.addProperty("risk", risk);
            row.addProperty("travelSeconds", travelSeconds);
            row.addProperty("deadlineSeconds", deadlineSeconds);
            row.addProperty("score", Math.round(score * 10) / 10.0);
            row.addProperty("evidence", evidence);
            if (target != null) {
                row.addProperty("targetX", target.x);
                row.addProperty("targetY", target.y);
            }
            return row;
        }
    }

    private record RouteEvidence(FarmCandidate candidate, boolean complete, String blocker,
            int observedUnits, LaneSafety safety, String resourceId) {
        static RouteEvidence missing(String blocker) {
            return new RouteEvidence(null, false, blocker, 0, new LaneSafety(false, 0, 5), "unavailable");
        }
    }

    private record StackValue(String campId, int spawnCycle, int campClearObservedGold,
            int createdGoldEstimate, String valueEvidence, Map<Integer, Integer> clearedBySlots) {}

    private record UnitGoldEstimate(int value, String evidence) {}
}
