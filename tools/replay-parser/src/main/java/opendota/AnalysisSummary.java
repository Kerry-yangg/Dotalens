package opendota;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

final class AnalysisSummary {
    static final String CURRENT_SCHEMA = "dota-lens/1.0";
    private static final String[] MATCH_FIELDS = {
            "match_id", "start_time", "duration", "game_mode", "lobby_type", "radiant_win",
            "radiant_score", "dire_score", "cluster", "version", "patch", "patch_name", "region",
            "replay_url", "metadata_source", "replay_match_id", "replay_end_time",
            "patch_resolution"
    };
    private static final String[] PLAYER_FIELDS = {
            "account_id", "player_slot", "hero_id", "personaname", "name", "kills", "deaths",
            "assists", "last_hits", "denies", "gold_per_min", "xp_per_min", "net_worth",
            "hero_damage", "hero_healing", "tower_damage", "level", "isRadiant", "win", "lose",
            "actions_per_min", "stuns", "teamfight_participation", "obs_placed", "sen_placed",
            "camps_stacked", "creeps_stacked", "rune_pickups", "tower_kills", "roshan_kills",
            "buyback_count", "gold_spent", "total_gold", "total_xp"
    };
    private static final Set<String> CORE_EVENT_FIELDS = Set.of(
            "type", "slot", "time", "demo_tick", "raw_game_time_ms", "game_time_ms",
            "event_seq", "visible_radiant", "visible_dire");
    private static final Set<String> FULL_ANALYSIS_TYPES = Set.of(
            "interval", "epilogue", "unit_enter", "unit_state", "unit_left", "visibility",
            "DOTA_COMBATLOG_PURCHASE", "DOTA_ABILITY_LEVEL",
            "DOTA_COMBATLOG_ITEM", "DOTA_COMBATLOG_ABILITY",
            "DOTA_COMBATLOG_GOLD", "DOTA_COMBATLOG_DEATH", "DOTA_COMBATLOG_DAMAGE",
            "DOTA_COMBATLOG_HEAL", "DOTA_COMBATLOG_MODIFIER_ADD",
            "DOTA_COMBATLOG_MODIFIER_REMOVE", "obs", "sen", "obs_left", "sen_left",
            "DOTA_COMBATLOG_TEAM_BUILDING_KILL", "CHAT_MESSAGE_ROSHAN_KILL",
            "CHAT_MESSAGE_AEGIS", "CHAT_MESSAGE_COURIER_LOST");

    private AnalysisSummary() {
    }

    static JsonObject build(Path rawJsonl, JsonObject matchDetail, long accountId) throws IOException {
        ReplayTimeNormalizer timeNormalizer = ReplayTimeNormalizer.scan(rawJsonl);
        Long suppliedMatchId = longValue(matchDetail, "match_id");
        JsonObject resolvedMatchDetail = ReplayMatchMetadata.enrich(
                rawJsonl, matchDetail, suppliedMatchId == null ? 0 : suppliedMatchId);
        Long replayMatchId = longValue(resolvedMatchDetail, "replay_match_id");
        if (suppliedMatchId != null && suppliedMatchId > 0 && replayMatchId != null
                && replayMatchId > 0 && !suppliedMatchId.equals(replayMatchId)) {
            throw new ReplayIdentityException(suppliedMatchId, replayMatchId);
        }
        JsonObject patchResolution = DotaPatchResolver.resolve(resolvedMatchDetail);
        resolvedMatchDetail.add("patch_resolution", patchResolution);
        JsonObject patchGates = patchResolution.getAsJsonObject("gates");
        boolean negativeScoringEnabled = patchGates != null
                && patchGates.has("negative_scoring")
                && patchGates.get("negative_scoring").getAsBoolean();
        ProductAnalysis productAnalysis = new ProductAnalysis(
                stringValue(resolvedMatchDetail, "patch_name", "unknown"),
                negativeScoringEnabled);
        Map<String, Long> eventCounts = new LinkedHashMap<>();
        Map<String, Long> clockCoverage = new LinkedHashMap<>();
        clockCoverage.put("demo_tick", 0L);
        clockCoverage.put("raw_game_time_ms", 0L);
        clockCoverage.put("game_time_ms", 0L);
        clockCoverage.put("event_seq", 0L);

        long totalLines = 0;
        long validLines = 0;
        long invalidLines = 0;
        long epilogueCount = 0;
        long visibilityAnchors = 0;
        long inventorySnapshots = 0;
        long abilitySnapshots = 0;
        Long firstSequence = null;
        Long lastSequence = null;
        long sequenceGaps = 0;
        Integer gameStart = null;
        Integer gameEnd = null;
        Long gameStartMs = null;
        Long gameEndMs = null;
        Set<Integer> intervalSlots = new LinkedHashSet<>();

        try (BufferedReader reader = Files.newBufferedReader(rawJsonl, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                totalLines++;
                if ((totalLines & 4095L) == 0L) checkInterrupted();
                if (line.isBlank()) {
                    invalidLines++;
                    continue;
                }
                JsonObject event;
                try {
                    String compactType = JsonLineProjection.compactType(line);
                    if (FULL_ANALYSIS_TYPES.contains(compactType)) {
                        JsonElement parsed = JsonParser.parseString(line);
                        if (!parsed.isJsonObject()) {
                            invalidLines++;
                            continue;
                        }
                        event = parsed.getAsJsonObject();
                    } else {
                        event = JsonLineProjection.parse(line, CORE_EVENT_FIELDS);
                    }
                } catch (RuntimeException error) {
                    invalidLines++;
                    continue;
                }
                validLines++;
                timeNormalizer.normalize(event);
                productAnalysis.accept(event);
                String type = stringValue(event, "type", "unknown");
                eventCounts.merge(type, 1L, Long::sum);
                if (type.equals("epilogue")) {
                    epilogueCount++;
                }
                for (String field : clockCoverage.keySet()) {
                    if (hasValue(event, field)) {
                        clockCoverage.compute(field, (ignored, count) -> count + 1);
                    }
                }
                Long sequence = longValue(event, "event_seq");
                if (sequence != null) {
                    if (firstSequence == null) {
                        firstSequence = sequence;
                    }
                    if (lastSequence != null && sequence != lastSequence + 1) {
                        sequenceGaps++;
                    }
                    lastSequence = sequence;
                }
                if (hasValue(event, "visible_radiant") || hasValue(event, "visible_dire")) {
                    visibilityAnchors++;
                }
                if (type.equals("interval")) {
                    Integer slot = integerValue(event, "slot");
                    Integer time = integerValue(event, "time");
                    Long timeMs = longValue(event, "game_time_ms");
                    if (slot != null) {
                        intervalSlots.add(slot);
                    }
                    if (time != null && time >= 0) {
                        gameStart = gameStart == null ? time : Math.min(gameStart, time);
                        gameEnd = gameEnd == null ? time : Math.max(gameEnd, time);
                    }
                    if (timeMs != null) {
                        gameStartMs = gameStartMs == null ? timeMs : Math.min(gameStartMs, timeMs);
                        gameEndMs = gameEndMs == null ? timeMs : Math.max(gameEndMs, timeMs);
                    }
                    if (arrayHasValues(event, "hero_inventory")) {
                        inventorySnapshots++;
                    }
                    if (arrayHasValues(event, "hero_abilities")) {
                        abilitySnapshots++;
                    }
                }
            }
        }

        Integer detailDuration = integerValue(resolvedMatchDetail, "duration");
        int matchDuration = detailDuration == null ? (gameEnd == null ? 1 : gameEnd) : detailDuration;
        boolean sequenceContiguous = firstSequence != null
                && lastSequence != null
                && sequenceGaps == 0
                && lastSequence - firstSequence + 1 == validLines;
        int timelineTolerance = Math.max(30, (int) Math.ceil(matchDuration * 0.02));
        boolean timelineComplete = gameStart != null && gameStart <= 5
                && gameEnd != null && gameEnd >= Math.max(0, matchDuration - timelineTolerance);
        checkInterrupted();
        JsonObject modules = productAnalysis.build(Math.max(gameEnd == null ? 1 : gameEnd, matchDuration));
        checkInterrupted();
        long invalidCoordinates = modules.getAsJsonObject("coordinate_system")
                .getAsJsonObject("diagnostics").get("invalid_total").getAsLong();
        boolean replayComplete = invalidLines == 0 && epilogueCount == 1
                && intervalSlots.size() == 10 && timelineComplete && sequenceContiguous;

        JsonObject summary = new JsonObject();
        summary.addProperty("schema", CURRENT_SCHEMA);
        summary.addProperty("generated_at", Instant.now().toString());
        summary.addProperty("account_id", accountId);
        summary.addProperty("complete", replayComplete);
        summary.addProperty("raw_file", rawJsonl.getFileName().toString());
        summary.addProperty("raw_bytes", Files.size(rawJsonl));
        summary.addProperty("total_lines", totalLines);
        summary.addProperty("valid_json_objects", validLines);
        summary.addProperty("invalid_lines", invalidLines);
        summary.addProperty("epilogue_count", epilogueCount);

        JsonObject countsJson = new JsonObject();
        eventCounts.forEach(countsJson::addProperty);
        summary.add("event_counts", countsJson);

        JsonObject clock = new JsonObject();
        JsonObject coverage = new JsonObject();
        clockCoverage.forEach(coverage::addProperty);
        clock.add("field_records", coverage);
        addNullable(clock, "first_event_seq", firstSequence);
        addNullable(clock, "last_event_seq", lastSequence);
        clock.addProperty("sequence_gaps", sequenceGaps);
        clock.addProperty("strictly_contiguous", sequenceContiguous);
        clock.add("time_alignment", timeNormalizer.diagnostics());
        summary.add("clock", clock);

        JsonObject timeline = new JsonObject();
        addNullable(timeline, "game_start", gameStart);
        addNullable(timeline, "game_end", gameEnd);
        addNullable(timeline, "game_start_ms", gameStartMs);
        addNullable(timeline, "game_end_ms", gameEndMs);
        timeline.addProperty("canonical_time_field", "game_time_ms");
        timeline.addProperty("interval_rows", eventCounts.getOrDefault("interval", 0L));
        timeline.addProperty("player_slots", intervalSlots.size());
        timeline.addProperty("inventory_snapshots", inventorySnapshots);
        timeline.addProperty("ability_snapshots", abilitySnapshots);
        summary.add("timeline", timeline);

        summary.add("integrity", buildIntegrity(invalidLines, epilogueCount, intervalSlots.size(),
                timelineComplete, sequenceContiguous, invalidCoordinates));

        JsonObject compactMatch = compactMatch(resolvedMatchDetail, accountId);
        PlayerReportAnalysis.enrich(modules, compactMatch, matchDuration);
        summary.add("match", compactMatch);
        summary.add("coverage", buildCoverage(eventCounts, visibilityAnchors, gameStart, gameEnd,
                intervalSlots.size(), invalidLines));
        summary.add("modules", modules);
        return summary;
    }

    private static void checkInterrupted() throws InterruptedIOException {
        if (!Thread.currentThread().isInterrupted()) return;
        InterruptedIOException error = new InterruptedIOException("Analysis summary canceled");
        error.bytesTransferred = 0;
        throw error;
    }

    static boolean isCurrent(JsonObject summary) {
        if (summary == null || !summary.has("schema")
                || !CURRENT_SCHEMA.equals(summary.get("schema").getAsString())
                || !summary.has("modules")) {
            return false;
        }
        JsonObject modules = summary.getAsJsonObject("modules");
        JsonObject players = modules.has("players") && modules.get("players").isJsonObject()
                ? modules.getAsJsonObject("players") : null;
        JsonObject storage = summary.has("analysis_storage") && summary.get("analysis_storage").isJsonObject()
                ? summary.getAsJsonObject("analysis_storage") : null;
        JsonObject moduleSchemas = storage != null && storage.has("module_schemas")
                && storage.get("module_schemas").isJsonObject()
                        ? storage.getAsJsonObject("module_schemas") : null;
        String storedPlayerSchema = moduleSchemas != null && moduleSchemas.has("players")
                ? moduleSchemas.get("players").getAsString() : null;
        boolean splitPlayersAvailable = storage != null
                && AnalysisStorage.STORAGE_SCHEMA.equals(stringValue(storage, "schema", ""))
                && storage.has("available_modules")
                && storage.get("available_modules").isJsonArray()
                && storage.getAsJsonArray("available_modules").contains(
                        new com.google.gson.JsonPrimitive("players"));
        boolean playersCurrent = players != null
                ? players.has("schema") && PlayerReportAnalysis.SCHEMA.equals(players.get("schema").getAsString())
                : storedPlayerSchema != null
                        ? PlayerReportAnalysis.SCHEMA.equals(storedPlayerSchema)
                        : splitPlayersAvailable;
        return modules.has("laning")
                && modules.has("schema")
                && ProductAnalysis.CURRENT_SCHEMA.equals(modules.get("schema").getAsString())
                && playersCurrent;
    }

    private static JsonObject compactMatch(JsonObject source, long accountId) {
        JsonObject target = new JsonObject();
        for (String field : MATCH_FIELDS) {
            copy(source, target, field);
        }
        JsonArray players = new JsonArray();
        Integer selectedSlot = null;
        JsonElement sourcePlayers = source.get("players");
        if (sourcePlayers != null && sourcePlayers.isJsonArray()) {
            for (JsonElement playerElement : sourcePlayers.getAsJsonArray()) {
                if (!playerElement.isJsonObject()) {
                    continue;
                }
                JsonObject sourcePlayer = playerElement.getAsJsonObject();
                JsonObject player = new JsonObject();
                for (String field : PLAYER_FIELDS) {
                    copy(sourcePlayer, player, field);
                }
                players.add(player);
                Long playerAccountId = longValue(sourcePlayer, "account_id");
                if (playerAccountId != null && playerAccountId == accountId) {
                    selectedSlot = integerValue(sourcePlayer, "player_slot");
                }
            }
        }
        target.add("players", players);
        addNullable(target, "selected_player_slot", selectedSlot);
        return target;
    }

    private static JsonArray buildCoverage(Map<String, Long> counts, long visibilityAnchors,
            Integer gameStart, Integer gameEnd, int intervalSlots, long invalidLines) {
        String range = gameStart == null || gameEnd == null ? "unknown" : gameStart + "-" + gameEnd + "s";
        long combat = counts.entrySet().stream()
                .filter(entry -> entry.getKey().startsWith("DOTA_COMBATLOG_"))
                .mapToLong(Map.Entry::getValue)
                .sum();
        long wards = counts.getOrDefault("obs", 0L) + counts.getOrDefault("sen", 0L);
        long units = counts.getOrDefault("unit_enter", 0L)
                + counts.getOrDefault("unit_left", 0L)
                + counts.getOrDefault("unit_state", 0L);

        JsonArray rows = new JsonArray();
        long intervals = counts.getOrDefault("interval", 0L);
        rows.add(coverageRow("interval", "Player snapshots", intervals, range,
                "1 second", "Replay interval", invalidLines > 0 ? "invalid"
                        : intervalSlots == 10 && intervals > 0 ? "available" : intervals > 0 ? "partial" : "missing",
                "fact", intervalSlots == 10 ? 99 : intervals > 0 ? 55 : 0,
                intervalSlots == 10 ? null : "ten_player_snapshots"));
        long actions = counts.getOrDefault("actions", 0L);
        rows.add(coverageRow("orders", "Player commands", actions, range,
                "event", "Unit orders", actions > 0 ? "available" : "missing",
                "fact", actions > 0 ? 96 : 0, actions > 0 ? null : "unit_orders"));
        rows.add(coverageRow("combat", "Combat events", combat, range,
                "event", "CombatLog", combat > 0 ? "available" : "missing",
                "fact", combat > 0 ? 98 : 0, combat > 0 ? null : "combat_log"));
        rows.add(coverageRow("units", "Unit lifecycle", units, range,
                "state change", "Replay entities", units > 0 ? "available" : "missing",
                "fact", units > 0 ? 94 : 0, units > 0 ? null : "unit_lifecycle"));
        rows.add(coverageRow("wards", "Ward lifecycle", wards, range,
                "event", "Replay entities", wards > 0 ? "available" : "missing",
                "fact", wards > 0 ? 96 : 0, wards > 0 ? null : "ward_lifecycle"));
        rows.add(coverageRow("vision", "Visibility anchors", visibilityAnchors, range,
                "combat event", "CombatLog", visibilityAnchors > 0 ? "partial" : "missing",
                "derived", visibilityAnchors > 0 ? 72 : 0,
                visibilityAnchors > 0 ? "continuous_fog_of_war" : "visibility_anchors"));
        return rows;
    }

    private static JsonObject coverageRow(String key, String label, long records, String range,
            String precision, String source, String status, String evidenceLevel,
            int confidence, String missingField) {
        JsonObject row = new JsonObject();
        row.addProperty("key", key);
        row.addProperty("label", label);
        row.addProperty("records", records);
        row.addProperty("range", range);
        row.addProperty("precision", precision);
        row.addProperty("source", source);
        row.addProperty("status", status);
        JsonObject evidence = new JsonObject();
        evidence.addProperty("level", evidenceLevel);
        evidence.addProperty("confidence", confidence);
        JsonArray reasons = new JsonArray();
        reasons.add(status.equals("available") ? "minimum_evidence_met"
                : status.equals("partial") ? "evidence_incomplete"
                        : status.equals("invalid") ? "source_integrity_failed" : "required_records_missing");
        evidence.add("reasons", reasons);
        JsonArray sources = new JsonArray();
        sources.add(source);
        evidence.add("sources", sources);
        JsonArray missing = new JsonArray();
        if (missingField != null) missing.add(missingField);
        evidence.add("missing", missing);
        row.add("evidence", evidence);
        return row;
    }

    private static JsonObject buildIntegrity(long invalidLines, long epilogueCount, int intervalSlots,
            boolean timelineComplete, boolean sequenceContiguous, long invalidCoordinates) {
        JsonObject result = new JsonObject();
        JsonObject checks = new JsonObject();
        checks.add("valid_json", integrityCheck(invalidLines == 0, invalidLines, "invalid_json_lines"));
        checks.add("epilogue", integrityCheck(epilogueCount == 1, epilogueCount, "epilogue_count"));
        checks.add("player_snapshots", integrityCheck(intervalSlots == 10, intervalSlots, "player_slots"));
        checks.add("timeline_range", integrityCheck(timelineComplete, timelineComplete ? 1 : 0, "game_time_range"));
        checks.add("event_sequence", integrityCheck(sequenceContiguous, sequenceContiguous ? 1 : 0, "event_sequence"));
        checks.add("coordinates", integrityCheck(invalidCoordinates == 0, invalidCoordinates, "invalid_coordinates"));
        result.add("checks", checks);
        boolean coreValid = invalidLines == 0 && epilogueCount == 1 && intervalSlots == 10
                && timelineComplete && sequenceContiguous;
        result.addProperty("status", coreValid ? (invalidCoordinates == 0 ? "available" : "partial") : "invalid");
        JsonArray affected = new JsonArray();
        if (intervalSlots != 10 || !timelineComplete) {
            affected.add("map");
            affected.add("farm");
            affected.add("combat");
        }
        if (invalidCoordinates > 0) affected.add("map_positions");
        result.add("affected_features", affected);
        return result;
    }

    private static JsonObject integrityCheck(boolean passed, long records, String reason) {
        JsonObject row = new JsonObject();
        row.addProperty("passed", passed);
        row.addProperty("records", records);
        if (!passed) row.addProperty("reason", reason);
        return row;
    }

    private static void copy(JsonObject source, JsonObject target, String field) {
        JsonElement value = source.get(field);
        if (value != null) {
            target.add(field, value.deepCopy());
        }
    }

    private static boolean hasValue(JsonObject object, String field) {
        JsonElement value = object.get(field);
        return value != null && !value.isJsonNull();
    }

    private static boolean arrayHasValues(JsonObject object, String field) {
        JsonElement value = object.get(field);
        return value != null && value.isJsonArray() && !value.getAsJsonArray().isEmpty();
    }

    private static String stringValue(JsonObject object, String field, String fallback) {
        JsonElement value = object.get(field);
        return value == null || value.isJsonNull() ? fallback : value.getAsString();
    }

    private static Long longValue(JsonObject object, String field) {
        JsonElement value = object.get(field);
        if (value == null || value.isJsonNull()) {
            return null;
        }
        try {
            return value.getAsLong();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static Integer integerValue(JsonObject object, String field) {
        Long value = longValue(object, field);
        return value == null ? null : value.intValue();
    }

    private static void addNullable(JsonObject object, String field, Number value) {
        if (value == null) {
            object.add(field, null);
        } else {
            object.addProperty(field, value);
        }
    }
}
