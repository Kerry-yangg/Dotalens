package opendota;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

final class PlayerReportEventCandidatePool {
    static final String MODEL = "player-report-event-candidates/1.1";
    static final int IMPORTANT_THRESHOLD = 60;

    private static final Set<String> MAJOR_ITEMS = Set.of(
            "blink", "travel_boots", "travel_boots_2", "black_king_bar",
            "aghanims_scepter", "aghanims_shard", "refresher", "sheepstick",
            "orchid", "bloodthorn", "manta", "sphere", "satanic", "butterfly",
            "skadi", "desolator", "radiance", "bfury", "maelstrom", "mjollnir",
            "harpoon", "disperser", "nullifier", "silver_edge", "greater_crit",
            "heart", "assault", "shivas_guard", "lotus_orb", "pipe",
            "crimson_guard", "guardian_greaves", "boots_of_bearing");

    private PlayerReportEventCandidatePool() {
    }

    record Result(JsonArray candidates, JsonArray importantEvents,
            List<JsonObject> generatedInsights, JsonArray storyNodes) {
    }

    static Result build(JsonObject modules, List<JsonObject> existingInsights,
            JsonObject evidenceIndex, int slot, int position, int reportConfidence) {
        List<JsonObject> candidates = new ArrayList<>();
        List<JsonObject> generatedInsights = new ArrayList<>();
        SnapshotLookup snapshots = SnapshotLookup.from(modules, slot);

        addExistingInsights(candidates, existingInsights, evidenceIndex, slot);
        addWards(candidates, generatedInsights, modules, evidenceIndex, slot, position,
                reportConfidence);
        addPurchases(candidates, modules, evidenceIndex, snapshots, slot, reportConfidence);
        addDeaths(candidates, generatedInsights, modules, evidenceIndex, snapshots, slot, position,
                reportConfidence);
        addObjectives(candidates, generatedInsights, modules, evidenceIndex, snapshots, slot,
                position, reportConfidence);
        addTeleports(candidates, generatedInsights, modules, evidenceIndex, slot, position,
                reportConfidence);
        addLaneSpatial(candidates, modules, evidenceIndex, snapshots, slot, position,
                reportConfidence);
        addItemDeliveries(candidates, generatedInsights, modules, evidenceIndex, slot,
                reportConfidence);
        addRunes(candidates, generatedInsights, modules, evidenceIndex, slot, position,
                reportConfidence);
        addSupportAwayWindows(candidates, generatedInsights, modules, evidenceIndex, slot,
                position, reportConfidence);
        addSuspectedPulls(candidates, modules, evidenceIndex, slot, reportConfidence);
        addLevelSpikes(candidates, generatedInsights, modules, evidenceIndex, slot, position,
                reportConfidence);

        candidates.sort(Comparator
                .comparingInt((JsonObject row) -> intValue(row, "time_start", 0))
                .thenComparing(row -> stringValue(row, "id", "")));

        Selection selection = selectImportant(candidates);
        suppressDuplicateGeneratedInsights(generatedInsights, existingInsights);
        return new Result(
                toArray(candidates),
                selection.importantEvents(),
                generatedInsights,
                storyNodes(selection.importantEvents()));
    }

    private static void addLaneSpatial(List<JsonObject> candidates, JsonObject modules,
            JsonObject evidenceIndex, SnapshotLookup snapshots, int slot, int position,
            int reportConfidence) {
        JsonObject farm = object(modules, "farm");
        JsonArray windows = array(farm, "lane_spatial_windows");
        JsonObject positions = object(object(modules, "laning"), "positions_by_slot");
        JsonObject assignment = object(positions, Integer.toString(slot));
        String lane = stringValue(assignment, "lane", "");
        if (windows == null || lane.isBlank()) return;
        String side = slot < 5 ? "radiant" : "dire";
        for (JsonElement element : windows) {
            if (!element.isJsonObject()) continue;
            JsonObject window = element.getAsJsonObject();
            if (!lane.equals(stringValue(window, "lane", ""))) continue;
            int time = intValue(window, "meeting_time", eventTime(window));
            String id = stringValue(window, "id",
                    "lane-space-" + lane + "-" + time);
            JsonObject localized = withPosition(window, snapshots.nearest(time));
            JsonObject towerZone = object(window, side + "_tower_zone");
            boolean underTower = booleanValue(towerZone, "inside", false);
            double pushDepth = number(window, side + "_push_depth", 0);
            int importance = underTower ? 58 : Math.abs(pushDepth) >= 45 ? 57 : 50;
            JsonObject jump = PlayerReportLocalization.forEvent(
                    "development", "lane_checkpoint", id, slot, time,
                    Math.max(0, time - 15), time + 20, localized,
                    stringValue(localized, "region", lane + "_lane"));
            JsonObject candidate = candidate(
                    "candidate:lane-pressure:" + id,
                    "lane_pressure",
                    "farm.lane_spatial_windows",
                    slot,
                    time,
                    time + 5,
                    importance,
                    "context",
                    Math.min(reportConfidence, intValue(window, "confidence", 0)),
                    "observed_wave_geometry_context_only",
                    "lane-space:" + id,
                    underTower ? "兵线在己方塔前交汇" : "兵线推进深度已定位",
                    formatTime(time) + " " + laneLabel(lane) + "兵线交汇，"
                            + (underTower ? "位于存活的己方防御塔保护范围附近。"
                                    : "己方推进深度为 " + Math.round(pushDepth) + "。"),
                    "塔区仅表示离己方存活防御塔较近，不等于敌方英雄威胁为零。",
                    "",
                    strings("lane-spatial:" + id),
                    jump);
            candidates.add(candidate);
            indexEvidence(evidenceIndex, "lane-spatial:" + id, "lane_spatial",
                    localized, slot);
        }
    }

    private static void addItemDeliveries(List<JsonObject> candidates, List<JsonObject> generated,
            JsonObject modules, JsonObject evidenceIndex, int slot, int reportConfidence) {
        JsonObject player = object(object(object(modules, "build"), "by_slot"),
                Integer.toString(slot));
        JsonArray deliveries = array(player, "item_delivery_lifecycles");
        if (deliveries == null) return;
        for (JsonElement element : deliveries) {
            if (!element.isJsonObject()) continue;
            JsonObject delivery = element.getAsJsonObject();
            String key = stringValue(delivery, "key", "");
            if (!MAJOR_ITEMS.contains(key)) continue;
            int purchasedAt = intValue(delivery, "purchased_at", eventTime(delivery));
            int usableAt = intValue(delivery, "first_usable_at", purchasedAt);
            int delay = intValue(delivery, "total_to_usable_seconds",
                    Math.max(0, usableAt - purchasedAt));
            String purchaseId = stringValue(delivery, "purchase_id",
                    "purchase-" + slot + "-" + purchasedAt + "-" + key + "-0");
            String id = stringValue(delivery, "id", "delivery-" + purchaseId);
            boolean delayed = delay >= 60;
            boolean fast = delay >= 0 && delay <= 25;
            String kind = delayed ? "improvement" : fast ? "strength" : "context";
            int importance = delayed ? Math.min(90, 66 + Math.min(18, delay / 15))
                    : fast ? 62 : 56;
            String mode = stringValue(delivery, "delivery_mode", "delivery_path_unknown");
            JsonObject jump = PlayerReportLocalization.forEvent(
                    "build", "item_delivery", purchaseId, slot, usableAt,
                    Math.max(0, purchasedAt - 10), Math.max(purchasedAt + 1, usableAt + 10),
                    delivery, stringValue(delivery, "region", "unknown"));
            JsonObject candidate = candidate(
                    "candidate:item-delivery:" + id,
                    "item_delivery",
                    "build.by_slot.item_delivery_lifecycles",
                    slot,
                    purchasedAt,
                    Math.max(purchasedAt, usableAt),
                    importance,
                    kind,
                    Math.min(reportConfidence, intValue(delivery, "confidence", 0)),
                    delayed ? "major_item_usable_delay_observed"
                            : fast ? "major_item_available_quickly" : "delivery_fact_only",
                    "purchase:" + purchaseId,
                    delayed ? "关键装备到手偏慢" : "关键装备已进入可用栏位",
                    formatTime(purchasedAt) + " 购买 " + itemLabel(key) + "，"
                            + formatTime(usableAt) + " 首次在可用栏位观察到，间隔 "
                            + delay + " 秒。",
                    deliveryModeLabel(mode),
                    delayed ? "购买关键装备后及时叫信使，并在送达前预留主背包栏位。"
                            : fast ? "继续把关键装备尽快送到主背包并围绕新装备行动。"
                                    : "",
                    strings("item-delivery:" + id),
                    jump);
            candidate.addProperty("entity_key", key);
            candidates.add(candidate);
            indexEvidence(evidenceIndex, "item-delivery:" + id, "item_delivery",
                    delivery, slot);
            if (delayed || fast) {
                generated.add(generatedInsight(candidate, id, "item_delivery",
                        delayed ? "medium" : "positive",
                        stringValue(candidate, "action", "")));
            }
        }
    }

    private static void addRunes(List<JsonObject> candidates, List<JsonObject> generated,
            JsonObject modules, JsonObject evidenceIndex, int slot, int position,
            int reportConfidence) {
        JsonObject bySlot = object(object(modules, "farm"), "rune_opportunities_by_slot");
        JsonArray runes = array(bySlot, Integer.toString(slot));
        if (runes == null) return;
        for (JsonElement element : runes) {
            if (!element.isJsonObject()) continue;
            JsonObject rune = element.getAsJsonObject();
            int time = eventTime(rune);
            String id = stringValue(rune, "id", "rune-" + slot + "-" + time);
            String type = stringValue(rune, "rune_type", "unknown");
            int gold = intValue(rune, "direct_gold", 0);
            int xp = intValue(rune, "observed_xp_delta", 0);
            boolean exact = "chat_event_exact".equals(
                    stringValue(rune, "event_evidence", ""));
            boolean valuable = exact && (gold > 0 || !"unknown".equals(type));
            int importance = valuable ? position >= 4 ? 66 : 61 : 55;
            JsonObject jump = PlayerReportLocalization.forEvent(
                    "map", "rune", id, slot, time, Math.max(0, time - 12), time + 12,
                    rune, stringValue(rune, "region", "river"));
            JsonObject candidate = candidate(
                    "candidate:rune:" + id,
                    "rune_control",
                    "farm.rune_opportunities_by_slot",
                    slot,
                    time,
                    time,
                    importance,
                    valuable ? "strength" : "context",
                    Math.min(reportConfidence, intValue(rune, "confidence", 0)),
                    valuable ? "exact_personal_rune_pickup" : "rune_counter_delta_only",
                    "rune:" + id,
                    "拿到" + runeLabel(type),
                    formatTime(time) + " 拾取" + runeLabel(type)
                            + (gold > 0 ? "，直接获得 " + gold + " 金。" : "。")
                            + (xp > 0 ? " 同期观察到经验增加 " + xp + "。" : ""),
                    xp > 0 ? "经验变化是同一时间窗观测值，不全部归因于神符。" : "",
                    valuable ? runeKeepAction(position, type) : "",
                    strings("rune:" + id),
                    jump);
            candidates.add(candidate);
            indexEvidence(evidenceIndex, "rune:" + id, "rune", rune, slot);
            if (valuable) {
                generated.add(generatedInsight(candidate, id, "rune_control", "positive",
                        runeKeepAction(position, type)));
            }
        }
    }

    private static void addSupportAwayWindows(List<JsonObject> candidates,
            List<JsonObject> generated, JsonObject modules, JsonObject evidenceIndex,
            int slot, int position, int reportConfidence) {
        JsonObject bySlot = object(object(modules, "farm"), "support_away_windows_by_slot");
        JsonArray windows = array(bySlot, Integer.toString(slot));
        if (windows == null) return;
        for (JsonElement element : windows) {
            if (!element.isJsonObject()) continue;
            JsonObject window = element.getAsJsonObject();
            int start = intValue(window, "start", eventTime(window));
            int end = intValue(window, "end", start + 1);
            String id = stringValue(window, "id", "support-away-" + slot + "-" + start);
            String outcome = stringValue(window, "outcome", "unproven");
            boolean positive = "productive".equals(outcome)
                    || "solo_xp_value".equals(outcome);
            boolean costly = "costly".equals(outcome);
            String kind = positive ? "strength" : costly ? "improvement" : "context";
            int importance = positive ? 68 : costly ? 76 : 54;
            JsonObject jump = PlayerReportLocalization.forEvent(
                    "development", "support_window", id, slot, start,
                    Math.max(0, start - 10), end + 10, window,
                    stringValue(window, "region", "unknown"));
            JsonObject candidate = candidate(
                    "candidate:support-route:" + id,
                    "support_route",
                    "farm.support_away_windows_by_slot",
                    slot,
                    start,
                    end,
                    importance,
                    kind,
                    Math.min(reportConfidence, intValue(window, "confidence", 0)),
                    positive ? "support_away_value_observed"
                            : costly ? "core_death_during_support_away_window"
                                    : "support_away_context_only",
                    "support-away:" + id,
                    positive ? "辅助离线取得了收益"
                            : costly ? "辅助离线期间线上付出代价" : "记录到辅助离线",
                    supportAwayFact(window, start, end),
                    positive ? "离线行为带来了控符、插眼、叠野、游走或让级收益。"
                            : costly ? "离线期间本路核心阵亡，需要结合兵线与敌方位置复核。"
                                    : "当前没有足够证据判断这次离线是赚是亏。",
                    positive ? "保留这种有明确目标且线上核心可安全单吃的离线。"
                            : costly ? "离线前先确认核心能否留在经验区，以及自己能否及时回线。"
                                    : "",
                    strings("support-away:" + id),
                    jump);
            candidates.add(candidate);
            indexEvidence(evidenceIndex, "support-away:" + id, "support_away",
                    window, slot);
            if (positive || costly) {
                generated.add(generatedInsight(candidate, id, "support_route",
                        positive ? "positive" : "medium",
                        stringValue(candidate, "action", "")));
            }
        }
    }

    private static void addSuspectedPulls(List<JsonObject> candidates, JsonObject modules,
            JsonObject evidenceIndex, int slot, int reportConfidence) {
        JsonObject bySlot = object(object(modules, "farm"), "suspected_pulls_by_slot");
        JsonArray pulls = array(bySlot, Integer.toString(slot));
        if (pulls == null) return;
        for (JsonElement element : pulls) {
            if (!element.isJsonObject()) continue;
            JsonObject pull = element.getAsJsonObject();
            int time = eventTime(pull);
            String id = stringValue(pull, "id", "suspected-pull-" + slot + "-" + time);
            JsonObject jump = PlayerReportLocalization.forEvent(
                    "development", "suspected_pull", id, slot, time,
                    Math.max(0, time - 12), time + 18, pull,
                    stringValue(pull, "region", "unknown"));
            JsonObject candidate = candidate(
                    "candidate:suspected-pull:" + id,
                    "suspected_pull",
                    "farm.suspected_pulls_by_slot",
                    slot,
                    time,
                    time,
                    57,
                    "context",
                    Math.min(reportConfidence, intValue(pull, "confidence", 0)),
                    "pull_inference_never_personal_praise_or_blame",
                    "suspected-pull:" + id,
                    "疑似发生拉野",
                    formatTime(time) + " 支援英雄、" + intValue(pull, "lane_creep_count", 0)
                            + " 个己方小兵与野怪营地在同一拉野时间窗重合。",
                    "缺少单位仇恨命令，当前只标记为疑似拉野。",
                    "",
                    strings("suspected-pull:" + id),
                    jump);
            candidates.add(candidate);
            indexEvidence(evidenceIndex, "suspected-pull:" + id, "suspected_pull",
                    pull, slot);
        }
    }

    private static void addLevelSpikes(List<JsonObject> candidates, List<JsonObject> generated,
            JsonObject modules, JsonObject evidenceIndex, int slot, int position,
            int reportConfidence) {
        JsonObject bySlot = object(object(modules, "farm"), "level_spike_windows_by_slot");
        JsonArray spikes = array(bySlot, Integer.toString(slot));
        if (spikes == null) return;
        for (JsonElement element : spikes) {
            if (!element.isJsonObject()) continue;
            JsonObject spike = element.getAsJsonObject();
            int start = intValue(spike, "start", eventTime(spike));
            int end = intValue(spike, "end", start + 45);
            int level = intValue(spike, "level", 0);
            String id = stringValue(spike, "id",
                    "level-spike-" + slot + "-" + start + "-" + level);
            String outcome = stringValue(spike, "outcome", "context_only");
            boolean used = "used".equals(outcome);
            boolean missed = "unused_reviewable".equals(outcome);
            String kind = used ? "strength" : missed ? "improvement" : "context";
            int importance = used ? 68 : missed ? 73 : 54;
            JsonObject jump = PlayerReportLocalization.forEvent(
                    "development", "level_spike", id, slot, start,
                    Math.max(0, start - 10), end + 5, spike,
                    stringValue(spike, "region", "unknown"));
            JsonObject candidate = candidate(
                    "candidate:level-spike:" + id,
                    "level_spike",
                    "farm.level_spike_windows_by_slot",
                    slot,
                    start,
                    end,
                    importance,
                    kind,
                    Math.min(reportConfidence, intValue(spike, "confidence", 0)),
                    used ? "bounded_level_window_used"
                            : missed ? "bounded_level_window_low_output_gate_passed"
                                    : "hero_specific_power_spike_unconfirmed",
                    "level-spike:" + id,
                    used ? level + " 级后的窗口利用较好"
                            : missed ? level + " 级后的窗口值得复核"
                                    : "记录到 " + level + " 级时间点",
                    formatTime(start) + " 升到 " + level + " 级，之后 "
                            + Math.max(1, end - start) + " 秒造成 "
                            + intValue(spike, "hero_damage", 0) + " 英雄伤害、参与 "
                            + intValue(spike, "kill_assists", 0) + " 次击杀，补刀 "
                            + intValue(spike, "last_hits", 0) + " 个。",
                    used ? "在敌方接触条件成立时兑现了等级窗口。"
                            : missed ? "敌方接触和存活门槛成立，但这段时间的可观测收益偏低。"
                                    : "未确认英雄专属强势期，因此不评价。",
                    used ? "继续在关键等级到达前保持血蓝，并提前靠近可施压区域。"
                            : missed ? levelSpikeAction(position) : "",
                    strings("level-spike:" + id),
                    jump);
            candidates.add(candidate);
            indexEvidence(evidenceIndex, "level-spike:" + id, "level_spike",
                    spike, slot);
            if (used || missed) {
                generated.add(generatedInsight(candidate, id, "level_spike",
                        used ? "positive" : "medium",
                        stringValue(candidate, "action", "")));
            }
        }
    }

    private static void addExistingInsights(List<JsonObject> candidates,
            List<JsonObject> insights, JsonObject evidenceIndex, int slot) {
        for (JsonObject insight : insights) {
            JsonObject jump = object(insight, "jump_target");
            String eventType = existingEventType(insight, jump);
            int time = intValue(insight, "time_start", intValue(jump, "time", 0));
            int end = intValue(insight, "time_end", intValue(jump, "range_end", time + 5));
            String entityId = stringValue(jump, "entity_id",
                    stringValue(insight, "id", eventType + "-" + time));
            String dedupeKey = dedupeKey(eventType, entityId, jump, time);
            int importance = existingImportance(insight);
            if (!PlayerReportLocalization.ordinaryEligible(jump)) {
                importance = Math.min(IMPORTANT_THRESHOLD - 1, importance);
            }
            JsonObject candidate = candidate(
                    "candidate:insight:" + stringValue(insight, "id", eventType + "-" + time),
                    eventType,
                    "player_report",
                    slot,
                    time,
                    end,
                    importance,
                    stringValue(insight, "kind", "context"),
                    intValue(insight, "confidence", 0),
                    "existing_report_conclusion",
                    dedupeKey,
                    stringValue(insight, "title", "比赛关键时刻"),
                    stringValue(insight, "fact", ""),
                    stringValue(insight, "impact", ""),
                    stringValue(insight, "action", ""),
                    arrayCopy(insight, "evidence_refs"),
                    jump == null ? fallbackJump("timeline", eventType, entityId, slot, time) : jump.deepCopy());
            candidate.addProperty("source_insight_id", stringValue(insight, "id", ""));
            String verdict = evidenceVerdict(insight, evidenceIndex);
            if (!verdict.isBlank()) candidate.addProperty("verdict", verdict);
            candidates.add(candidate);
        }
    }

    private static void addWards(List<JsonObject> candidates, List<JsonObject> generated,
            JsonObject modules, JsonObject evidenceIndex, int slot, int position,
            int reportConfidence) {
        JsonArray wards = array(object(modules, "vision"), "wards");
        if (wards == null) return;
        for (JsonElement element : wards) {
            if (!element.isJsonObject()) continue;
            JsonObject ward = element.getAsJsonObject();
            if (intValue(ward, "playerSlot", -1) != slot) continue;
            int placedAt = intValue(ward, "placedAt", intValue(ward, "time", 0));
            int endedAt = intValue(ward, "endedAt",
                    placedAt + intValue(ward, "duration", 0));
            int score = intValue(ward, "score", 0);
            int detections = intValue(ward, "detections", 0);
            int uniqueEnemies = intValue(ward, "uniqueEnemies", 0);
            int conversions = intValue(ward, "conversions", 0);
            String id = stringValue(ward, "id", "ward-" + slot + "-" + placedAt);
            String wardType = stringValue(ward, "type", "observer");
            boolean positive = score >= 72 && (detections >= 3 || conversions > 0);
            int rawImportance = clamp(48 + score / 3 + Math.min(8, detections)
                    + Math.min(6, conversions * 3), 0, 96);
            int importance = positive ? rawImportance
                    : Math.min(IMPORTANT_THRESHOLD - 1, rawImportance);
            String kind = positive ? "strength" : "context";
            int confidence = Math.min(reportConfidence,
                    intValue(ward, "location_confidence", reportConfidence));
            JsonObject jump = PlayerReportLocalization.forEvent(
                    "vision", "ward", id, slot, placedAt, Math.max(0, placedAt - 10),
                    Math.max(placedAt + 5, endedAt), ward, stringValue(ward, "region", "unknown"));
            JsonArray refs = strings("vision:" + id);
            String label = "sentry".equals(wardType) ? "真眼" : "假眼";
            JsonObject candidate = candidate(
                    "candidate:ward:" + id,
                    "ward",
                    "vision.wards",
                    slot,
                    placedAt,
                    Math.max(placedAt, endedAt),
                    importance,
                    kind,
                    confidence,
                    positive ? "personal_ward_value_confirmed" : "ward_fact_only",
                    positive ? "ward-window:" + slot + ":" + Math.max(0, placedAt) / 300
                            : "ward:" + id,
                    label + "覆盖了关键区域",
                    formatTime(placedAt) + " 在" + regionLabel(ward)
                            + "放置" + label + "，存活 " + formatDuration(endedAt - placedAt)
                            + "，发现敌方 " + detections + " 次、" + uniqueEnemies + " 名英雄。",
                    positive ? "这枚眼在存续期内提供了可确认的信息价值。" : "",
                    positive ? wardKeepAction(position) : "",
                    refs,
                    jump);
            candidates.add(candidate);
            indexEvidence(evidenceIndex, "vision:" + id, "ward", ward, slot);
            if (positive) {
                generated.add(generatedInsight(candidate, id, "vision_value", "positive",
                        "保留这类覆盖关键入口且不与已有视野重叠的眼位。"));
            }
        }
    }

    private static void addPurchases(List<JsonObject> candidates, JsonObject modules,
            JsonObject evidenceIndex, SnapshotLookup snapshots, int slot, int reportConfidence) {
        JsonObject build = object(modules, "build");
        JsonObject bySlot = object(build, "by_slot");
        JsonObject player = object(bySlot, Integer.toString(slot));
        JsonArray purchases = array(player, "purchases");
        if (purchases == null) return;
        for (JsonElement element : purchases) {
            if (!element.isJsonObject()) continue;
            JsonObject purchase = element.getAsJsonObject();
            String key = stringValue(purchase, "key", "");
            if (!MAJOR_ITEMS.contains(key)) continue;
            int time = eventTime(purchase);
            String id = stringValue(purchase, "id",
                    "purchase-" + slot + "-" + time + "-" + key + "-"
                            + intValue(purchase, "event_seq", 0));
            JsonObject localized = withPosition(purchase, snapshots.nearest(time));
            JsonObject jump = PlayerReportLocalization.forEvent(
                    "build", "purchase", id, slot, time, Math.max(0, time - 20), time + 20,
                    localized, stringValue(localized, "region", "unknown"));
            int importance = "blink".equals(key) || "black_king_bar".equals(key) ? 76 : 68;
            JsonArray refs = strings("purchase:" + id);
            JsonObject candidate = candidate(
                    "candidate:purchase:" + id,
                    "purchase",
                    "build.by_slot.purchases",
                    slot,
                    time,
                    time,
                    importance,
                    "context",
                    reportConfidence,
                    "major_item_timing_fact",
                    "purchase:" + id,
                    "关键装备完成",
                    formatTime(time) + " 完成 " + itemLabel(key) + "。",
                    "这件装备会改变之后的打钱、先手或生存窗口。",
                    "结合完成后的五分钟检查路线和参战选择。",
                    refs,
                    jump);
            candidate.addProperty("entity_key", key);
            candidates.add(candidate);
            indexEvidence(evidenceIndex, "purchase:" + id, "purchase", localized, slot);
        }
    }

    private static void addDeaths(List<JsonObject> candidates, List<JsonObject> generated,
            JsonObject modules, JsonObject evidenceIndex, SnapshotLookup snapshots, int slot,
            int position, int reportConfidence) {
        JsonArray events = array(object(modules, "timeline"), "events");
        if (events == null) return;
        int sequence = 0;
        for (JsonElement element : events) {
            if (!element.isJsonObject()) continue;
            JsonObject death = element.getAsJsonObject();
            if (!"hero_death".equals(stringValue(death, "kind", ""))
                    || intValue(death, "target_slot", -1) != slot) {
                continue;
            }
            int time = eventTime(death);
            FightMatch fightMatch = findFight(modules, slot, time);
            JsonObject source = fightMatch.fight() != null
                    ? fightMatch.fight()
                    : withPosition(death, snapshots.nearest(time));
            String id = stringValue(death, "id", "death-" + slot + "-" + time + "-" + sequence++);
            String entityId = fightMatch.id() == null ? id : fightMatch.id();
            JsonObject jump = fightMatch.fight() == null
                    ? PlayerReportLocalization.forEvent(
                            "combat", "death", id, slot, time, Math.max(0, time - 12), time + 8,
                            source, stringValue(source, "region", "unknown"))
                    : PlayerReportLocalization.forFight(fightMatch.fight(), slot);
            boolean accountable = fightMatch.gatePassed() && fightMatch.responsibilityScore() < 50;
            int fightImportance = fightMatch.importance();
            int importance = accountable
                    ? clamp(Math.max(64, fightImportance), 0, 96)
                    : Math.min(IMPORTANT_THRESHOLD - 1, fightImportance);
            String kind = accountable ? "improvement" : "context";
            JsonArray refs = strings("death:" + id);
            String location = regionLabel(source);
            JsonObject candidate = candidate(
                    "candidate:death:" + id,
                    "death",
                    "timeline.hero_death",
                    slot,
                    time,
                    time,
                    importance,
                    kind,
                    Math.min(reportConfidence, fightMatch.confidence()),
                    accountable ? "fight_responsibility_gate_passed" : "death_context_only",
                    fightMatch.id() == null ? "death:" + id : "fight:" + fightMatch.id(),
                    accountable ? "这次阵亡值得复核" : "记录到一次阵亡",
                    formatTime(time) + " 在" + location + "阵亡"
                            + (fightMatch.id() == null ? "。" : "，发生在已识别冲突内。"),
                    accountable
                            ? "职责门禁已通过且本次贡献分偏低，阵亡与战斗执行可以一起复核。"
                            : "当前证据不足以把这次团队结果直接归责给个人。",
                    accountable ? deathAction(position) : "",
                    refs,
                    jump);
            candidates.add(candidate);
            indexEvidence(evidenceIndex, "death:" + id, "death", death, slot);
            if (accountable) {
                generated.add(generatedInsight(candidate, id, "death_review", "high",
                        deathAction(position)));
            }
        }
    }

    private static void addObjectives(List<JsonObject> candidates, List<JsonObject> generated,
            JsonObject modules, JsonObject evidenceIndex, SnapshotLookup snapshots, int slot,
            int position, int reportConfidence) {
        JsonArray objectives = array(object(modules, "map"), "objectives");
        if (objectives != null) {
            boolean firstBuilding = true;
            Map<String, Integer> latestHighGroundTime = new LinkedHashMap<>();
            Map<String, String> highGroundClusterKey = new LinkedHashMap<>();
            for (JsonElement element : objectives) {
                if (!element.isJsonObject()) continue;
                JsonObject objective = element.getAsJsonObject();
                int time = eventTime(objective);
                boolean personal = intValue(objective, "playerSlot", -1) == slot;
                String objectiveKind = stringValue(objective, "kind", "objective");
                String target = stringValue(objective, "target", "");
                boolean isBuilding = "building".equals(objectiveKind);
                int importance = objectiveImportance(
                        objectiveKind, target, isBuilding && firstBuilding);
                if (isBuilding) firstBuilding = false;
                String id = stringValue(objective, "id", "objective-" + time);
                String objectiveDedupeKey = objectiveDedupeKey(
                        objectiveKind, target, id, time);
                if (isHighGroundBuilding(target)) {
                    String side = objectiveSide(target);
                    Integer latest = latestHighGroundTime.get(side);
                    if (latest == null || time - latest > 120) {
                        highGroundClusterKey.put(
                                side, "objective:highground:" + side + ":" + time);
                    }
                    latestHighGroundTime.put(side, time);
                    objectiveDedupeKey = highGroundClusterKey.get(side);
                }
                JsonObject localized = withPosition(objective, snapshots.nearest(time));
                JsonObject jump = PlayerReportLocalization.forEvent(
                        "map", "objective", id, slot, time, Math.max(0, time - 15), time + 15,
                        localized, stringValue(localized, "region", "unknown"));
                String kind = personal ? "strength" : "context";
                JsonObject candidate = candidate(
                        "candidate:objective:" + id,
                        "objective",
                        "map.objectives",
                        slot,
                        time,
                        time,
                        importance,
                        kind,
                        reportConfidence,
                        personal ? "personal_objective_event" : "team_objective_context",
                        objectiveDedupeKey,
                        personal ? "参与兑现地图目标" : "关键地图目标发生",
                        formatTime(time) + " 在" + regionLabel(localized) + "发生"
                                + objectiveLabel(objectiveKind, target) + "事件。",
                        personal ? "目标收益与个人事件归属均可确认。" : "这是团队上下文，不直接归责个人。",
                        personal ? objectiveKeepAction(position) : "",
                        strings("objective:" + id),
                        jump);
                candidates.add(candidate);
                indexEvidence(evidenceIndex, "objective:" + id, "objective", localized, slot);
                if (personal) {
                    generated.add(generatedInsight(candidate, id, "objective_conversion", "positive",
                            objectiveKeepAction(position)));
                }
            }
        }

        JsonArray attempts = array(object(modules, "objectives"), "roshan_attempts");
        if (attempts == null) return;
        for (JsonElement element : attempts) {
            if (!element.isJsonObject()) continue;
            JsonObject attempt = element.getAsJsonObject();
            int time = intValue(attempt, "end", eventTime(attempt));
            boolean participant = containsInt(array(attempt, "participants"), slot);
            boolean killer = intValue(attempt, "killer_slot", -1) == slot;
            boolean completed = booleanValue(attempt, "completed", false);
            if (!participant && !killer) continue;
            String id = stringValue(attempt, "id", "roshan-" + time);
            JsonObject localized = withPosition(attempt, snapshots.nearest(time));
            JsonObject jump = PlayerReportLocalization.forEvent(
                    "map", "objective", id, slot, time,
                    Math.max(0, intValue(attempt, "start", time - 20)),
                    Math.max(time + 8, intValue(attempt, "end", time)),
                    localized, stringValue(localized, "region", "roshan"));
            String kind = completed ? "strength" : "context";
            JsonObject candidate = candidate(
                    "candidate:objective:" + id,
                    "objective",
                    "objectives.roshan_attempts",
                    slot,
                    intValue(attempt, "start", time),
                    time,
                    completed ? 88 : 76,
                    kind,
                    reportConfidence,
                    completed ? "personal_roshan_participation" : "roshan_context",
                    objectiveDedupeKey("roshan", "", id, time),
                    completed ? "参与拿下肉山" : "参与肉山区域争夺",
                    formatTime(time) + " 的肉山事件中，个人参与和目标结果均有记录。",
                    completed ? "肉山收益是本局重要的团队节奏节点。" : "结果未完成，只作为关键上下文。",
                    completed ? objectiveKeepAction(position) : "",
                    strings("objective:" + id),
                    jump);
            candidates.add(candidate);
            indexEvidence(evidenceIndex, "objective:" + id, "objective", localized, slot);
            if (completed) {
                generated.add(generatedInsight(candidate, id, "objective_conversion", "positive",
                        objectiveKeepAction(position)));
            }
        }
    }

    private static void addTeleports(List<JsonObject> candidates, List<JsonObject> generated,
            JsonObject modules, JsonObject evidenceIndex, int slot, int position,
            int reportConfidence) {
        JsonArray fights = array(object(modules, "combat"), "fights");
        if (fights == null) return;
        int sequence = 0;
        for (JsonElement fightElement : fights) {
            if (!fightElement.isJsonObject()) continue;
            JsonObject fight = fightElement.getAsJsonObject();
            String fightId = stringValue(fight, "id",
                    "fight-" + intValue(fight, "start", 0));
            JsonArray supportEvents = array(fight, "support_events");
            if (supportEvents == null) continue;
            for (JsonElement eventElement : supportEvents) {
                if (!eventElement.isJsonObject()) continue;
                JsonObject teleport = eventElement.getAsJsonObject();
                String eventKind = stringValue(teleport, "kind", "");
                if (!eventKind.startsWith("tp_")
                        || intValue(teleport, "actor_slot", -1) != slot) {
                    continue;
                }
                int time = intValue(teleport, "completed_at",
                        intValue(teleport, "cast_start", eventTime(teleport)));
                boolean positive = booleanValue(teleport, "support", false)
                        && stringValue(teleport, "status", "").startsWith("completed")
                        && !Set.of("unknown", "none", "failed", "late")
                                .contains(stringValue(teleport, "outcome", "unknown"));
                String id = stringValue(teleport, "id",
                        "teleport-" + slot + "-" + time + "-" + sequence++);
                JsonObject jump = PlayerReportLocalization.forFight(fight, slot);
                int fightImportance = fightImportance(fight);
                int rawImportance = clamp(Math.max(62,
                        fightImportance + (positive ? 4 : 0)), 0, 96);
                int importance = positive ? rawImportance
                        : Math.min(IMPORTANT_THRESHOLD - 1, rawImportance);
                JsonObject candidate = candidate(
                        "candidate:teleport:" + id,
                        "teleport",
                        "combat.support_events",
                        slot,
                        time,
                        time,
                        importance,
                        positive ? "strength" : "context",
                        Math.min(reportConfidence,
                                intValue(teleport, "confidence", reportConfidence)),
                        positive ? "completed_tp_support_with_outcome" : "tp_context_only",
                        "fight:" + fightId,
                        positive ? "TP 支援形成了有效结果" : "记录到一次 TP 行动",
                        formatTime(time) + " 在" + regionLabel(fight) + "完成 TP"
                                + (positive ? "，并产生可确认的支援结果。" : "。"),
                        positive ? "到场顺序和结果均有事件证据。" : "当前只确认行动，不评价职责。",
                        positive ? teleportKeepAction(position) : "",
                        strings("teleport:" + id),
                        jump);
                candidates.add(candidate);
                indexEvidence(evidenceIndex, "teleport:" + id, "teleport", teleport, slot);
                if (positive) {
                    generated.add(generatedInsight(candidate, id, "teleport_support", "positive",
                            teleportKeepAction(position)));
                }
            }
        }
    }

    private static Selection selectImportant(List<JsonObject> candidates) {
        Map<String, List<JsonObject>> grouped = new LinkedHashMap<>();
        for (JsonObject candidate : candidates) {
            candidate.addProperty("selected", false);
            String key = stringValue(candidate, "dedupe_key",
                    stringValue(candidate, "id", ""));
            grouped.computeIfAbsent(key, ignored -> new ArrayList<>()).add(candidate);
        }

        List<JsonObject> moments = new ArrayList<>();
        for (Map.Entry<String, List<JsonObject>> entry : grouped.entrySet()) {
            List<JsonObject> group = entry.getValue();
            List<JsonObject> localized = group.stream()
                    .filter(row -> intValue(row, "importance_score", 0)
                            >= IMPORTANT_THRESHOLD)
                    .toList();
            int importance = localized.stream()
                    .mapToInt(row -> intValue(row, "importance_score", 0))
                    .max().orElse(0);
            if (importance < IMPORTANT_THRESHOLD) continue;

            JsonObject primary = localized.stream()
                    .max(Comparator
                            .comparingInt(PlayerReportEventCandidatePool::narrativeRank)
                            .thenComparingInt(row -> intValue(row, "importance_score", 0))
                            .thenComparingInt(row -> intValue(row, "confidence", 0)))
                    .orElse(localized.get(0));
            primary.addProperty("selected", true);
            for (JsonObject candidate : group) {
                if (candidate != primary) {
                    candidate.addProperty("merged_into", stringValue(primary, "id", ""));
                }
            }

            JsonObject moment = primary.deepCopy();
            moment.addProperty("id", "moment:" + entry.getKey());
            moment.addProperty("importance_score", importance);
            moment.addProperty("importance_tier", importance >= 85 ? "critical"
                    : importance >= 72 ? "high" : "important");
            moment.addProperty("selection_reason", "importance_threshold_and_event_dedupe");
            JsonArray sourceIds = new JsonArray();
            Set<String> relatedTypes = new LinkedHashSet<>();
            JsonArray evidenceRefs = new JsonArray();
            Set<String> seenEvidence = new LinkedHashSet<>();
            int start = Integer.MAX_VALUE;
            int end = 0;
            int confidence = 100;
            for (JsonObject candidate : group) {
                sourceIds.add(stringValue(candidate, "id", ""));
                relatedTypes.add(stringValue(candidate, "event_type", "context"));
                start = Math.min(start, intValue(candidate, "time_start", 0));
                end = Math.max(end, intValue(candidate, "time_end", 0));
                int candidateConfidence = intValue(candidate, "confidence", 0);
                if (candidateConfidence > 0) confidence = Math.min(confidence, candidateConfidence);
                JsonArray refs = array(candidate, "evidence_refs");
                if (refs == null) continue;
                for (JsonElement reference : refs) {
                    String value = reference.getAsString();
                    if (seenEvidence.add(value)) evidenceRefs.add(value);
                }
            }
            moment.add("source_candidate_ids", sourceIds);
            moment.add("related_event_types", strings(relatedTypes));
            moment.add("evidence_refs", evidenceRefs);
            moment.addProperty("time_start", start == Integer.MAX_VALUE ? 0 : start);
            moment.addProperty("time_end", Math.max(start == Integer.MAX_VALUE ? 0 : start, end));
            moment.addProperty("confidence", confidence == 100 ? 0 : confidence);
            moments.add(moment);
        }

        moments.sort(Comparator
                .comparingInt((JsonObject row) -> intValue(row, "time_start", 0))
                .thenComparing(row -> stringValue(row, "id", "")));
        return new Selection(toArray(moments));
    }

    private static JsonArray storyNodes(JsonArray importantEvents) {
        JsonArray stories = new JsonArray();
        for (JsonElement element : importantEvents) {
            JsonObject event = element.getAsJsonObject();
            int start = intValue(event, "time_start", 0);
            int end = Math.max(start, intValue(event, "time_end", start));
            String kind = stringValue(event, "kind", "context");
            JsonObject story = new JsonObject();
            story.addProperty("id", "story:" + stringValue(event, "id", "event-" + start));
            story.addProperty("event_id", stringValue(event, "id", ""));
            story.addProperty("phase", phase(start));
            story.addProperty("start", start);
            story.addProperty("end", end);
            story.addProperty("verdict", stringValue(event, "verdict",
                    "improvement".equals(kind) ? "issue"
                            : "strength".equals(kind) ? "stable" : "context"));
            story.addProperty("kind", kind);
            story.addProperty("title", stringValue(event, "title", "比赛关键时刻"));
            story.addProperty("summary", stringValue(event, "fact", ""));
            story.addProperty("highlight_time", start);
            story.addProperty("confidence", intValue(event, "confidence", 0));
            story.add("key_metrics", new JsonArray());
            story.add("evidence_refs", arrayCopy(event, "evidence_refs"));
            JsonObject jump = object(event, "jump_target");
            if (jump != null) story.add("jump_target", jump.deepCopy());
            story.add("related_event_types", arrayCopy(event, "related_event_types"));
            stories.add(story);
        }
        return stories;
    }

    private static JsonObject candidate(String id, String eventType, String sourceModule,
            int slot, int timeStart, int timeEnd, int importance, String kind, int confidence,
            String responsibility, String dedupeKey, String title, String fact, String impact,
            String action, JsonArray evidenceRefs, JsonObject jumpTarget) {
        int localizedImportance = PlayerReportLocalization.ordinaryEligible(jumpTarget)
                ? importance
                : Math.min(IMPORTANT_THRESHOLD - 1, importance);
        JsonObject row = new JsonObject();
        row.addProperty("id", id);
        row.addProperty("event_type", eventType);
        row.addProperty("source_module", sourceModule);
        row.addProperty("player_slot", slot);
        row.addProperty("time_start", Math.max(0, timeStart));
        row.addProperty("time_end", Math.max(Math.max(0, timeStart), timeEnd));
        row.addProperty("importance_score", clamp(localizedImportance, 0, 100));
        row.addProperty("kind", kind);
        row.addProperty("confidence", clamp(confidence, 0, 100));
        row.addProperty("responsibility", responsibility);
        row.addProperty("dedupe_key", dedupeKey);
        row.addProperty("title", title);
        row.addProperty("fact", fact);
        row.addProperty("impact", impact);
        row.addProperty("action", action);
        row.add("evidence_refs", evidenceRefs == null ? new JsonArray() : evidenceRefs);
        row.add("jump_target", jumpTarget);
        return row;
    }

    private static JsonObject generatedInsight(JsonObject candidate, String entityId,
            String category, String severity, String action) {
        JsonObject row = new JsonObject();
        row.addProperty("id", "event-insight:" + stringValue(candidate, "event_type", "event")
                + ":" + entityId);
        row.addProperty("event_type", stringValue(candidate, "event_type", "event"));
        row.addProperty("kind", stringValue(candidate, "kind", "context"));
        row.addProperty("category", category);
        row.addProperty("severity", severity);
        row.addProperty("confidence", intValue(candidate, "confidence", 0));
        row.addProperty("time_start", intValue(candidate, "time_start", 0));
        row.addProperty("time_end", intValue(candidate, "time_end", 0));
        row.addProperty("location", locationFromJump(object(candidate, "jump_target")));
        row.addProperty("title", stringValue(candidate, "title", ""));
        row.addProperty("fact", stringValue(candidate, "fact", ""));
        row.addProperty("judgment", stringValue(candidate, "impact", ""));
        row.addProperty("impact", stringValue(candidate, "impact", ""));
        row.addProperty("action", action);
        row.addProperty("gate_status", "passed");
        row.addProperty("root_cause_id", stringValue(candidate, "dedupe_key",
                stringValue(candidate, "id", "")));
        row.add("evidence_refs", arrayCopy(candidate, "evidence_refs"));
        JsonObject jump = object(candidate, "jump_target");
        row.add("jump_target", jump == null ? new JsonObject() : jump.deepCopy());
        row.addProperty("ordinary_eligible", PlayerReportLocalization.ordinaryEligible(jump));
        return row;
    }

    private static void suppressDuplicateGeneratedInsights(List<JsonObject> generated,
            List<JsonObject> existing) {
        generated.removeIf(candidate -> {
            String root = stringValue(candidate, "root_cause_id", "");
            if (!root.startsWith("fight:")) return false;
            String fightId = root.substring("fight:".length());
            String kind = stringValue(candidate, "kind", "");
            for (JsonObject insight : existing) {
                if (!kind.equals(stringValue(insight, "kind", ""))) continue;
                JsonObject jump = object(insight, "jump_target");
                if ("fight".equals(stringValue(jump, "entity_type", ""))
                        && fightId.equals(stringValue(jump, "entity_id", ""))) {
                    return true;
                }
            }
            return false;
        });
    }

    private static String evidenceVerdict(JsonObject insight, JsonObject evidenceIndex) {
        JsonArray refs = array(insight, "evidence_refs");
        if (refs == null || evidenceIndex == null) return "";
        for (JsonElement element : refs) {
            String id = element.getAsString();
            JsonObject evidence = object(evidenceIndex, id);
            String verdict = stringValue(evidence, "verdict", "");
            if (!verdict.isBlank()) return verdict;
        }
        return "";
    }

    private static FightMatch findFight(JsonObject modules, int slot, int time) {
        JsonArray fights = array(object(modules, "combat"), "fights");
        if (fights == null) return FightMatch.empty();
        JsonObject best = null;
        int bestDistance = Integer.MAX_VALUE;
        for (JsonElement element : fights) {
            if (!element.isJsonObject()) continue;
            JsonObject fight = element.getAsJsonObject();
            int start = intValue(fight, "review_start",
                    intValue(fight, "start", 0) - 10);
            int end = intValue(fight, "end", start) + 8;
            if (time < start || time > end) continue;
            int contact = intValue(fight, "contact_start", intValue(fight, "start", time));
            int distance = Math.abs(time - contact);
            if (distance < bestDistance) {
                best = fight;
                bestDistance = distance;
            }
        }
        if (best == null) return FightMatch.empty();
        JsonObject contribution = contribution(best, slot);
        JsonObject gate = object(contribution, "responsibility_gate");
        return new FightMatch(
                best,
                stringValue(best, "id", "fight-" + intValue(best, "start", time)),
                "passed".equals(stringValue(gate, "status", "")),
                intValue(contribution, "responsibilityScore", 50),
                intValue(contribution, "confidence", 0),
                fightImportance(best));
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

    private static int fightImportance(JsonObject fight) {
        JsonObject importance = object(fight, "importance");
        return intValue(importance, "score",
                booleanValue(importance, "important", false) ? 72 : 58);
    }

    private static int objectiveImportance(String kind, String target, boolean firstBuilding) {
        if ("building".equals(kind)) {
            if (target.contains("_fort")) return 96;
            if (target.contains("_tower4")) return 90;
            if (target.contains("_rax_")) return 88;
            if (target.contains("_tower3_")) return 82;
            if (target.contains("_tower2_")) return 59;
            if (target.contains("_tower1_")) return firstBuilding ? 59 : 56;
        }
        return switch (kind) {
            case "roshan", "aegis", "barracks", "ancient" -> 88;
            case "tower" -> firstBuilding ? 64 : 58;
            default -> 55;
        };
    }

    private static String objectiveDedupeKey(String kind, String target, String id, int time) {
        if ("roshan".equals(kind) || "aegis".equals(kind)) {
            return "objective:roshan:" + Math.max(0, time) / 120;
        }
        if ("building".equals(kind)) {
            String side = target.contains("goodguys") ? "radiant"
                    : target.contains("badguys") ? "dire" : "unknown";
            String lane = target.endsWith("_top") ? "top"
                    : target.endsWith("_mid") ? "mid"
                    : target.endsWith("_bot") ? "bottom" : "base";
            if (target.contains("_rax_")) return "objective:rax:" + side + ":" + lane;
            if (target.contains("_tower4")) return "objective:tower4:" + side;
            if (target.contains("_fort")) return "objective:ancient:" + side;
        }
        return "objective:" + id;
    }

    private static boolean isHighGroundBuilding(String target) {
        return target.contains("_tower3_")
                || target.contains("_rax_")
                || target.contains("_tower4")
                || target.contains("_fort");
    }

    private static String objectiveSide(String target) {
        return target.contains("goodguys") ? "radiant"
                : target.contains("badguys") ? "dire" : "unknown";
    }

    private static int narrativeRank(JsonObject candidate) {
        String kind = stringValue(candidate, "kind", "context");
        int base = "improvement".equals(kind) ? 300
                : "strength".equals(kind) ? 200 : 100;
        if (stringValue(candidate, "event_type", "").equals("combat")) base += 20;
        return base;
    }

    private static int existingImportance(JsonObject insight) {
        int confidence = intValue(insight, "confidence", 0);
        String severity = stringValue(insight, "severity", "");
        int severityScore = switch (severity) {
            case "critical" -> 92;
            case "high" -> 84;
            case "positive" -> 76;
            case "medium" -> 70;
            default -> 62;
        };
        return clamp(Math.round(severityScore * 0.7f + confidence * 0.3f), 0, 96);
    }

    private static String existingEventType(JsonObject insight, JsonObject jump) {
        String entityType = stringValue(jump, "entity_type", "");
        String module = stringValue(jump, "module", "");
        String category = stringValue(insight, "category", "");
        if ("fight".equals(entityType) || "combat".equals(module)
                || category.startsWith("combat")) return "combat";
        if ("ward".equals(entityType) || "vision".equals(module)
                || category.startsWith("vision")) return "ward";
        if ("purchase".equals(entityType) || "build".equals(module)
                || category.startsWith("purchase")) return "purchase";
        if ("objective".equals(entityType) || category.startsWith("objective")) return "objective";
        if ("farm_diagnostic".equals(entityType) || "farm".equals(module)
                || category.startsWith("farm")) return "farm";
        if ("lane_checkpoint".equals(entityType) || category.startsWith("lane")) return "lane";
        if (category.startsWith("death")) return "death";
        if (category.startsWith("teleport") || category.startsWith("tp_")) return "teleport";
        return "report";
    }

    private static String dedupeKey(String eventType, String entityId, JsonObject jump, int time) {
        if ("fight".equals(stringValue(jump, "entity_type", ""))) {
            return "fight:" + entityId;
        }
        return eventType + ":" + (entityId.isBlank() ? time : entityId);
    }

    private static JsonObject fallbackJump(String module, String entityType, String entityId,
            int slot, int time) {
        return PlayerReportLocalization.forEvent(
                module, entityType, entityId, slot, time,
                Math.max(0, time - 10), time + 10, null, "unknown");
    }

    private static void indexEvidence(JsonObject evidenceIndex, String id, String type,
            JsonObject source, int slot) {
        if (evidenceIndex == null || evidenceIndex.has(id)) return;
        JsonObject row = source == null ? new JsonObject() : source.deepCopy();
        row.addProperty("id", id);
        row.addProperty("type", type);
        row.addProperty("slot", slot);
        evidenceIndex.add(id, row);
    }

    private static JsonObject withPosition(JsonObject source, JsonObject position) {
        JsonObject row = source == null ? new JsonObject() : source.deepCopy();
        if (validMapCoordinate(row)) return row;
        if (position == null) return row;
        for (String key : List.of("x", "y", "region", "coordinate_valid",
                "coordinate_space", "coordinate_source", "coordinate_version",
                "location_confidence", "region_confidence")) {
            copy(row, position, key);
        }
        return row;
    }

    private static boolean validMapCoordinate(JsonObject row) {
        return booleanValue(row, "coordinate_valid", false)
                && number(row, "x", -1) >= 0 && number(row, "x", -1) <= 100
                && number(row, "y", -1) >= 0 && number(row, "y", -1) <= 100;
    }

    private static String phase(int time) {
        if (time < 600) return "laning";
        if (time < 1200) return "mid_game";
        return "late_game";
    }

    private static String locationFromJump(JsonObject jump) {
        JsonObject focus = object(jump, "map_focus");
        return regionLabel(focus);
    }

    private static String regionLabel(JsonObject source) {
        String region = stringValue(source, "region", "unknown");
        return switch (region) {
            case "top_lane" -> "上路";
            case "mid_lane" -> "中路";
            case "bottom_lane", "bot_lane" -> "下路";
            case "radiant_jungle" -> "天辉野区";
            case "dire_jungle" -> "夜魇野区";
            case "roshan", "roshan_pit" -> "肉山区域";
            case "river" -> "河道";
            case "radiant_base" -> "天辉基地";
            case "dire_base" -> "夜魇基地";
            default -> "地图已定位区域";
        };
    }

    private static String objectiveLabel(String kind, String target) {
        if ("building".equals(kind)) {
            if (target.contains("_rax_")) return "兵营";
            if (target.contains("_fort")) return "遗迹";
            return "防御塔";
        }
        return switch (kind) {
            case "tower", "building" -> "防御塔";
            case "barracks" -> "兵营";
            case "roshan" -> "肉山";
            case "aegis" -> "不朽之守护";
            default -> "地图目标";
        };
    }

    private static String itemLabel(String key) {
        return switch (key) {
            case "blink" -> "闪烁匕首";
            case "black_king_bar" -> "黑皇杖";
            case "aghanims_scepter" -> "阿哈利姆神杖";
            case "aghanims_shard" -> "阿哈利姆魔晶";
            case "refresher" -> "刷新球";
            case "sheepstick" -> "邪恶镰刀";
            case "travel_boots" -> "远行鞋";
            case "travel_boots_2" -> "远行鞋 2";
            default -> key.replace('_', ' ');
        };
    }

    private static String laneLabel(String lane) {
        return switch (lane) {
            case "top" -> "上路";
            case "mid" -> "中路";
            case "bottom", "bot" -> "下路";
            default -> "本路";
        };
    }

    private static String deliveryModeLabel(String mode) {
        return switch (mode) {
            case "courier_delivery_inferred" ->
                "库存轨迹符合仓库到英雄的信使送达路径，但没有直接读取信使背包。";
            case "base_pickup_or_return" -> "物品在英雄位于基地时离开仓库，可能是回城自取。";
            case "direct_at_base" -> "物品购买后直接在基地进入可用栏位。";
            case "direct_inventory_observed" -> "物品购买后直接在英雄库存中观察到。";
            case "usable_state_unobserved" -> "购买已确认，但本场没有观察到进入可用栏位。";
            default -> "已确认库存节点，具体配送方式证据不足。";
        };
    }

    private static String runeLabel(String type) {
        return switch (type) {
            case "double_damage" -> "双倍伤害神符";
            case "haste" -> "极速神符";
            case "illusion" -> "幻象神符";
            case "invisibility" -> "隐身神符";
            case "regeneration" -> "恢复神符";
            case "bounty" -> "赏金神符";
            case "arcane" -> "奥术神符";
            case "water" -> "圣水神符";
            case "wisdom" -> "智慧神符";
            case "shield" -> "护盾神符";
            default -> "神符";
        };
    }

    private static String runeKeepAction(int position, String type) {
        if ("wisdom".equals(type) && position >= 4) {
            return "继续在智慧神符刷新前安排路线，同时确认本路核心能否安全单吃。";
        }
        return position >= 4
                ? "继续把控符与插眼、游走或回线安排在同一次离线中。"
                : "继续在不漏大波安全兵线的前提下争夺关键神符。";
    }

    private static String supportAwayFact(JsonObject window, int start, int end) {
        return formatTime(start) + "-" + formatTime(end) + " 离开本路，期间拿符 "
                + intValue(window, "runes", 0) + "、叠野 "
                + intValue(window, "stacks", 0) + "、插眼 "
                + intValue(window, "wards", 0) + "、参与击杀 "
                + (intValue(window, "kills", 0) + intValue(window, "assists", 0))
                + "；本路核心阵亡 " + intValue(window, "core_deaths", 0) + " 次。";
    }

    private static String levelSpikeAction(int position) {
        return position <= 3
                ? "关键等级到达前先控好兵线和血蓝，升级后 30 秒内主动找补刀压制或击杀机会。"
                : "关键等级到达前提前靠近队友或控图点，升级后尽快把新技能转成压制收益。";
    }

    private static String wardKeepAction(int position) {
        return position >= 4
                ? "继续在目标前提前布置能看见入口和高台的视野。"
                : "保留这种用个人眼位保护打钱或接战路线的习惯。";
    }

    private static String deathAction(int position) {
        return position <= 3
                ? "下一次接战前先确认第一轮技能、撤退方向和队友距离。"
                : "下一次接战前先确认站位、救人技能范围和撤退路线。";
    }

    private static String objectiveKeepAction(int position) {
        return position <= 3
                ? "继续把装备或击杀窗口及时转成塔、肉山或兵营收益。"
                : "继续提前为目标布置视野并跟随队伍完成转化。";
    }

    private static String teleportKeepAction(int position) {
        return position >= 4
                ? "继续在队友受压前预留 TP，并优先落在安全支援点。"
                : "继续在不放弃大波安全兵线的前提下响应关键冲突。";
    }

    private static String formatTime(int time) {
        int second = Math.max(0, time);
        return String.format("%02d:%02d", second / 60, second % 60);
    }

    private static String formatDuration(int seconds) {
        int value = Math.max(0, seconds);
        return String.format("%02d:%02d", value / 60, value % 60);
    }

    private static int eventTime(JsonObject event) {
        if (event == null) return 0;
        if (event.has("time")) return intValue(event, "time", 0);
        if (event.has("game_time_ms")) {
            return (int) Math.max(0, Math.round(number(event, "game_time_ms", 0) / 1000.0));
        }
        return intValue(event, "start", intValue(event, "placedAt", 0));
    }

    private static boolean containsInt(JsonArray array, int value) {
        if (array == null) return false;
        for (JsonElement element : array) {
            try {
                if (element.getAsInt() == value) return true;
            } catch (RuntimeException ignored) {
                // Ignore malformed source rows.
            }
        }
        return false;
    }

    private static JsonArray strings(String... values) {
        JsonArray rows = new JsonArray();
        for (String value : values) rows.add(value);
        return rows;
    }

    private static JsonArray strings(Set<String> values) {
        JsonArray rows = new JsonArray();
        for (String value : values) rows.add(value);
        return rows;
    }

    private static JsonArray arrayCopy(JsonObject source, String key) {
        JsonArray value = array(source, key);
        return value == null ? new JsonArray() : value.deepCopy();
    }

    private static JsonArray toArray(List<JsonObject> rows) {
        JsonArray result = new JsonArray();
        for (JsonObject row : rows) result.add(row);
        return result;
    }

    private static JsonObject object(JsonObject parent, String key) {
        if (parent == null || !parent.has(key) || !parent.get(key).isJsonObject()) return null;
        return parent.getAsJsonObject(key);
    }

    private static JsonArray array(JsonObject parent, String key) {
        if (parent == null || !parent.has(key) || !parent.get(key).isJsonArray()) return null;
        return parent.getAsJsonArray(key);
    }

    private static int intValue(JsonObject object, String key, int fallback) {
        if (object == null || !object.has(key)) return fallback;
        try {
            return object.get(key).getAsInt();
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static double number(JsonObject object, String key, double fallback) {
        if (object == null || !object.has(key)) return fallback;
        try {
            return object.get(key).getAsDouble();
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static boolean booleanValue(JsonObject object, String key, boolean fallback) {
        if (object == null || !object.has(key)) return fallback;
        try {
            return object.get(key).getAsBoolean();
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static String stringValue(JsonObject object, String key, String fallback) {
        if (object == null || !object.has(key)) return fallback;
        try {
            String value = object.get(key).getAsString();
            return value == null ? fallback : value;
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static void copy(JsonObject target, JsonObject source, String key) {
        if (source == null || !source.has(key) || source.get(key).isJsonNull()) return;
        target.add(key, source.get(key).deepCopy());
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private record Selection(JsonArray importantEvents) {
    }

    private record FightMatch(JsonObject fight, String id, boolean gatePassed,
            int responsibilityScore, int confidence, int importance) {
        static FightMatch empty() {
            return new FightMatch(null, null, false, 50, 0, 0);
        }
    }

    private static final class SnapshotLookup {
        private final List<String> fields;
        private final List<String> regions;
        private final JsonArray rows;

        private SnapshotLookup(List<String> fields, List<String> regions, JsonArray rows) {
            this.fields = fields;
            this.regions = regions;
            this.rows = rows;
        }

        static SnapshotLookup from(JsonObject modules, int slot) {
            JsonObject snapshots = object(modules, "snapshots");
            JsonArray fieldsJson = array(snapshots, "fields");
            JsonArray regionsJson = array(snapshots, "regions");
            JsonObject bySlot = object(snapshots, "by_slot");
            JsonArray rows = array(bySlot, Integer.toString(slot));
            List<String> fields = new ArrayList<>();
            if (fieldsJson != null) {
                for (JsonElement element : fieldsJson) fields.add(element.getAsString());
            }
            List<String> regions = new ArrayList<>();
            if (regionsJson != null) {
                for (JsonElement element : regionsJson) regions.add(element.getAsString());
            }
            return new SnapshotLookup(fields, regions, rows);
        }

        JsonObject nearest(int time) {
            if (rows == null || fields.isEmpty()) return null;
            int secondIndex = fields.indexOf("second");
            int xIndex = fields.indexOf("x");
            int yIndex = fields.indexOf("y");
            int regionIndex = fields.indexOf("region");
            if (secondIndex < 0) return null;
            JsonArray best = null;
            int distance = Integer.MAX_VALUE;
            for (JsonElement element : rows) {
                if (!element.isJsonArray()) continue;
                JsonArray row = element.getAsJsonArray();
                if (row.size() <= secondIndex) continue;
                Integer current = integer(row.get(secondIndex));
                if (current == null
                        || !hasLocation(row, xIndex, yIndex, regionIndex)) {
                    continue;
                }
                int nextDistance = Math.abs(current - time);
                if (nextDistance < distance) {
                    best = row;
                    distance = nextDistance;
                }
            }
            if (best == null || distance > 45) return null;
            JsonObject position = new JsonObject();
            if (xIndex >= 0 && yIndex >= 0 && best.size() > Math.max(xIndex, yIndex)) {
                Double x = number(best.get(xIndex));
                Double y = number(best.get(yIndex));
                if (x != null && y != null
                        && x >= 0 && x <= 100 && y >= 0 && y <= 100) {
                    position.addProperty("x", x);
                    position.addProperty("y", y);
                    position.addProperty("coordinate_valid", true);
                    position.addProperty("coordinate_space", "map_percent");
                    position.addProperty("coordinate_source", "player_snapshot");
                    position.addProperty("coordinate_version", "snapshot-columns/1.1");
                    position.addProperty("location_confidence", 82);
                }
            }
            if (regionIndex >= 0 && best.size() > regionIndex) {
                Integer id = integer(best.get(regionIndex));
                if (id != null && id >= 0 && id < regions.size()) {
                    position.addProperty("region", regions.get(id));
                }
            }
            return position;
        }

        private boolean hasLocation(JsonArray row, int xIndex, int yIndex, int regionIndex) {
            if (xIndex >= 0 && yIndex >= 0 && row.size() > Math.max(xIndex, yIndex)) {
                Double x = number(row.get(xIndex));
                Double y = number(row.get(yIndex));
                if (x != null && y != null
                        && x >= 0 && x <= 100 && y >= 0 && y <= 100) {
                    return true;
                }
            }
            if (regionIndex < 0 || row.size() <= regionIndex) return false;
            Integer region = integer(row.get(regionIndex));
            return region != null && region >= 0 && region < regions.size();
        }

        private static Double number(JsonElement element) {
            if (element == null || element.isJsonNull() || !element.isJsonPrimitive()) return null;
            try {
                double value = element.getAsDouble();
                return Double.isFinite(value) ? value : null;
            } catch (RuntimeException ignored) {
                return null;
            }
        }

        private static Integer integer(JsonElement element) {
            if (element == null || element.isJsonNull() || !element.isJsonPrimitive()) return null;
            try {
                return element.getAsInt();
            } catch (RuntimeException ignored) {
                return null;
            }
        }
    }
}
