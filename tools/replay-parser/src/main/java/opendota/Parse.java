package opendota;

import com.google.gson.Gson;
import com.google.protobuf.GeneratedMessage;
import skadistats.clarity.io.Util;
import skadistats.clarity.model.DTClass;
import skadistats.clarity.model.Entity;
import skadistats.clarity.model.FieldPath;
import skadistats.clarity.model.StringTable;
import skadistats.clarity.processor.entities.Entities;
import skadistats.clarity.processor.entities.OnEntityEntered;
import skadistats.clarity.processor.entities.OnEntityLeft;
import skadistats.clarity.processor.entities.OnEntityPropertyChanged;
import skadistats.clarity.processor.entities.UsesEntities;
import skadistats.clarity.processor.gameevents.OnCombatLogEntry;
import skadistats.clarity.processor.reader.OnMessage;
import skadistats.clarity.processor.reader.OnTickStart;
import skadistats.clarity.processor.runner.Context;
import skadistats.clarity.processor.runner.SimpleRunner;
import skadistats.clarity.model.CombatLogEntry;
import skadistats.clarity.processor.stringtables.StringTables;
import skadistats.clarity.processor.stringtables.UsesStringTable;
import skadistats.clarity.source.InputStreamSource;
import skadistats.clarity.wire.shared.common.proto.CommonNetworkBaseTypes.CNETMsg_Tick;
import skadistats.clarity.wire.shared.demo.proto.Demo.CDemoFileInfo;
import skadistats.clarity.wire.dota.common.proto.DOTAUserMessages.CDOTAUserMsg_ChatEvent;
import skadistats.clarity.wire.dota.common.proto.DOTAUserMessages.CDOTAUserMsg_ChatMessage;
import skadistats.clarity.wire.dota.common.proto.DOTAUserMessages.CDOTAUserMsg_ChatWheel;
import skadistats.clarity.wire.dota.common.proto.DOTAUserMessages.CDOTAUserMsg_LocationPing;
import skadistats.clarity.wire.dota.common.proto.DOTAUserMessages.CDOTAUserMsg_SpectatorPlayerUnitOrders;
import skadistats.clarity.wire.dota.common.proto.DOTACombatLog.DOTA_COMBATLOG_TYPES;
import skadistats.clarity.wire.dota.s2.proto.DOTAS2GcMessagesCommon.CMsgDOTAMatch;
import skadistats.clarity.wire.shared.s1.proto.S1UserMessages.CUserMsg_SayText2;
import skadistats.clarity.wire.shared.s2.proto.S2UserMessages.CUserMessageSayText2;

import java.util.*;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;

import opendota.combatlogvisitors.TrackVisitor;
import opendota.combatlogvisitors.GreevilsGreedVisitor;
import opendota.combatlogvisitors.TrackVisitor.TrackStatus;
import opendota.processors.warding.OnWardExpired;
import opendota.processors.warding.OnWardKilled;
import opendota.processors.warding.OnWardPlaced;

public class Parse {

    private static final long OBSERVER_WARD_NATURAL_LIFETIME_MS = 360_000L;
    private static final long SENTRY_WARD_NATURAL_LIFETIME_MS = 420_000L;
    private static final long WARD_EXPIRY_TOLERANCE_MS = 1_000L;

    private Float getPreciseLocation (Integer cell, Float vec) {
      return (cell*128.0f+vec)/128;
    }

    static long alignedCombatGameTimeMs(long tickGameTimeMs, float combatTimestamp) {
        return tickGameTimeMs != 0 ? tickGameTimeMs : Math.round(combatTimestamp * 1000.0f);
    }

    static long alignedCombatGameTimeMs(Long demoTickAnchorMs, long currentTickGameTimeMs,
            float combatTimestamp) {
        return demoTickAnchorMs != null ? demoTickAnchorMs
                : alignedCombatGameTimeMs(currentTickGameTimeMs, combatTimestamp);
    }

    private class UnknownItemFoundException extends RuntimeException {
        public UnknownItemFoundException(String message) {
            super(message);
        }
    }

    private class UnknownAbilityFoundException extends RuntimeException {
        public UnknownAbilityFoundException(String message) {
            super(message);
        }
    }

    float INTERVAL = 1;
    float nextInterval = 0;
    Integer time = 0;
    long currentGameTimeMs = 0;
    long gameStartTimeMs = 0;
    long eventSequence = 0;
    int numPlayers = 10;
    int[] validIndices = new int[numPlayers];
    boolean init = false;
    int gameStartTime = 0;
    boolean postGame = false; // true when ancient destroyed
    boolean epilogue = false;
    private Gson g = new Gson();
    HashMap<String, Integer> name_to_slot = new HashMap<String, Integer>();
    HashMap<String, Integer> abilities_tracking = new HashMap<String, Integer>();
    List<AbilityState> abilities;
    HashMap<Integer, Integer> slot_to_playerslot = new HashMap<Integer, Integer>();
    HashMap<Long, Integer> steamid_to_playerslot = new HashMap<Long, Integer>();
    HashMap<Integer, Integer> cosmeticsMap = new HashMap<Integer, Integer>();
    HashMap<Integer, Integer> dotaplusxpMap = new HashMap<Integer, Integer>(); // playerslot, xp
    HashMap<Integer, Integer> ward_ehandle_to_slot = new HashMap<Integer, Integer>();
    HashMap<Integer, Long> ward_placed_time_ms = new HashMap<Integer, Long>();
    InputStream is = null;
    OutputStream os = null;
    private GreevilsGreedVisitor greevilsGreedVisitor;
    private TrackVisitor trackVisitor;
    private ArrayList<Boolean> isPlayerStartingItemsWritten;
    int pingCount = 0;
    private ArrayList<Entry> logBuffer = new ArrayList<Entry>();
    int serverTick = 0;
    private final NavigableMap<Integer, Long> gameTimeByDemoTick = new TreeMap<>();
    private final SchemaProbe schemaProbe = new SchemaProbe();
    private final boolean unitEventsEnabled = envFlag("DOTA_LENS_UNIT_EVENTS", true);

    // Draft stage variable
    boolean[] draftOrderProcessed = new boolean[24];
    int order = 1;
    boolean isDraftStartTimeProcessed = false; // flag to know if draft start time is already handled

    boolean isDotaPlusProcessed = false;

    // Variables to track pause timings
    boolean wasPaused = false;
    int pauseStartTime = 0;
    int pauseStartGameTime = 0;
    long pauseStartGameTimeMs = 0;

    boolean doBlob = false;
    List<Entry> finalList = new ArrayList<Entry>();

    public Parse(InputStream input, OutputStream output, boolean blob) throws IOException {
        greevilsGreedVisitor = new GreevilsGreedVisitor(name_to_slot);
        trackVisitor = new TrackVisitor();

        is = input;
        os = output;
        doBlob = blob;
        isPlayerStartingItemsWritten = new ArrayList<>(Arrays.asList(new Boolean[numPlayers]));
        Collections.fill(isPlayerStartingItemsWritten, Boolean.FALSE);
        new SimpleRunner(new InputStreamSource(is)).runWith(this);
        if (!epilogue) {
            throw new RuntimeException("no epilogue");
        }
        if (doBlob) {
            os.write(g.toJson(new CreateParsedDataBlob().createParsedDataBlob(this.finalList)).getBytes());
        } else {
            os.flush();
        }
    }

    public void output(Entry e) {
        stampEntry(e);
        if (!epilogue && gameStartTime == 0 && logBuffer != null) {
            logBuffer.add(e);
        } else {
            e.time -= gameStartTime;
            long startMs = gameStartTimeMs != 0 ? gameStartTimeMs : gameStartTime * 1000L;
            e.game_time_ms = e.raw_game_time_ms - startMs;
            appendEntry(e);
        }
    }

    private void stampEntry(Entry entry) {
        if (entry.demo_tick == null) {
            entry.demo_tick = serverTick;
        }
        if (entry.raw_game_time_ms == null) {
            Long tickAnchor = entry.demo_tick == null ? null : gameTimeByDemoTick.get(entry.demo_tick);
            entry.raw_game_time_ms = tickAnchor != null ? tickAnchor
                    : currentGameTimeMs != 0 ? currentGameTimeMs : entry.time * 1000L;
        }
        if (entry.event_seq == null) {
            entry.event_seq = ++eventSequence;
        }
    }

    private void appendEntry(Entry entry) {
        if (doBlob) {
            finalList.add(entry);
            return;
        }
        try {
            os.write((g.toJson(entry) + "\n").getBytes(StandardCharsets.UTF_8));
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
    }

    private static boolean envFlag(String name, boolean defaultValue) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            return defaultValue;
        }
        return value.equals("1") || Boolean.parseBoolean(value);
    }

    public void flushLogBuffer() {
        if (logBuffer == null) {
            return;
        }
        for (Entry e : logBuffer) {
            output(e);
        }
        logBuffer = null;
    }

    // @OnMessage(GeneratedMessage.class)
    public void onMessage(Context ctx, GeneratedMessage message) {
        System.err.println(message.getClass().getName());
        System.out.println(message.toString());
    }

    /*
     * @OnMessage(DotaUserMessages.CDOTAUserMsg_SpectatorPlayerClick.class)
     * public void onSpectatorPlayerClick(Context ctx,
     * DotaUserMessages.CDOTAUserMsg_SpectatorPlayerClick message){
     * Entry entry = new Entry(time);
     * entry.type = "clicks";
     * //need to get the entity by index
     * entry.key = String.valueOf(message.getOrderType());
     * 
     * Entity e =
     * ctx.getProcessor(Entities.class).getByIndex(message.getEntindex());
     * entry.x = getEntityProperty(e, "m_iCursor.0000", null);
     * entry.y = getEntityProperty(e, "m_iCursor.0001", null);
     * entry.slot = getEntityProperty(e, "m_iPlayerID", null);
     * //theres also target_index
     * output(entry);
     * }
     */

    @OnMessage(CMsgDOTAMatch.class)
    public void onDotaMatch(Context ctx, CMsgDOTAMatch message) {
        // TODO could use this for match overview data for uploads
        // System.err.println(message);
    }

    public Integer getPlayerSlotFromEntity(Context ctx, Entity e) {
        if (e == null)
            return null;
        Integer slot = getEntityProperty(e, "m_nPlayerID", null);
        // Sentry wards still use pre 7.31 property for storing new ID
        if (slot == null) {
            slot = getEntityProperty(e, "m_iPlayerID", null);
        }
        if (slot == null) {
            slot = getEntityProperty(e, "m_iPlayerOwnerID", null);
        }
        if (slot != null) {
            slot /= 2;
        }
        return slot;
    }

    @OnMessage(CDOTAUserMsg_SpectatorPlayerUnitOrders.class)
    public void onSpectatorPlayerUnitOrders(Context ctx, CDOTAUserMsg_SpectatorPlayerUnitOrders message) {
        Entry entry = new Entry(time);
        entry.type = "actions";
        entry.demo_tick = ctx.getTick();
        // the entindex points to a CDOTAPlayer. This is probably the player that gave
        // the order.
        Entity e = ctx.getProcessor(Entities.class).getByIndex(message.getEntindex());
        entry.slot = getPlayerSlotFromEntity(ctx, e);
        entry.issuer_index = message.getEntindex();
        entry.key = String.valueOf(message.getOrderType());
        entry.order_type = message.getOrderType();
        entry.units = new ArrayList<>(message.getUnitsList());
        entry.unit_ehandles = new ArrayList<>();
        for (Integer unitIndex : entry.units) {
            Entity unit = ctx.getProcessor(Entities.class).getByIndex(unitIndex);
            entry.unit_ehandles.add(unit == null ? null : unit.getHandle());
        }
        entry.target_index = message.getTargetIndex();
        Entity target = ctx.getProcessor(Entities.class).getByIndex(message.getTargetIndex());
        entry.target_ehandle = target == null ? null : target.getHandle();
        entry.ability_id = message.getAbilityId();
        if (message.hasPosition()) {
            entry.order_x = message.getPosition().getX();
            entry.order_y = message.getPosition().getY();
            entry.order_z = message.getPosition().getZ();
        }
        entry.queued = message.getQueue();
        entry.order_sequence = message.getSequenceNumber();
        entry.order_flags = Integer.toUnsignedLong(message.getFlags());
        entry.last_order_latency = Integer.toUnsignedLong(message.getLastOrderLatency());
        entry.ping = Integer.toUnsignedLong(message.getPing());
        output(entry);
    }

    @OnMessage(CDOTAUserMsg_LocationPing.class)
    public void onPlayerPing(Context ctx, CDOTAUserMsg_LocationPing message) {
        pingCount += 1;
        if (pingCount > 10000) {
            return;
        }

        Entry entry = new Entry(time);
        entry.type = "pings";
        entry.slot = message.getPlayerId();
        /*
         * System.err.println(message);
         * player_id: 7
         * location_ping {
         * x: 5871
         * y: 6508
         * target: -1
         * direct_ping: false
         * type: 0
         * }
         */
        // we could get the ping coordinates/type if we cared
        // entry.key = String.valueOf(message.getOrderType());
        output(entry);
    }

    @OnMessage(CDOTAUserMsg_ChatEvent.class)
    public void onChatEvent(Context ctx, CDOTAUserMsg_ChatEvent message) {
        Integer player1 = message.getPlayerid1();
        Integer player2 = message.getPlayerid2();
        Integer value = message.getValue();
        String type = String.valueOf(message.getType());
        Entry entry = new Entry(time);
        entry.type = type;
        entry.player1 = player1;
        entry.player2 = player2;
        entry.value = value;
        output(entry);
    }

    // New chat event
    @OnMessage(CDOTAUserMsg_ChatMessage.class)
    public void onAllChatMessage(Context ctx, CDOTAUserMsg_ChatMessage message) {
        int type = message.getChannelType();
        Entry entry = new Entry(time);
        entry.slot = message.getSourcePlayerId();
        entry.type = (type == 11) ? "chat" : String.valueOf(type);
        entry.key = message.getMessageText();
        output(entry);
    }

    @OnMessage(CDOTAUserMsg_ChatWheel.class)
    public void onChatWheel(Context ctx, CDOTAUserMsg_ChatWheel message) {
        Entry entry = new Entry(time);
        entry.type = "chatwheel";
        entry.slot = message.getPlayerId();
        entry.key = String.valueOf(message.getChatMessageId());
        output(entry);
    }

    @OnMessage(CUserMsg_SayText2.class)
    public void onAllChatS1(Context ctx, CUserMsg_SayText2 message) {
        Entry entry = new Entry(time);
        entry.unit = String.valueOf(message.getPrefix());
        entry.key = String.valueOf(message.getText());
        entry.type = "chat";
        output(entry);
    }

    @OnMessage(CUserMessageSayText2.class)
    public void onAllChatS2(Context ctx, CUserMessageSayText2 message) {
        Entry entry = new Entry(time);
        entry.unit = String.valueOf(message.getParam1());
        entry.key = String.valueOf(message.getParam2());
        Entity e = ctx.getProcessor(Entities.class).getByIndex(message.getEntityindex());
        entry.slot = getPlayerSlotFromEntity(ctx, e);
        entry.type = "chat";
        output(entry);
    }

    @OnMessage(CDemoFileInfo.class)
    public void onFileInfo(Context ctx, CDemoFileInfo message) {
        // beware of 4.2b limit! we don't currently do anything with this, so we might
        // be able to just remove this
        // we can't use the value field since it takes Integers
        // Entry matchIdEntry = new Entry();
        // matchIdEntry.type = "match_id";
        // matchIdEntry.value = message.getGameInfo().getDota().getMatchId();
        // output(matchIdEntry);

        // Extracted cosmetics data from CDOTAWearableItem entities
        Entry cosmeticsEntry = new Entry();
        cosmeticsEntry.type = "cosmetics";
        cosmeticsEntry.key = new Gson().toJson(cosmeticsMap);
        output(cosmeticsEntry);

        // Dota plus hero levels
        Entry dotaPlusEntry = new Entry();
        dotaPlusEntry.type = "dotaplus";
        dotaPlusEntry.key = new Gson().toJson(dotaplusxpMap);
        output(dotaPlusEntry);

        // emit epilogue event to mark finish
        Entry epilogueEntry = new Entry();
        epilogueEntry.type = "epilogue";
        epilogueEntry.key = new Gson().toJson(message);
        output(epilogueEntry);
        epilogue = true;
        // Some replays don't have a game start time and we never flush, so just do it now
        flushLogBuffer();
    }

    @OnCombatLogEntry
    public void onCombatLogEntry(Context ctx, CombatLogEntry cle) {
        try {
            float timestamp = cle.hasTimestamp() ? cle.getTimestamp() : time;
            float rawTimestamp = cle.hasTimestampRaw() ? cle.getTimestampRaw() : timestamp;
            int combatDemoTick = ctx.getTick();
            long alignedGameTimeMs = alignedCombatGameTimeMs(
                    gameTimeByDemoTick.get(combatDemoTick), currentGameTimeMs, timestamp);
            time = Math.round(alignedGameTimeMs / 1000.0f);
            // create a new entry
            Entry combatLogEntry = new Entry(time);
            combatLogEntry.demo_tick = combatDemoTick;
            combatLogEntry.raw_time = rawTimestamp;
            combatLogEntry.raw_game_time_ms = alignedGameTimeMs;
            combatLogEntry.type = cle.getType().name();
            // translate the fields using string tables if necessary (get*Name methods)
            combatLogEntry.attackername = cle.hasAttackerName() ? cle.getAttackerName() : null;
            combatLogEntry.targetname = cle.hasTargetName() ? cle.getTargetName() : null;
            combatLogEntry.sourcename = cle.hasDamageSourceName() ? cle.getDamageSourceName() : null;
            combatLogEntry.targetsourcename = cle.hasTargetSourceName() ? cle.getTargetSourceName() : null;
            combatLogEntry.inflictor = cle.hasInflictorName() ? cle.getInflictorName() : null;
            combatLogEntry.attackerhero = cle.hasAttackerHero() ? cle.isAttackerHero() : null;
            combatLogEntry.targethero = cle.hasTargetHero() ? cle.isTargetHero() : null;
            combatLogEntry.attackerillusion = cle.hasAttackerIllusion() ? cle.isAttackerIllusion() : null;
            combatLogEntry.targetillusion = cle.hasTargetIllusion() ? cle.isTargetIllusion() : null;
            combatLogEntry.value = cle.hasValue() ? cle.getValue() : null;
            combatLogEntry.stun_duration = cle.hasStunDuration() ? cle.getStunDuration() : null;
            combatLogEntry.slow_duration = cle.hasSlowDuration() ? cle.getSlowDuration() : null;
            populateExtendedCombatFields(combatLogEntry, cle);
            // value may be out of bounds in string table, we can only get valuename if a
            // purchase (type 11)
            if (cle.getType() == DOTA_COMBATLOG_TYPES.DOTA_COMBATLOG_PURCHASE) {
                combatLogEntry.valuename = cle.getValueName();
            } else if (cle.getType() == DOTA_COMBATLOG_TYPES.DOTA_COMBATLOG_GOLD && cle.hasGoldReason()) {
                combatLogEntry.gold_reason = cle.getGoldReason();
            } else if (cle.getType() == DOTA_COMBATLOG_TYPES.DOTA_COMBATLOG_XP && cle.hasXpReason()) {
                combatLogEntry.xp_reason = cle.getXpReason();
            }

            combatLogEntry.greevils_greed_stack = greevilsGreedVisitor.visit(time, cle);
            TrackStatus trackStatus = trackVisitor.visit(time, cle);
            if (trackStatus != null) {
                combatLogEntry.tracked_death = trackStatus.tracked;
                combatLogEntry.tracked_sourcename = trackStatus.inflictor;
            }
            if (combatLogEntry.type.equals("DOTA_COMBATLOG_GAME_STATE") && combatLogEntry.value == 6) {
                postGame = true;
            }
            if (combatLogEntry.type.equals("DOTA_COMBATLOG_GAME_STATE") && combatLogEntry.value == 5) {
                // See alternative gameStartTime from grp
                if (gameStartTime == 0) {
                    gameStartTime = combatLogEntry.time;
                    gameStartTimeMs = combatLogEntry.raw_game_time_ms;
                    flushLogBuffer();
                }
            }
            boolean legacyBlobEvent = cle.getType().ordinal() <= 19;
            if ((doBlob && legacyBlobEvent)
                    || (!doBlob && cle.getType() != DOTA_COMBATLOG_TYPES.DOTA_COMBATLOG_INVALID)) {
                output(combatLogEntry);
            }
        } catch (Exception e) {
            System.err.println(e);
            System.err.println(cle);
        }
    }

    private void populateExtendedCombatFields(Entry entry, CombatLogEntry cle) {
        entry.visible_radiant = cle.hasVisibleRadiant() ? cle.isVisibleRadiant() : null;
        entry.visible_dire = cle.hasVisibleDire() ? cle.isVisibleDire() : null;
        entry.event_health = cle.hasHealth() ? cle.getHealth() : null;
        entry.ability_toggle_on = cle.hasAbilityToggleOn() ? cle.isAbilityToggleOn() : null;
        entry.ability_toggle_off = cle.hasAbilityToggleOff() ? cle.isAbilityToggleOff() : null;
        entry.abilitylevel = cle.hasAbilityLevel() ? cle.getAbilityLevel() : null;
        entry.event_x = cle.hasLocationX() ? cle.getLocationX() : null;
        entry.event_y = cle.hasLocationY() ? cle.getLocationY() : null;
        entry.modifier_duration = cle.hasModifierDuration() ? cle.getModifierDuration() : null;
        entry.event_last_hits = cle.hasLastHits() ? cle.getLastHits() : null;
        entry.attacker_team = cle.hasAttackerTeam() ? cle.getAttackerTeam() : null;
        entry.target_team = cle.hasTargetTeam() ? cle.getTargetTeam() : null;
        entry.obs_wards_placed = cle.hasObsWardsPlaced() ? cle.getObsWardsPlaced() : null;
        entry.assist_players = cle.hasAssistPlayers() ? new ArrayList<>(cle.getAssistPlayers()) : null;
        entry.stack_count = cle.hasStackCount() ? cle.getStackCount() : null;
        entry.hidden_modifier = cle.hasHiddenModifier() ? cle.getHiddenModifier() : null;
        entry.target_building = cle.hasTargetBuilding() ? cle.isTargetBuilding() : null;
        entry.neutral_camp_type = cle.hasNeutralCampType() ? cle.getNeutralCampType() : null;
        entry.rune_type = cle.hasRuneType() ? cle.getRuneType() : null;
        entry.heal_save = cle.hasHealSave() ? cle.isHealSave() : null;
        entry.ultimate_ability = cle.hasUltimateAbility() ? cle.isUltimateAbility() : null;
        entry.attacker_hero_level = cle.hasAttackerHeroLevel() ? cle.getAttackerHeroLevel() : null;
        entry.target_hero_level = cle.hasTargetHeroLevel() ? cle.getTargetHeroLevel() : null;
        entry.event_xpm = cle.hasXpm() ? cle.getXpm() : null;
        entry.event_gpm = cle.hasGpm() ? cle.getGpm() : null;
        entry.event_location = cle.hasEventLocation() ? cle.getEventLocation() : null;
        entry.target_self = cle.hasTargetSelf() ? cle.isTargetSelf() : null;
        entry.damage_type = cle.hasDamageType() ? cle.getDamageType() : null;
        entry.invisibility_modifier = cle.hasInvisibilityModifier() ? cle.isInvisibilityModifier() : null;
        entry.damage_category = cle.hasDamageCategory() ? cle.getDamageCategory() : null;
        entry.event_networth = cle.hasNetworth() ? cle.getNetworth() : null;
        entry.building_type = cle.hasBuildingType() ? cle.getBuildingType() : null;
        entry.modifier_elapsed_duration = cle.hasModifierElapsedDuration() ? cle.getModifierElapsedDuration() : null;
        entry.silence_modifier = cle.hasSilenceModifier() ? cle.isSilenceModifier() : null;
        entry.heal_from_lifesteal = cle.hasHealFromLifesteal() ? cle.isHealFromLifesteal() : null;
        entry.modifier_purged = cle.hasModifierPurged() ? cle.isModifierPurged() : null;
        entry.spell_evaded = cle.hasSpellEvaded() ? cle.isSpellEvaded() : null;
        entry.motion_controller_modifier = cle.hasMotionControllerModifier() ? cle.isMotionControllerModifier() : null;
        entry.long_range_kill = cle.hasLongRangeKill() ? cle.isLongRangeKill() : null;
        entry.modifier_purge_ability = cle.hasModifierPurgeAbility() ? cle.getModifierPurgeAbility() : null;
        entry.modifier_purge_npc = cle.hasModifierPurgeNpc() ? cle.getModifierPurgeNpc() : null;
        entry.root_modifier = cle.hasRootModifier() ? cle.isRootModifier() : null;
        entry.total_unit_death_count = cle.hasTotalUnitDeathCount() ? cle.getTotalUnitDeathCount() : null;
        entry.aura_modifier = cle.hasAuraModifier() ? cle.isAuraModifier() : null;
        entry.armor_debuff_modifier = cle.hasArmorDebuffModifier() ? cle.isArmorDebuffModifier() : null;
        entry.no_physical_damage_modifier = cle.hasNoPhysicalDamageModifier() ? cle.isNoPhysicalDamageModifier() : null;
        entry.modifier_ability = cle.hasModifierAbility() ? cle.getModifierAbility() : null;
        entry.modifier_hidden = cle.hasModifierHidden() ? cle.isModifierHidden() : null;
        entry.inflictor_stolen_ability = cle.hasInflictorIsStolenAbility() ? cle.isInflictorIsStolenAbility() : null;
        entry.kill_eater_event = cle.hasKillEaterEvent() ? cle.getKillEaterEvent() : null;
        entry.unit_status_label = cle.hasUnitStatusLabel() ? cle.getUnitStatusLabel() : null;
        entry.spell_generated_attack = cle.hasSpellGeneratedAttack() ? cle.isSpellGeneratedAttack() : null;
        entry.at_night_time = cle.hasAtNightTime() ? cle.isAtNightTime() : null;
        entry.attacker_has_scepter = cle.hasAttackerHasScepter() ? cle.isAttackerHasScepter() : null;
        entry.neutral_camp_team = cle.hasNeutralCampTeam() ? cle.getNeutralCampTeam() : null;
        entry.regenerated_health = cle.hasRegeneratedHealth() ? cle.getRegeneratedHealth() : null;
        entry.will_reincarnate = cle.hasWillReincarnate() ? cle.isWillReincarnate() : null;
        entry.uses_charges = cle.hasUsesCharges() ? cle.isUsesCharges() : null;
        entry.tracked_stat_id = cle.hasTrackedStatId() ? cle.getTrackedStatId() : null;
        entry.modifier_purged_duration = cle.hasModifierPurgedDuration() ? cle.getModifierPurgedDuration() : null;
        entry.heal_from_regen = cle.hasHealFromRegen() ? cle.isHealFromRegen() : null;
    }

    @OnEntityEntered
    public void onEntityEntered(Context ctx, Entity e) {
        String entityName = e.getDtClass().getDtName();
        Entry probeEntry = schemaProbe.inspect(e, time);
        if (probeEntry != null && !doBlob) {
            output(probeEntry);
        }
        emitTrackedUnit(ctx, e, "unit_enter", null);

        if (entityName.equals("CDOTAWearableItem")) {
            Integer accountId = getEntityProperty(e, "m_iAccountID", null);
            Integer itemDefinitionIndex = getEntityProperty(e, "m_iItemDefinitionIndex", null);
            // System.err.format("%s,%s\n", accountId, itemDefinitionIndex);
            if (accountId > 0) {
                // Get the owner (a hero entity)
                Long accountId64 = 76561197960265728L + accountId;
                Integer playerSlot = steamid_to_playerslot.get(accountId64);
                cosmeticsMap.put(itemDefinitionIndex, playerSlot);
            }
        } else if (entityName.startsWith("CDOTA_Item_Tier") && entityName.endsWith("Token")) {
            Entry entry = new Entry(time);
            entry.type = "neutral_token";
            entry.slot = getPlayerSlotFromEntity(ctx, e);
            entry.key = entityName.substring("CDOTA_Item_".length()); // Tier1Token
            output(entry);
        } else if (entityName.startsWith("CDOTA_Item_")) {
            Boolean isNeutralActiveDrop = getEntityProperty(e, "m_bIsNeutralActiveDrop", null);
            Boolean isNeutralPassiveDrop = getEntityProperty(e, "m_bIsNeutralPassiveDrop", null);
            Integer neutralDropTeam = getEntityProperty(e, "m_nNeutralDropTeam", null);
            if ((neutralDropTeam != null && neutralDropTeam != 0) && ((isNeutralActiveDrop != null && isNeutralActiveDrop) || (isNeutralPassiveDrop != null && isNeutralPassiveDrop == true))) {
                Entry entry = new Entry(time);
                entry.type = "neutral_item_history";
                entry.slot = getPlayerSlotFromEntity(ctx, e);
                entry.key = entityName.substring("CDOTA_Item_".length());
                entry.isNeutralActiveDrop = isNeutralActiveDrop;
                entry.isNeutralPassiveDrop = isNeutralPassiveDrop;
                // System.out.println(new Gson().toJson(entry));
                output(entry);
            }
        }
    }

    @OnEntityPropertyChanged(
            classPattern = ".*",
            propertyPattern = ".*(m_lifeState|m_iTaggedAsVisibleByTeam|m_iDayTimeVisionRange|m_iNightTimeVisionRange|m_nFoWTeam|m_fRevealRadius|m_hOwnerEntity|m_hOwnerNPC|m_nPlayerOwnerID|m_iPlayerOwnerID).*"
    )
    public void onTrackedUnitPropertyChanged(Context ctx, Entity entity, FieldPath fieldPath) {
        String property = entity.getDtClass().getNameForFieldPath(fieldPath);
        String eventType = property.contains("m_iTaggedAsVisibleByTeam") ? "visibility" : "unit_state";
        emitTrackedUnit(ctx, entity, eventType, property);
    }

    @OnEntityLeft
    public void onEntityLeft(Context ctx, Entity entity) {
        emitTrackedUnit(ctx, entity, "unit_left", null);
    }

    private void emitTrackedUnit(Context ctx, Entity entity, String eventType, String property) {
        if (doBlob || !unitEventsEnabled || entity == null) {
            return;
        }
        String category = SchemaProbe.classifyEntity(entity.getDtClass().getDtName());
        if (!SchemaProbe.isTrackedUnit(category)) {
            return;
        }
        Entry entry = buildUnitEntry(ctx, entity, eventType, category);
        entry.event = property;
        output(entry);
    }

    private Entry buildUnitEntry(Context ctx, Entity entity, String eventType, String category) {
        Entry entry = new Entry(time);
        entry.type = eventType;
        entry.unit = entity.getDtClass().getDtName();
        entry.unit_kind = category;
        entry.ehandle = entity.getHandle();
        entry.entity_index = entity.getIndex();
        entry.x = getEntityCoordinate(entity, "X");
        entry.y = getEntityCoordinate(entity, "Y");
        entry.z = getEntityCoordinate(entity, "Z");
        entry.team = firstIntegerProperty(entity, "m_iTeamNum", "m_nTeamNum");
        entry.life_state = firstIntegerProperty(entity, "m_lifeState");
        entry.hp = firstFloatProperty(entity, "m_iHealth", "m_flHealth");
        entry.max_hp = firstFloatProperty(entity, "m_iMaxHealth", "m_flMaxHealth", "m_flBaseMaxHealth");
        entry.mana = firstFloatProperty(entity, "m_flMana", "m_iMana");
        entry.max_mana = firstFloatProperty(entity, "m_flMaxMana", "m_iMaxMana", "m_flBaseMaxMana");
        entry.move_speed = firstIntegerProperty(entity, "m_iMoveSpeed");
        entry.visible_by_team = firstIntegerProperty(entity, "m_iTaggedAsVisibleByTeam");
        entry.day_vision_range = firstIntegerProperty(entity, "m_iDayTimeVisionRange");
        entry.night_vision_range = firstIntegerProperty(entity, "m_iNightTimeVisionRange");
        entry.fow_team = firstIntegerProperty(entity, "m_nFoWTeam");
        entry.reveal_radius = firstFloatProperty(entity, "m_fRevealRadius");
        entry.selection_ring_visible = firstBooleanProperty(entity, "m_bSelectionRingVisible");
        entry.owner_ehandle = firstIntegerProperty(entity, "m_hOwnerEntity", "m_hOwnerNPC");
        if (entry.owner_ehandle != null) {
            Entity owner = ctx.getProcessor(Entities.class).getByHandle(entry.owner_ehandle);
            entry.owner_slot = getPlayerSlotFromEntity(ctx, owner);
        }
        if (entry.owner_slot == null) {
            entry.owner_slot = firstIntegerProperty(entity, "m_nPlayerOwnerID", "m_iPlayerOwnerID");
        }
        return entry;
    }

    @OnMessage(CNETMsg_Tick.class)
    public void onMessage(CNETMsg_Tick message) {
        serverTick = message.getTick();
    }

    @UsesStringTable("EntityNames")
    @UsesEntities
    @OnTickStart
    public void onTickStart(Context ctx, boolean synthetic) {
        serverTick = ctx.getTick();
        /*
         * Iterator<Entity> cosmetics =
         * ctx.getProcessor(Entities.class).getAllByDtName("CDOTAWearableItem");
         * while ( cosmetics.hasNext() )
         * {
         * Entity e = cosmetics.next();
         * Integer accountId = getEntityProperty(e, "m_iAccountID", null);
         * Integer itemDefinitionIndex = getEntityProperty(e, "m_iItemDefinitionIndex",
         * null);
         * if (itemDefinitionIndex == 7559)
         * {
         * System.err.format("%s,%s\n", accountId, itemDefinitionIndex);
         * }
         * }
         */

        // TODO check engine to decide whether to use s1 or s2 entities
        // ctx.getEngineType()

        // s1 DT_DOTAGameRulesProxy
        Entity grp = ctx.getProcessor(Entities.class).getByDtName("CDOTAGamerulesProxy");
        Entity pr = ctx.getProcessor(Entities.class).getByDtName("CDOTA_PlayerResource");
        Entity dData = ctx.getProcessor(Entities.class).getByDtName("CDOTA_DataDire");
        Entity rData = ctx.getProcessor(Entities.class).getByDtName("CDOTA_DataRadiant");

        // Create draftStage variable
        Integer draftStage = getEntityProperty(grp, "m_pGameRules.m_nGameState", null);

        if (grp != null) {
            // System.err.println(grp);
            // dota_gamerules_data.m_iGameMode = 22
            // dota_gamerules_data.m_unMatchID64 = 1193091757
            Float oldTime = getEntityProperty(grp, "m_pGameRules.m_fGameTime", null);
            if (oldTime == null) {
                // 7.32e on, need to calculate time manually
                Boolean paused = getEntityProperty(grp, "m_pGameRules.m_bGamePaused", null);
                boolean isPaused = Boolean.TRUE.equals(paused);
                Integer pauseStartTick = getEntityProperty(grp, "m_pGameRules.m_nPauseStartTick", null);
                Integer totalPausedTicks = getEntityProperty(grp, "m_pGameRules.m_nTotalPausedTicks", null);
                int timeTick = isPaused && pauseStartTick != null ? pauseStartTick : serverTick;
                int pausedTicks = totalPausedTicks == null ? 0 : totalPausedTicks;
                currentGameTimeMs = Math.round((timeTick - pausedTicks) * ctx.getMillisPerTick());
                time = Math.round(currentGameTimeMs / 1000.0f);

                // Tracking game pauses
                if (isPaused && !wasPaused) {
                    // Game just got paused
                    pauseStartTime = timeTick;
                    pauseStartGameTime = time;
                    pauseStartGameTimeMs = currentGameTimeMs;
                    wasPaused = true;
                } else if (!isPaused && wasPaused) {
                    // Game just got unpaused
                    long pauseDurationMs = Math.round((timeTick - pauseStartTime) * ctx.getMillisPerTick());
                    if (pauseDurationMs > 0) {
                        Entry pauseEntry = new Entry(pauseStartGameTime);
                        pauseEntry.type = "game_paused";
                        pauseEntry.key = "pause_duration";
                        pauseEntry.value = Math.round(pauseDurationMs / 1000.0f);
                        pauseEntry.raw_game_time_ms = pauseStartGameTimeMs;
                        output(pauseEntry);
                    }
                    wasPaused = false;
                }

            } else {
                currentGameTimeMs = Math.round(oldTime * 1000.0f);
                time = Math.round(oldTime);
            }
            gameTimeByDemoTick.put(serverTick, currentGameTimeMs);
            while (gameTimeByDemoTick.size() > 12_000) gameTimeByDemoTick.pollFirstEntry();
            // alternate to combat log for getting game zero time (looks like this is set at
            // the same time as the game start, so it's not any better for streaming)
            // Some replays don't have the combat log event for some reason so also do this
            // here
            Float rawGameStartTime = getEntityProperty(grp, "m_pGameRules.m_flGameStartTime", null);
            long currGameStartTimeMs = rawGameStartTime == null ? 0 : Math.round(rawGameStartTime * 1000.0f);
            if (gameStartTimeMs == 0 && currGameStartTimeMs != 0) {
                gameStartTimeMs = currGameStartTimeMs;
                gameStartTime = Math.round(currGameStartTimeMs / 1000.0f);
                flushLogBuffer();
            }
            if (draftStage == 2) {

                // determine the time the draftings start
                if (!isDraftStartTimeProcessed) {
                    Long iPlayerIDsInControl = getEntityProperty(grp, "m_pGameRules.m_iPlayerIDsInControl", null);
                    boolean isDraftStarted = iPlayerIDsInControl.compareTo(Long.valueOf(0)) != 0;
                    if (isDraftStarted) {
                        Entry draftStartEntry = new Entry(time);
                        draftStartEntry.type = "draft_start";
                        output(draftStartEntry);
                        isDraftStartTimeProcessed = true;
                    }
                }

                // Picks and ban are not in order due to draft change rules changes between
                // patches
                // Need to listen for the picks and ban to change
                int[] draftHeroes = new int[24];
                draftHeroes[0] = getEntityProperty(grp, "m_pGameRules.m_BannedHeroes.0000", null);
                draftHeroes[1] = getEntityProperty(grp, "m_pGameRules.m_BannedHeroes.0001", null);
                draftHeroes[2] = getEntityProperty(grp, "m_pGameRules.m_BannedHeroes.0002", null);
                draftHeroes[3] = getEntityProperty(grp, "m_pGameRules.m_BannedHeroes.0003", null);
                draftHeroes[4] = getEntityProperty(grp, "m_pGameRules.m_BannedHeroes.0004", null);
                draftHeroes[5] = getEntityProperty(grp, "m_pGameRules.m_BannedHeroes.0005", null);
                draftHeroes[6] = getEntityProperty(grp, "m_pGameRules.m_BannedHeroes.0006", null);
                draftHeroes[7] = getEntityProperty(grp, "m_pGameRules.m_BannedHeroes.0007", null);
                draftHeroes[8] = getEntityProperty(grp, "m_pGameRules.m_BannedHeroes.0008", null);
                draftHeroes[9] = getEntityProperty(grp, "m_pGameRules.m_BannedHeroes.0009", null);
                // Apparently Drafts go to 6 bans now, but have returns of null
                draftHeroes[10] = getEntityProperty(grp, "m_pGameRules.m_BannedHeroes.0010", null) == null ? 0
                        : getEntityProperty(grp, "m_pGameRules.m_BannedHeroes.0010", null);
                draftHeroes[11] = getEntityProperty(grp, "m_pGameRules.m_BannedHeroes.0011", null) == null ? 0
                        : getEntityProperty(grp, "m_pGameRules.m_BannedHeroes.0011", null);
                draftHeroes[12] = getEntityProperty(grp, "m_pGameRules.m_BannedHeroes.0012", null) == null ? 0
                        : getEntityProperty(grp, "m_pGameRules.m_BannedHeroes.0012", null);
                draftHeroes[13] = getEntityProperty(grp, "m_pGameRules.m_BannedHeroes.0013", null) == null ? 0
                        : getEntityProperty(grp, "m_pGameRules.m_BannedHeroes.0013", null);
                draftHeroes[14] = getEntityProperty(grp, "m_pGameRules.m_SelectedHeroes.0000", null);
                draftHeroes[15] = getEntityProperty(grp, "m_pGameRules.m_SelectedHeroes.0001", null);
                draftHeroes[16] = getEntityProperty(grp, "m_pGameRules.m_SelectedHeroes.0002", null);
                draftHeroes[17] = getEntityProperty(grp, "m_pGameRules.m_SelectedHeroes.0003", null);
                draftHeroes[18] = getEntityProperty(grp, "m_pGameRules.m_SelectedHeroes.0004", null);
                draftHeroes[19] = getEntityProperty(grp, "m_pGameRules.m_SelectedHeroes.0005", null);
                draftHeroes[20] = getEntityProperty(grp, "m_pGameRules.m_SelectedHeroes.0006", null);
                draftHeroes[21] = getEntityProperty(grp, "m_pGameRules.m_SelectedHeroes.0007", null);
                draftHeroes[22] = getEntityProperty(grp, "m_pGameRules.m_SelectedHeroes.0008", null);
                draftHeroes[23] = getEntityProperty(grp, "m_pGameRules.m_SelectedHeroes.0009", null);
                // Once a pick or ban happens grab the time and extra time remaining for both
                // teams
                for (int i = 0; i < draftHeroes.length; i++) {
                    if (draftHeroes[i] > 0 && draftOrderProcessed[i] == false) {
                        // used to check for new bans and picks
                        draftOrderProcessed[i] = true;
                        Entry draftTimingsEntry = new Entry(time);
                        draftTimingsEntry.type = "draft_timings";
                        draftTimingsEntry.draft_order = order;
                        order = order + 1;
                        draftTimingsEntry.pick = i >= 14;
                        draftTimingsEntry.hero_id = draftHeroes[i];
                        draftTimingsEntry.draft_active_team = getEntityProperty(grp, "m_pGameRules.m_iActiveTeam",
                                null);
                        draftTimingsEntry.draft_extime0 = Math
                                .round((float) getEntityProperty(grp, "m_pGameRules.m_fExtraTimeRemaining.0000", null));
                        draftTimingsEntry.draft_extime1 = Math
                                .round((float) getEntityProperty(grp, "m_pGameRules.m_fExtraTimeRemaining.0001", null));
                        output(draftTimingsEntry);
                    }
                }
            }
            // initialize nextInterval value
            if (nextInterval == 0) {
                nextInterval = time;
            }
        }
        if (pr != null) {
            // Radiant coach shows up in vecPlayerTeamData as position 5
            // all the remaining dire entities are offset by 1 and so we miss reading the
            // last one and don't get data for the first dire player
            // coaches appear to be on team 1, radiant is 2 and dire is 3?
            // construct an array of valid indices to get vecPlayerTeamData from
            if (!init) {
                int added = 0;
                int i = 0;
                boolean hasWaitingForDraftPlayers = false;
                ArrayList<Entry> playerEntries = new ArrayList<Entry>();
                // according to @Decoud Valve seems to have fixed this issue and players should
                // be in first 10 slots again
                // sanity check of i to prevent infinite loop when <10 players?
                while (added < numPlayers && i < 30) {
                    try {
                        // check each m_vecPlayerData to ensure the player's team is radiant or dire
                        int playerTeam = getEntityProperty(pr, "m_vecPlayerData.%i.m_iPlayerTeam", i);
                        int teamSlot = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_iTeamSlot", i);
                        Long steamid = getEntityProperty(pr, "m_vecPlayerData.%i.m_iPlayerSteamID", i);
                        // System.err.format("%s %s %s: %s\n", i, playerTeam, teamSlot, steamid);
                        if (playerTeam == 2 || playerTeam == 3) {
                            // output the player_slot based on team and teamslot
                            Entry entry = new Entry(time);
                            entry.type = "player_slot";
                            entry.key = String.valueOf(added);
                            entry.value = (playerTeam == 2 ? 0 : 128) + teamSlot;
                            playerEntries.add(entry);
                            // add it to validIndices, add 1 to added
                            validIndices[added] = i;
                            added += 1;
                            slot_to_playerslot.put(added, entry.value);
                            steamid_to_playerslot.put(steamid, entry.value);
                        } else if (playerTeam == 14) {
                            // 7.33 player waiting to be drafted onto a team
                            hasWaitingForDraftPlayers = true;
                            break;
                        }
                    } catch (Exception e) {
                        // swallow the exception when an unexpected number of players (!=10)
                        // System.err.println(e);
                    }

                    i += 1;
                }
                if (!hasWaitingForDraftPlayers) {
                    for (int j = 0; j < playerEntries.size(); j++) {
                        output(playerEntries.get(j));
                    }
                    init = true;
                }
            }

            if (init && !postGame && time >= nextInterval) {
                // System.err.println(pr);
                for (int i = 0; i < numPlayers; i++) {
                    Integer hero = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_nSelectedHeroID", validIndices[i]);
                    int handle = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_hSelectedHero", validIndices[i]);
                    int playerTeam = getEntityProperty(pr, "m_vecPlayerData.%i.m_iPlayerTeam", validIndices[i]);
                    int teamSlot = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_iTeamSlot", validIndices[i]);

                    // facet/variant format and key location changed in 7.39, leaving this as a fallback
                    Integer variant = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_nSelectedHeroVariant", validIndices[i]);
                    Integer facet_hero_id = null;

                    // 2 is radiant, 3 is dire, 1 is other?
                    Entity dataTeam = playerTeam == 2 ? rData : dData;

                    Entry entry = new Entry(time);
                    entry.type = "interval";
                    entry.slot = i;
                    entry.repicked = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_bHasRepicked", validIndices[i]);
                    entry.randomed = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_bHasRandomed", validIndices[i]);
                    entry.pred_vict = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_bHasPredictedVictory",
                            validIndices[i]);
                    entry.firstblood_claimed = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_iFirstBloodClaimed",
                            validIndices[i]);
                    Float participation = getEntityProperty(pr,
                            "m_vecPlayerTeamData.%i.m_flTeamFightParticipation", validIndices[i]);
                    if (participation != null && participation != Float.POSITIVE_INFINITY) {
                        entry.teamfight_participation = participation;
                    }
                    entry.level = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_iLevel", validIndices[i]);
                    entry.kills = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_iKills", validIndices[i]);
                    entry.deaths = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_iDeaths", validIndices[i]);
                    entry.assists = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_iAssists", validIndices[i]);
                    entry.denies = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_iDenyCount", teamSlot);
                    entry.obs_placed = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_iObserverWardsPlaced", teamSlot);
                    entry.sen_placed = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_iSentryWardsPlaced", teamSlot);
                    entry.creeps_stacked = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_iCreepsStacked", teamSlot);
                    entry.camps_stacked = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_iCampsStacked", teamSlot);
                    entry.rune_pickups = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_iRunePickups", teamSlot);
                    entry.towers_killed = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_iTowerKills", teamSlot);
                    entry.roshans_killed = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_iRoshanKills", teamSlot);
                    entry.observers_placed = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_iObserverWardsPlaced",
                            teamSlot);
                    entry.networth = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_iNetWorth", teamSlot);
                    entry.stage = draftStage;

                    if (teamSlot >= 0) {
                        entry.gold = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_iTotalEarnedGold", teamSlot);
                        entry.lh = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_iLastHitCount", teamSlot);
                        entry.xp = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_iTotalEarnedXP", teamSlot);
                        entry.stuns = getEntityProperty(dataTeam, "m_vecDataTeam.%i.m_fStuns", teamSlot);
                    }

                    // TODO: gem, rapier time?
                    // need to dump inventory items for each player and possibly keep track of item
                    // entity handles

                    // get the player's hero entity
                    Entity e = ctx.getProcessor(Entities.class).getByHandle(handle);
                    // get the hero's coordinates
                    if (e != null) {
                        entry.team = playerTeam;
                        entry.ehandle = e.getHandle();
                        entry.entity_index = e.getIndex();
                        entry.hp = firstFloatProperty(e, "m_iHealth", "m_flHealth");
                        entry.max_hp = firstFloatProperty(e, "m_iMaxHealth", "m_flMaxHealth");
                        entry.mana = firstFloatProperty(e, "m_flMana", "m_iMana");
                        entry.max_mana = firstFloatProperty(e, "m_flMaxMana", "m_iMaxMana");
                        entry.move_speed = firstIntegerProperty(e, "m_iMoveSpeed");
                        entry.visible_by_team = firstIntegerProperty(e, "m_iTaggedAsVisibleByTeam");
                        entry.day_vision_range = firstIntegerProperty(e, "m_iDayTimeVisionRange");
                        entry.night_vision_range = firstIntegerProperty(e, "m_iNightTimeVisionRange");
                        entry.fow_team = firstIntegerProperty(e, "m_nFoWTeam");
                        entry.reveal_radius = firstFloatProperty(e, "m_fRevealRadius");
                        entry.selection_ring_visible = firstBooleanProperty(e, "m_bSelectionRingVisible");
                        // System.err.println(e);
                        //CBodyComponent.m_cell[XY] * 128 + CBodyComponent.m_vec[XY]
                        Integer cx = getEntityProperty(e, "CBodyComponent.m_cellX", null);
                        Integer cy = getEntityProperty(e, "CBodyComponent.m_cellY", null);
                        Integer cz = getEntityProperty(e, "CBodyComponent.m_cellZ", null);

                        Float vx = getEntityProperty(e, "CBodyComponent.m_vecX", null);
                        Float vy = getEntityProperty(e, "CBodyComponent.m_vecY", null);
                        Float vz = getEntityProperty(e, "CBodyComponent.m_vecZ", null);
                        
                        if (cx != null && cy != null) {
                            entry.x = getPreciseLocation(cx,vx);
                            entry.y = getPreciseLocation(cy,vy);
                        }
                        if (cz != null && vz != null) {
                            entry.z = getPreciseLocation(cz, vz);
                        }

                        // post-7.39 format for facets is a 128bit number, where last 32 bits represent the variant
                        // and the first 32 bits represent the hero id, which acts as the source for the facet
                        // (same as hero_id in all cases, except ability draft)
                        // 0xHHHH00000000VVVV
                        Long facet_key = getEntityProperty(e, "m_iHeroFacetKey", null);
                        if (facet_key != null) {
                            facet_hero_id = (int) (facet_key >> (4 * 8));
                            variant = (int) (facet_key & 0xFF);
                        }

                        // System.err.format("%s, %s\n", entry.x, entry.y);
                        // get the hero's entity name, ex: CDOTA_Hero_Zuus
                        entry.unit = e.getDtClass().getDtName();
                        entry.hero_id = hero;
                        entry.variant = variant;
                        entry.facet_hero_id = facet_hero_id;
                        entry.life_state = getEntityProperty(e, "m_lifeState", null);
                        // check if hero has been assigned to entity
                        if (hero > 0) {
                            // get the hero's entity name, ex: CDOTA_Hero_Zuus
                            String unit = e.getDtClass().getDtName();
                            // grab the end of the name, lowercase it
                            String ending = unit.substring("CDOTA_Unit_Hero_".length());
                            // valve is bad at consistency and the combat log name could involve replacing
                            // camelCase with _ or not!
                            // double map it so we can look up both cases
                            String combatLogName = "npc_dota_hero_" + ending.toLowerCase();
                            // don't include final underscore here since the first letter is always
                            // capitalized and will be converted to underscore
                            String combatLogName2 = "npc_dota_hero" + ending.replaceAll("([A-Z])", "_$1").toLowerCase();
                            // System.err.format("%s, %s, %s\n", unit, combatLogName, combatLogName2);
                            // populate for combat log mapping
                            name_to_slot.put(combatLogName, entry.slot);
                            name_to_slot.put(combatLogName2, entry.slot);

                            abilities = getHeroAbilities(ctx, e);
                            entry.hero_abilities = abilities;
                            for (AbilityState ability : abilities) {
                                // Only push ability updates when the level changes
                                String abilityKey = combatLogName + ability.id;
                                if (!Objects.equals(abilities_tracking.get(abilityKey), ability.ability_level)) {
                                    Entry abilitiesEntry = new Entry(time);
                                    abilitiesEntry.type = "DOTA_ABILITY_LEVEL";
                                    abilitiesEntry.targetname = combatLogName;
                                    abilitiesEntry.valuename = ability.id;
                                    abilitiesEntry.abilitylevel = ability.ability_level;
                                    // We use the combatLogName & the ability id as some ability IDs are the same
                                    abilities_tracking.put(abilityKey, ability.ability_level);
                                    output(abilitiesEntry);
                                }
                            }

                            entry.hero_inventory = getHeroInventory(ctx, e);
                            if (time - gameStartTime - 1 == 0) {
                                for (Item item : entry.hero_inventory) {
                                    Entry startingItems = new Entry(time);
                                    startingItems.type = "STARTING_ITEM";
                                    startingItems.targetname = combatLogName;
                                    startingItems.valuename = item.id;
                                    startingItems.slot = entry.slot;
                                    startingItems.value = (entry.slot < 5 ? 0 : 123) + entry.slot;
                                    startingItems.itemslot = item.slot;
                                    startingItems.charges = item.num_charges;
                                    startingItems.secondary_charges = item.num_secondary_charges;
                                    output(startingItems);
                                }
                            }
                            if (!isPlayerStartingItemsWritten.get(entry.slot) && entry.hero_inventory != null) {
                                // Making something similar to DOTA_COMBATLOG_PURCHASE for each item in the
                                // beginning of the game
                                isPlayerStartingItemsWritten.set(entry.slot, true);
                                for (Item item : entry.hero_inventory) {
                                    Entry startingItemsEntry = new Entry(time);
                                    startingItemsEntry.type = "DOTA_COMBATLOG_PURCHASE";
                                    startingItemsEntry.slot = entry.slot;
                                    startingItemsEntry.value = (entry.slot < 5 ? 0 : 123) + entry.slot;
                                    startingItemsEntry.valuename = item.id;
                                    startingItemsEntry.targetname = combatLogName;
                                    startingItemsEntry.charges = item.num_charges;
                                    output(startingItemsEntry);
                                }
                            }
                        }
                    }
                    output(entry);
                }
                nextInterval += INTERVAL;
            }

            // When the game is over, get dota plus levels
            if (postGame && !isDotaPlusProcessed) {
                for (int i = 0; i < numPlayers; i++) {
                    int xp = getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_unSelectedHeroBadgeXP", i) == null ? 0
                            : getEntityProperty(pr, "m_vecPlayerTeamData.%i.m_unSelectedHeroBadgeXP", i);
                    Long steamid = getEntityProperty(pr, "m_vecPlayerData.%i.m_iPlayerSteamID", i);
                    if (steamid_to_playerslot.containsKey(steamid)) {
                        int playerslot = steamid_to_playerslot.get(steamid);
                        dotaplusxpMap.put(playerslot, xp);
                    }
                }
                isDotaPlusProcessed = true;
            }
        }
    }

    private List<Item> getHeroInventory(Context ctx, Entity eHero) {
        List<Item> inventoryList = new ArrayList<>(20);

        for (int i = 0; i < 20; i++) {
            String property = "m_hItems." + Util.arrayIdxToString(i);
            if (!eHero.hasProperty(property)) {
                continue;
            }
            try {
                Item item = getHeroItem(ctx, eHero, i);
                if (item != null) {
                    inventoryList.add(item);
                }
            } catch (Exception e) {
                // System.err.println(e);
            }
        }

        return inventoryList;
    }

    private List<AbilityState> getHeroAbilities(Context ctx, Entity eHero) {
        List<AbilityState> abilityList = new ArrayList<>(32);
        for (int i = 0; i < 32; i++) {
            try {
                AbilityState ability = getHeroAbilities(ctx, eHero, i);
                if (ability != null) {
                    abilityList.add(ability);
                }
            } catch (Exception e) {
                // System.err.println(e);
            }
        }
        return abilityList;
    }

    /**
     * Uses "EntityNames" string table and Entities processor
     * 
     * @param ctx   Context
     * @param eHero Hero entity
     * @param idx   inventory, backpack, stash and special inventory slots
     * @return {@code null} - empty slot. Throws @{@link UnknownItemFoundException}
     *         if item information can't be extracted
     */
    private Item getHeroItem(Context ctx, Entity eHero, int idx) throws UnknownItemFoundException {
        StringTable stEntityNames = ctx.getProcessor(StringTables.class).forName("EntityNames");
        Entities entities = ctx.getProcessor(Entities.class);

        Integer hItem = eHero.getProperty("m_hItems." + Util.arrayIdxToString(idx));
        if (hItem == null || hItem == 0xFFFFFF) {
            return null;
        }
        Entity eItem = entities.getByHandle(hItem);
        if (eItem == null) {
            throw new UnknownItemFoundException(String.format("Can't find item by its handle (%d)", hItem));
        }
        Integer itemNameIdx = getAbilityEntityStringTableIndex(eItem);
        if (itemNameIdx == null) {
            throw new UnknownItemFoundException("Can't read item name string table index from entity");
        }
        String itemName = stEntityNames.getNameByIndex(itemNameIdx);
        if (itemName == null) {
            throw new UnknownItemFoundException("Can't get item name from EntityName string table");
        }

        Item item = new Item();
        item.id = itemName;
        item.ehandle = hItem;
        item.slot = idx;
        Integer numCharges = firstIntegerProperty(eItem, "m_iCurrentCharges", "m_nAbilityCurrentCharges");
        if (numCharges != null && numCharges != 0) {
            item.num_charges = numCharges;
        }
        Integer numSecondaryCharges = firstIntegerProperty(eItem, "m_iSecondaryCharges");
        if (numSecondaryCharges != null && numSecondaryCharges != 0) {
            item.num_secondary_charges = numSecondaryCharges;
        }
        item.cooldown = firstFloatProperty(eItem, "m_fCooldown", "m_flCooldown", "m_flCooldownRemaining");
        item.cooldown_length = firstFloatProperty(eItem, "m_flCooldownLength", "m_fCooldownLength");
        return item;
    }

    /**
     * Uses "EntityNames" string table and Entities processor
     * 
     * @param ctx   Context
     * @param eHero Hero entity
     * @param idx   0-31 = Hero abilities including talents and special event items
     * @return {@code null} - empty slot. Throws @{@link UnknownItemFoundException}
     *         if item information can't be extracted
     */
    private AbilityState getHeroAbilities(Context ctx, Entity eHero, int idx) throws UnknownAbilityFoundException {
        StringTable stEntityNames = ctx.getProcessor(StringTables.class).forName("EntityNames");
        Entities entities = ctx.getProcessor(Entities.class);

        Integer hAbility;
        if (eHero.hasProperty("m_hAbilities." + Util.arrayIdxToString(idx))) {
            hAbility = eHero.getProperty("m_hAbilities." + Util.arrayIdxToString(idx));
        } else if (eHero.hasProperty("m_vecAbilities." + Util.arrayIdxToString(idx))) {
            hAbility = eHero.getProperty("m_vecAbilities." + Util.arrayIdxToString(idx));
        } else {
            hAbility = 0xFFFFFF;
        }
        
        if (hAbility == 0xFFFFFF) {
            return null;
        }
        
        Entity eAbility = entities.getByHandle(hAbility);
        if (eAbility == null) {
            throw new UnknownAbilityFoundException(String.format("Can't find ability by its handle (%d)", hAbility));
        }
        Integer stringTableIdx = getAbilityEntityStringTableIndex(eAbility);
        if (stringTableIdx == null) {
            throw new UnknownAbilityFoundException("Can't read ability name string table index from entity");
        }
        String abilityName = stEntityNames.getNameByIndex(stringTableIdx);
        if (abilityName == null) {
            throw new UnknownAbilityFoundException("Can't get ability name from EntityName string table");
        }

        AbilityState ability = new AbilityState();
        ability.id = abilityName;
        ability.ehandle = hAbility;
        ability.ability_level = firstIntegerProperty(eAbility, "m_iLevel");
        ability.cooldown = firstFloatProperty(eAbility, "m_fCooldown", "m_flCooldown", "m_flCooldownRemaining");
        ability.cooldown_length = firstFloatProperty(eAbility, "m_flCooldownLength", "m_fCooldownLength");
        ability.current_charges = firstIntegerProperty(eAbility, "m_nAbilityCurrentCharges", "m_iCurrentCharges");
        ability.mana_cost = firstIntegerProperty(eAbility, "m_iManaCost");
        ability.cast_range = firstFloatProperty(eAbility, "m_iCastRange", "m_nCastRange", "m_flCastRange");

        return ability;
    }

    private Integer getAbilityEntityStringTableIndex(Entity e) {
        Integer idx = getEntityProperty(e, "m_pEntity.m_nameStringTableIndex", null);
        if (idx == null) {
            return getEntityProperty(e, "m_pEntity.m_nameStringableIndex", null);
        }
        return idx;
    }

    private Object firstEntityProperty(Entity entity, String... properties) {
        for (String property : properties) {
            Object value = getEntityProperty(entity, property, null);
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private Integer firstIntegerProperty(Entity entity, String... properties) {
        Object value = firstEntityProperty(entity, properties);
        return value instanceof Number number ? number.intValue() : null;
    }

    private Float firstFloatProperty(Entity entity, String... properties) {
        Object value = firstEntityProperty(entity, properties);
        return value instanceof Number number ? number.floatValue() : null;
    }

    private Boolean firstBooleanProperty(Entity entity, String... properties) {
        Object value = firstEntityProperty(entity, properties);
        return value instanceof Boolean bool ? bool : null;
    }

    private Float getEntityCoordinate(Entity entity, String axis) {
        Integer cell = firstIntegerProperty(entity, "CBodyComponent.m_cell" + axis);
        Float vector = firstFloatProperty(entity, "CBodyComponent.m_vec" + axis);
        if (cell == null || vector == null) {
            return null;
        }
        return getPreciseLocation(cell, vector);
    }

    private final Object fpAbsent = new Object();
    private final IdentityHashMap<DTClass, HashMap<String, Object>> fpCache = new IdentityHashMap<>();

    public <T> T getEntityProperty(Entity e, String property, Integer idx) {
        try {
            if (e == null) {
                return null;
            }
            if (idx != null) {
                property = property.replace("%i", Util.arrayIdxToString(idx));
            }
            DTClass dt = e.getDtClass();
            HashMap<String, Object> perClass = fpCache.get(dt);
            if (perClass == null) {
                perClass = new HashMap<>();
                fpCache.put(dt, perClass);
            }
            Object cached = perClass.get(property);
            if (cached == null) {
                FieldPath resolved = dt.getFieldPathForName(property);
                cached = resolved == null ? fpAbsent : resolved;
                perClass.put(property, cached);
            }
            if (cached == fpAbsent) {
                return null;
            }
            return e.getPropertyForFieldPath((FieldPath) cached);
        } catch (Exception ex) {
            return null;
        }
    }

    @OnWardKilled
    public void onWardKilled(Context ctx, Entity e, String killerHeroName) {
        Entry wardEntry = buildWardEntry(ctx, e);
        wardEntry.attackername = killerHeroName;
        finishWard(wardEntry, "killed");
        output(wardEntry);
    }

    @OnWardExpired
    @OnWardPlaced
    public void onWardExistenceChanged(Context ctx, Entity e) {
        Entry wardEntry = buildWardEntry(ctx, e);
        if (Boolean.TRUE.equals(wardEntry.entityleft)) {
            finishWard(wardEntry, "expired");
        } else {
            ward_placed_time_ms.put(wardEntry.ehandle, currentGameTimeMs);
            if (wardEntry.owner_slot != null) {
                ward_ehandle_to_slot.put(wardEntry.ehandle, wardEntry.owner_slot);
            }
        }
        output(wardEntry);
    }

    private Entry buildWardEntry(Context ctx, Entity e) {
        Entry entry = new Entry(time);
        boolean isObserver = !e.getDtClass().getDtName().contains("TrueSight");

        Integer cx = getEntityProperty(e, "CBodyComponent.m_cellX", null);
        Integer cy = getEntityProperty(e, "CBodyComponent.m_cellY", null);
        Integer cz = getEntityProperty(e, "CBodyComponent.m_cellZ", null);

        Float vx = getEntityProperty(e, "CBodyComponent.m_vecX", null);
        Float vy = getEntityProperty(e, "CBodyComponent.m_vecY", null);
        Float vz = getEntityProperty(e, "CBodyComponent.m_vecZ", null);

        Integer life_state = getEntityProperty(e, "m_lifeState", null);

        if (cx != null && cy != null && cz != null) {
            entry.x = getPreciseLocation(cx,vx);
            entry.y = getPreciseLocation(cy,vy);
            entry.z = getPreciseLocation(cz,vz);
        }

        entry.type = isObserver ? "obs" : "sen";
        entry.entityleft = life_state == 1;
        entry.ehandle = e.getHandle();
        entry.entity_index = e.getIndex();
        entry.unit = e.getDtClass().getDtName();
        entry.unit_kind = isObserver ? "observer_ward" : "sentry_ward";
        entry.team = firstIntegerProperty(e, "m_iTeamNum");
        entry.life_state = life_state;
        entry.day_vision_range = firstIntegerProperty(e, "m_iDayTimeVisionRange");
        entry.night_vision_range = firstIntegerProperty(e, "m_iNightTimeVisionRange");
        entry.fow_team = firstIntegerProperty(e, "m_nFoWTeam");
        entry.reveal_radius = firstFloatProperty(e, "m_fRevealRadius");

        if (entry.entityleft) {
            entry.type += "_left";
        }

        Integer owner = getEntityProperty(e, "m_hOwnerEntity", null);
        entry.owner_ehandle = owner;
        Entity ownerEntity = owner == null ? null : ctx.getProcessor(Entities.class).getByHandle(owner);
        entry.owner_slot = getPlayerSlotFromEntity(ctx, ownerEntity);
        if (entry.owner_slot == null) {
            entry.owner_slot = ward_ehandle_to_slot.get(entry.ehandle);
        }
        entry.slot = entry.owner_slot;

        return entry;
    }

    private void finishWard(Entry entry, String reason) {
        entry.ward_end_reason = reason;
        entry.ward_end_reason_confidence = reason.equals("killed") ? 0.8f : 0.7f;
        Long placedAt = ward_placed_time_ms.remove(entry.ehandle);
        if (placedAt != null) {
            entry.ward_lifetime_ms = Math.max(0, currentGameTimeMs - placedAt);
            long naturalLifetime = entry.unit_kind.equals("observer_ward")
                    ? OBSERVER_WARD_NATURAL_LIFETIME_MS
                    : SENTRY_WARD_NATURAL_LIFETIME_MS;
            if (entry.ward_lifetime_ms >= naturalLifetime - WARD_EXPIRY_TOLERANCE_MS) {
                entry.ward_end_reason = "expired";
                entry.ward_end_reason_confidence = 1.0f;
            }
        }
        ward_ehandle_to_slot.remove(entry.ehandle);
    }
}
