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

final class PlayerReportNarrativeV3 {
    private static final Set<String> REVIEWABLE_FIGHT_KINDS = Set.of(
            "teamfight", "skirmish", "small_skirmish", "pickoff");

    private PlayerReportNarrativeV3() {
    }

    static void enrich(JsonObject modules, JsonObject report, JsonObject facts, int slot, int position,
            int counterpart, int reportConfidence, int overall, JsonArray dimensionRows, JsonArray phaseScores) {
        JsonObject evidenceIndex = new JsonObject();
        enhanceDimensions(dimensionRows, evidenceIndex, slot, reportConfidence);

        LaneContext lane = laneContext(modules, slot, evidenceIndex);
        List<FightContext> fights = fightContexts(modules, slot);
        FarmContext farm = farmContext(modules, slot, position);

        List<JsonObject> insights = new ArrayList<>();
        addLaneInsights(insights, lane, slot, position, reportConfidence);
        addFarmInsight(insights, farm, slot, position, reportConfidence, evidenceIndex);
        Set<String> timingCoveredFightIds = addCombatTimingInsights(
                insights, report, fights, slot, position, reportConfidence, evidenceIndex);
        addCombatInsights(insights, fights, slot, position, reportConfidence, evidenceIndex,
                timingCoveredFightIds);
        ensureAggregateStrength(insights, dimensionRows, slot, position, reportConfidence);

        JsonArray rootCauses = PlayerReportRootCauseAnalysis.aggregate(
                modules, facts, insights, evidenceIndex, slot, position, dimensionRows);
        linkDimensionInsights(dimensionRows, insights);
        JsonArray storyNodes = storyNodes(facts, lane, farm, fights, slot, position, reportConfidence,
                phaseScores, dimensionRows, evidenceIndex);
        JsonArray insightRows = toArray(insights);
        JsonArray trainingPlan = trainingPlan(insights, slot, position);
        JsonObject scoreCard = scoreCard(report, dimensionRows, reportConfidence, overall, rootCauses);
        JsonObject brief = brief(storyNodes, insights, trainingPlan, dimensionRows, reportConfidence, overall);

        report.add("brief", brief);
        report.add("score_card", scoreCard);
        report.add("story_nodes", storyNodes);
        report.add("insights", insightRows);
        report.add("root_causes", rootCauses);
        report.add("training_plan", trainingPlan);
        report.add("evidence_index", evidenceIndex);
        report.addProperty("localization_model", PlayerReportLocalization.MODEL);

        JsonArray caveats = new JsonArray();
        caveats.add("single_match_relative_not_rank_percentile");
        caveats.add("role_inferred_from_first_10_minutes");
        if (dimensionCoverage(dimensionRows) < 10) {
            caveats.add("missing_dimensions_excluded_from_weighted_score");
        }
        caveats.add("hero_specific_duties_require_human_review");
        caveats.add("ability_opportunity_judgments_require_exact_patch_metadata");
        report.add("caveats", caveats);
    }

    private static void enhanceDimensions(JsonArray dimensions, JsonObject evidenceIndex, int slot,
            int reportConfidence) {
        for (JsonElement element : dimensions) {
            if (!element.isJsonObject()) continue;
            JsonObject row = element.getAsJsonObject();
            String dimensionKey = stringValue(row, "key", "unknown");
            boolean available = booleanValue(row, "available", row.has("score"));
            int score = intValue(row, "score", 50);
            double effectiveWeight = number(row, "effective_weight");
            if (!row.has("confidence")) row.addProperty("confidence", reportConfidence);
            if (available) {
                row.addProperty("score_impact", round1((score - 50) * effectiveWeight / 100.0));
            } else {
                row.remove("score");
                row.remove("score_impact");
                row.addProperty("status", "missing");
            }

            JsonArray metricRefs = new JsonArray();
            JsonArray metrics = array(row, "evidence");
            if (metrics != null) {
                for (JsonElement metricElement : metrics) {
                    if (!metricElement.isJsonObject()) continue;
                    JsonObject metric = metricElement.getAsJsonObject();
                    String metricKey = stringValue(metric, "key", "metric");
                    String reference = "metric:" + slot + ":" + dimensionKey + ":" + metricKey;
                    JsonObject indexed = metric.deepCopy();
                    indexed.addProperty("id", reference);
                    indexed.addProperty("type", "metric");
                    indexed.addProperty("dimension_key", dimensionKey);
                    indexed.addProperty("label", metricLabel(metricKey));
                    evidenceIndex.add(reference, indexed);
                    metricRefs.add(reference);
                }
            }
            row.add("metric_refs", metricRefs);
            row.add("positive_refs", new JsonArray());
            row.add("negative_refs", new JsonArray());
            row.add("behavior_components", new JsonArray());
        }
    }

    private static LaneContext laneContext(JsonObject modules, int slot, JsonObject evidenceIndex) {
        JsonObject laning = object(modules, "laning");
        JsonObject reviews = object(laning, "reviews_by_slot");
        JsonObject review = object(reviews, Integer.toString(slot));
        if (review == null) return new LaneContext(null, null, null, null, 600, 0);

        JsonObject checkpoint = lastCheckpoint(review);
        JsonObject route = object(review, "support_route");
        int time = intValue(checkpoint, "time", 600);
        int confidence = intValue(review, "confidence", 0);
        String reference = "lane:" + slot + ":" + time;
        JsonObject indexed = new JsonObject();
        indexed.addProperty("id", reference);
        indexed.addProperty("type", "lane");
        indexed.addProperty("slot", slot);
        indexed.addProperty("time", time);
        indexed.addProperty("lane", stringValue(review, "lane", "unknown"));
        indexed.addProperty("score", intValue(checkpoint, "score", intValue(review, "score", 0)));
        indexed.addProperty("verdict", stringValue(checkpoint, "verdict",
                stringValue(review, "verdict", "even")));
        indexed.addProperty("confidence", confidence);
        copy(indexed, checkpoint, "last_hits_diff");
        copy(indexed, checkpoint, "level_diff");
        copy(indexed, checkpoint, "core_xp_diff");
        copy(indexed, checkpoint, "pair_xp_diff");
        copy(indexed, checkpoint, "support_xp_diff");
        copy(indexed, checkpoint, "networth_diff");
        if (route != null) {
            JsonObject routeFacts = new JsonObject();
            for (String key : List.of("lane_seconds", "away_seconds", "lane_presence_pct", "stacks", "runes",
                    "wards", "away_assists", "away_kills", "core_deaths_away", "core_xp_away",
                    "core_last_hits_away", "score", "interpretation")) {
                copy(routeFacts, route, key);
            }
            indexed.add("support_route", routeFacts);
        }
        evidenceIndex.add(reference, indexed);
        return new LaneContext(review, checkpoint, route, reference, time, confidence);
    }

    private static FarmContext farmContext(JsonObject modules, int slot, int position) {
        if (position > 3) return new FarmContext(null, 0);
        JsonObject farm = object(modules, "farm");
        JsonObject bySlot = object(farm, "diagnostics_by_slot");
        JsonArray diagnostics = array(bySlot, Integer.toString(slot));
        if (diagnostics == null) return new FarmContext(null, 0);

        JsonObject best = null;
        int bestGain = 0;
        for (JsonElement element : diagnostics) {
            if (!element.isJsonObject()) continue;
            JsonObject diagnostic = element.getAsJsonObject();
            int gain = intValue(diagnostic, "suggestedGold", 0) - intValue(diagnostic, "actualGold", 0);
            boolean enabled = booleanValue(diagnostic, "recommendation_enabled", false);
            int confidence = intValue(diagnostic, "confidence", 0);
            if (!enabled || confidence < 70 || gain <= 0) continue;
            if (best == null || gain > bestGain
                    || gain == bestGain && confidence > intValue(best, "confidence", 0)) {
                best = diagnostic;
                bestGain = gain;
            }
        }
        return new FarmContext(best, bestGain);
    }

    private static List<FightContext> fightContexts(JsonObject modules, int slot) {
        List<FightContext> result = new ArrayList<>();
        JsonObject combat = object(modules, "combat");
        JsonArray fights = array(combat, "fights");
        if (fights == null) return result;
        for (JsonElement element : fights) {
            if (!element.isJsonObject()) continue;
            JsonObject fight = element.getAsJsonObject();
            String kind = stringValue(fight, "kind", "");
            if (!REVIEWABLE_FIGHT_KINDS.contains(kind)) continue;
            JsonObject contribution = contribution(fight, slot);
            if (contribution == null) continue;
            JsonObject gate = object(contribution, "responsibility_gate");
            int start = intValue(fight, "contact_start", intValue(fight, "start", 0));
            int end = intValue(fight, "contact_end", intValue(fight, "end", start));
            result.add(new FightContext(
                    fight,
                    contribution,
                    "combat:" + stringValue(fight, "id", "fight-" + start) + ":" + slot,
                    start,
                    end,
                    kind,
                    stringValue(fight, "region", "unknown"),
                    intValue(contribution, "responsibilityScore", 0),
                    intValue(contribution, "confidence", 0),
                    "passed".equals(stringValue(gate, "status", ""))));
        }
        result.sort(Comparator.comparingInt(FightContext::start));
        return result;
    }

    private static void addLaneInsights(List<JsonObject> insights, LaneContext lane, int slot, int position,
            int reportConfidence) {
        if (lane.review == null || lane.reference == null) return;
        int confidence = Math.min(reportConfidence, lane.confidence);
        if (confidence < 55) return;

        String location = laneLabel(stringValue(lane.review, "lane", "unknown"));
        String verdict = stringValue(lane.review, "verdict", "even");
        if (position >= 4 && lane.route != null) {
            int away = intValue(lane.route, "away_seconds", 0);
            int deaths = intValue(lane.route, "core_deaths_away", 0);
            int gains = supportRouteGains(lane.route);
            String fact = "前10分钟离线 " + formatSeconds(away) + "，离线期间本路核心阵亡 "
                    + deaths + " 次；离线收益为" + supportRouteOutcome(lane.route) + "。";
            if (deaths > 0 || away >= 60 && gains == 0) {
                JsonObject insight = insight("advice:lane-support-" + slot, "improvement",
                        "lane_support_route", deaths > 0 ? "high" : "medium", confidence, lane.time, 600,
                        location,
                        position == 4 ? "离线收益没有覆盖3号位承压代价" : "离线收益没有覆盖1号位保护代价",
                        fact,
                        deaths > 0
                                ? "离线路线与核心安全窗口发生冲突，属于位置职责问题。"
                                : "离线时间较长，但没有形成神符、叠野、视野或击杀助攻收益。",
                        deaths > 0 ? "核心死亡会扩大对线经验和兵线控制损失。" : "无收益离线会同时损失本路压制和核心保护。",
                        supportLaneAction(position), "development", lane.time, slot, lane.reference);
                insight.add("dimension_impacts", impacts("lane_execution", deaths > 0 ? -5.0 : -3.0,
                        "map_tempo", gains > 0 ? 1.0 : -2.0));
                applyLocalization(insight,
                        PlayerReportLocalization.forLane(lane.review, lane.time, lane.reference, slot));
                insights.add(insight);
            } else if (away >= 30 && deaths == 0 && gains >= 2) {
                JsonObject insight = insight("insight:lane-support-" + slot, "strength",
                        "lane_support_route", "positive", confidence, lane.time, 600, location,
                        "离线有明确回报且核心保持安全",
                        fact,
                        "离线期间核心没有阵亡，且路线产生了至少两项可确认收益。",
                        "这类离线同时创造团队价值并释放核心单吃经验空间。",
                        supportLaneKeepAction(position), "development", lane.time, slot, lane.reference);
                insight.add("dimension_impacts", impacts("lane_execution", 2.0, "map_tempo", 3.0));
                applyLocalization(insight,
                        PlayerReportLocalization.forLane(lane.review, lane.time, lane.reference, slot));
                insights.add(insight);
            }
            return;
        }

        if (position > 3) return;
        JsonObject checkpoint = lane.checkpoint;
        String fact = "10分钟主要对位补刀差 " + signed(intValue(checkpoint, "last_hits_diff", 0))
                + "，等级差 " + signed(intValue(checkpoint, "level_diff", 0))
                + "，核心经验差 " + signed(intValue(checkpoint, "core_xp_diff", 0)) + "。";
        if ("disadvantage".equals(verdict) || "major_disadvantage".equals(verdict)) {
            JsonObject insight = insight("advice:lane-core-" + slot, "improvement",
                    "lane_execution", "major_disadvantage".equals(verdict) ? "high" : "medium",
                    confidence, lane.time, 600, location,
                    coreLaneIssueTitle(position), fact,
                    "补刀、等级或经验差已经达到本场对位劣势门槛。",
                    "继续高风险换血会让经验区和下一波兵线更难处理。",
                    coreLaneAction(position), "development", lane.time, slot, lane.reference);
            insight.add("dimension_impacts", impacts("lane_execution", -4.0, "survival_risk", -1.5));
            applyLocalization(insight,
                    PlayerReportLocalization.forLane(lane.review, lane.time, lane.reference, slot));
            insights.add(insight);
        } else if ("advantage".equals(verdict) || "major_advantage".equals(verdict)) {
            JsonObject insight = insight("insight:lane-core-" + slot, "strength",
                    "lane_execution", "positive", confidence, lane.time, 600, location,
                    coreLaneStrengthTitle(position), fact,
                    "10分钟对位检查点达到优势门槛。",
                    "对线优势为下一阶段的装备或节奏窗口提供了资源基础。",
                    coreLaneKeepAction(position), "development", lane.time, slot, lane.reference);
            insight.add("dimension_impacts", impacts("lane_execution", 4.0, "map_tempo", 1.5));
            applyLocalization(insight,
                    PlayerReportLocalization.forLane(lane.review, lane.time, lane.reference, slot));
            insights.add(insight);
        }
    }

    private static void addFarmInsight(List<JsonObject> insights, FarmContext farm, int slot, int position,
            int reportConfidence, JsonObject evidenceIndex) {
        if (position > 3 || farm.diagnostic == null) return;
        JsonObject diagnostic = farm.diagnostic;
        int confidence = Math.min(reportConfidence, intValue(diagnostic, "confidence", 0));
        if (confidence < 55) return;
        int time = intValue(diagnostic, "time", 0);
        int end = intValue(diagnostic, "end", time + 30);
        String id = stringValue(diagnostic, "id", "diagnostic-" + slot + "-" + time);
        String reference = "farm:" + id;
        ensureFarmEvidence(evidenceIndex, reference, diagnostic, slot);

        String actual = farmOptionLabel(stringValue(diagnostic, "actual", "unknown"));
        String recommendation = farmOptionLabel(stringValue(diagnostic, "recommendation", "unknown"));
        JsonObject insight = insight("advice:" + id, "improvement", "farm_route", "medium",
                confidence, time, end, regionLabel(stringValue(diagnostic, "region",
                        routeRegion(stringValue(diagnostic, "route_resource", "")))),
                time >= 1200 ? "20分钟后资源路线存在更高收益选择" : "发育窗口存在更高收益选择",
                formatSeconds(time) + " 后的观察窗口实际选择" + actual + "，获得 "
                        + intValue(diagnostic, "actualGold", 0) + " 金；门禁通过的候选为"
                        + recommendation + "，预计 " + intValue(diagnostic, "suggestedGold", 0) + " 金。",
                "候选路线已通过敌方可见性、资源存续和移动时间门禁。",
                "该窗口预计少转化约 " + farm.gain + " 金，且可能推迟下一件关键装备。",
                farmAction(position, recommendation), "farm", time, slot, reference);
        insight.add("dimension_impacts", impacts("resource_decision", -4.0, "farm_efficiency", -2.0));
        applyLocalization(insight, PlayerReportLocalization.forFarm(diagnostic, slot));
        insights.add(insight);
    }

    private static Set<String> addCombatTimingInsights(List<JsonObject> insights, JsonObject report,
            List<FightContext> fights, int slot, int position, int reportConfidence,
            JsonObject evidenceIndex) {
        Set<String> coveredFightIds = new LinkedHashSet<>();
        JsonObject timing = object(report, "combat_timing");
        if (timing == null) return coveredFightIds;

        JsonArray factRows = array(timing, "fight_facts");
        if (factRows != null) {
            for (JsonElement element : factRows) {
                if (!element.isJsonObject()) continue;
                JsonObject fact = element.getAsJsonObject();
                String id = stringValue(fact, "id", "");
                if (id.isBlank() || evidenceIndex.has(id)) continue;
                JsonObject evidence = fact.deepCopy();
                evidence.addProperty("type", "combat_timing");
                evidenceIndex.add(id, evidence);
            }
        }

        JsonArray patterns = array(timing, "patterns");
        if (patterns == null) return coveredFightIds;
        for (JsonElement element : patterns) {
            if (!element.isJsonObject()) continue;
            JsonObject pattern = element.getAsJsonObject();
            if (!booleanValue(pattern, "ordinary_eligible", false)) continue;
            String kind = stringValue(pattern, "kind", "");
            if (!"improvement".equals(kind) && !"strength".equals(kind)) continue;
            JsonObject jump = object(pattern, "jump_target");
            if (jump == null || !PlayerReportLocalization.ordinaryEligible(jump)) continue;

            JsonArray occurrenceRows = array(pattern, "occurrences");
            if (occurrenceRows != null) {
                for (JsonElement occurrenceElement : occurrenceRows) {
                    if (!occurrenceElement.isJsonObject()) continue;
                    String targetFightId = stringValue(
                            occurrenceElement.getAsJsonObject(), "fight_id", "");
                    if (targetFightId.isBlank()) continue;
                    coveredFightIds.add(targetFightId);
                    fights.stream()
                            .filter(fight -> targetFightId.equals(fightId(fight.fight)))
                            .findFirst()
                            .ifPresent(fight -> ensureFightEvidence(evidenceIndex, fight, slot));
                }
            }

            int time = intValue(jump, "time", 0);
            int start = intValue(jump, "range_start", time);
            int end = intValue(jump, "range_end", time);
            String region = occurrenceRows != null && !occurrenceRows.isEmpty()
                    ? stringValue(occurrenceRows.get(0).getAsJsonObject(), "region", "unknown")
                    : stringValue(object(jump, "map_focus"), "region", "unknown");
            int confidence = Math.min(reportConfidence, intValue(pattern, "confidence", reportConfidence));
            JsonObject insight = insight(
                    "insight:" + stringValue(pattern, "id", "combat-timing"),
                    kind,
                    "combat_timing",
                    "strength".equals(kind) ? "positive" : "high",
                    confidence,
                    start,
                    end,
                    regionLabel(region),
                    stringValue(pattern, "title", "战斗时机复核"),
                    stringValue(pattern, "what_happened", ""),
                    stringValue(pattern, "why_it_matters", ""),
                    stringValue(pattern, "result", ""),
                    stringValue(pattern, "next_action", combatAction(position)),
                    "combat",
                    time,
                    slot);
            for (String key : List.of(
                    "pattern_type", "occurrences", "item_context",
                    "diagnostic_tags", "dimension_impacts")) {
                copy(insight, pattern, key);
            }
            JsonArray evidenceRefs = array(pattern, "evidence_refs");
            insight.add("evidence_refs",
                    evidenceRefs == null ? new JsonArray() : evidenceRefs.deepCopy());
            insight.addProperty("root_cause_id",
                    stringValue(pattern, "root_cause_id",
                            "combat-timing:" + stringValue(pattern, "id", "")));
            insight.add("jump_target", jump.deepCopy());
            insight.addProperty("ordinary_eligible", true);
            insights.add(insight);
        }
        return coveredFightIds;
    }

    private static void addCombatInsights(List<JsonObject> insights, List<FightContext> fights, int slot,
            int position, int reportConfidence, JsonObject evidenceIndex,
            Set<String> timingCoveredFightIds) {
        FightContext issue = fights.stream()
                .filter(FightContext::gatePassed)
                .filter(fight -> !timingCoveredFightIds.contains(fightId(fight.fight)))
                .filter(fight -> fight.confidence >= 55 && fight.score < 55)
                .min(Comparator.comparingInt(FightContext::score))
                .orElse(null);
        if (issue != null) {
            ensureFightEvidence(evidenceIndex, issue, slot);
            int confidence = Math.min(reportConfidence, issue.confidence);
            JsonObject row = issue.contribution;
            JsonObject insight = insight("advice:" + fightId(issue.fight) + ":" + slot,
                    "improvement", "combat_duty", issue.score < 40 ? "high" : "medium",
                    confidence, issue.start, issue.end, regionLabel(issue.region),
                    positionName(position) + "在这场有效战斗中的职责完成不足",
                    formatSeconds(issue.start) + " 的" + fightKindLabel(issue.kind) + "中，职责分 "
                            + issue.score + "，在场率 " + intValue(row, "presencePct", 0)
                            + "%，伤害 " + intValue(row, "damage", 0) + "，控制 "
                            + round1(number(row, "controlSeconds")) + " 秒。",
                    "该片段通过技能状态、距离和合理目标等职责证据门禁，评分没有被证据不足抑制。",
                    "队伍在这次有效接触中没有获得完整的" + positionName(position) + "职责产出。",
                    combatAction(position), "combat", issue.start, slot, issue.reference);
            insight.add("dimension_impacts", impacts("combat_duty", -5.0, "combat_output", -2.0));
            applyLocalization(insight, PlayerReportLocalization.forFight(issue.fight, slot));
            insights.add(insight);
        }

        FightContext strength = fights.stream()
                .filter(FightContext::gatePassed)
                .filter(fight -> !timingCoveredFightIds.contains(fightId(fight.fight)))
                .filter(fight -> fight.confidence >= 70 && fight.score >= 70)
                .max(Comparator.comparingInt(FightContext::score))
                .orElse(null);
        if (strength != null) {
            ensureFightEvidence(evidenceIndex, strength, slot);
            int confidence = Math.min(reportConfidence, strength.confidence);
            JsonObject row = strength.contribution;
            JsonObject insight = insight("insight:" + fightId(strength.fight) + ":" + slot,
                    "strength", "combat_duty", "positive", confidence, strength.start, strength.end,
                    regionLabel(strength.region),
                    positionName(position) + "在关键接触中完成了主要职责",
                    formatSeconds(strength.start) + " 的" + fightKindLabel(strength.kind) + "中，职责分 "
                            + strength.score + "，在场率 " + intValue(row, "presencePct", 0)
                            + "%，技能/物品使用 " + intValue(row, "abilityCasts", 0) + "/"
                            + intValue(row, "itemUses", 0) + "。",
                    "该片段通过职责硬门禁，且个人结果达到稳定区间。",
                    "这次贡献提高了队伍有效接触中的职责完整度。",
                    combatKeepAction(position), "combat", strength.start, slot, strength.reference);
            insight.add("dimension_impacts", impacts("combat_duty", 4.0, "team", 1.5));
            applyLocalization(insight, PlayerReportLocalization.forFight(strength.fight, slot));
            insights.add(insight);
        }
    }

    private static void ensureAggregateStrength(List<JsonObject> insights, JsonArray dimensions, int slot,
            int position, int reportConfidence) {
        if (insights.stream().anyMatch(item -> "strength".equals(stringValue(item, "kind", "")))) return;
        JsonObject best = null;
        for (JsonElement element : dimensions) {
            if (!element.isJsonObject()) continue;
            JsonObject row = element.getAsJsonObject();
            if (!booleanValue(row, "available", row.has("score"))) continue;
            if (intValue(row, "score", 0) < 68) continue;
            if (best == null || intValue(row, "score", 0) > intValue(best, "score", 0)) best = row;
        }
        if (best == null || reportConfidence < 70) return;
        String key = stringValue(best, "key", "dimension");
        String source = stringValue(best, "source", "");
        JsonArray refs = array(best, "metric_refs");
        JsonObject insight = insight("insight:aggregate:" + slot + ":" + key, "strength",
                categoryForSource(source), "positive", reportConfidence, 0, 0, "",
                dimensionLabel(key) + "是本场相对稳定项",
                "该位置维度得分 " + intValue(best, "score", 0) + "，权重 "
                        + intValue(best, "weight", 0) + "%。",
                "结论来自本场同位置职责模型的聚合事实，不代表跨比赛百分位。",
                "这一项为本场职责完成提供了稳定基础。",
                keepAction(position, source), moduleForSource(source), 0, slot, strings(refs));
        insight.add("dimension_impacts", impacts(canonicalDimension(source), 2.0));
        insights.add(insight);
    }

    private static JsonArray storyNodes(JsonObject facts, LaneContext lane, FarmContext farm,
            List<FightContext> fights, int slot, int position, int reportConfidence, JsonArray phaseScores,
            JsonArray dimensions, JsonObject evidenceIndex) {
        int duration = phaseDuration(phaseScores);
        JsonObject lanePhase = phase(phaseScores, "laning");
        JsonObject midPhase = phase(phaseScores, "mid_game");
        JsonObject latePhase = phase(phaseScores, "late_game");
        List<FightContext> midFights = fights.stream()
                .filter(fight -> fight.start >= 600 && fight.start < 1200).toList();
        List<FightContext> lateFights = fights.stream().filter(fight -> fight.start >= 1200).toList();

        JsonArray result = new JsonArray();
        result.add(laneStory(facts, lane, lanePhase, slot, position, reportConfidence, dimensions));
        result.add(combatStory("story:midgame", "mid_game", 600, Math.min(1200, Math.max(600, duration)),
                "10-20分钟 · 转线与节奏", midPhase, midFights, slot, position, reportConfidence,
                dimensions, evidenceIndex));
        result.add(lateStory(facts, farm, latePhase, lateFights, slot, position, reportConfidence,
                duration, dimensions, evidenceIndex));
        return result;
    }

    private static JsonObject laneStory(JsonObject facts, LaneContext lane, JsonObject phase, int slot,
            int position, int reportConfidence, JsonArray dimensions) {
        int score = intValue(phase, "score", dimensionScore(dimensions, "lane", 50));
        String verdict = scoreVerdict(score);
        int highlight = lane.time;
        String summary;
        if (lane.review == null) {
            summary = "对线阶段记录到 " + intValue(phase, "last_hits", intValue(facts, "last_hits", 0))
                    + " 个补刀，K/D/A " + kda(phase) + "；缺少完整对位检查点，不判断线优线劣。";
            verdict = "missing";
        } else if (position >= 4 && lane.route != null) {
            int away = intValue(lane.route, "away_seconds", 0);
            int deaths = intValue(lane.route, "core_deaths_away", 0);
            int gains = supportRouteGains(lane.route);
            summary = "前10分钟离线 " + formatSeconds(away) + "，期间本路核心阵亡 " + deaths
                    + " 次；离线收益为" + supportRouteOutcome(lane.route) + "。";
            verdict = deaths > 0 || away >= 60 && gains == 0 ? "issue"
                    : away >= 30 && gains >= 2 ? "stable"
                    : laneVerdict(stringValue(lane.review, "verdict", "even"));
        } else {
            JsonObject checkpoint = lane.checkpoint;
            summary = "10分钟主要对位补刀差 " + signed(intValue(checkpoint, "last_hits_diff", 0))
                    + "，等级差 " + signed(intValue(checkpoint, "level_diff", 0))
                    + "，核心经验差 " + signed(intValue(checkpoint, "core_xp_diff", 0)) + "。";
            verdict = laneVerdict(stringValue(lane.review, "verdict", "even"));
        }

        JsonArray evidenceRefs = new JsonArray();
        if (lane.reference != null) evidenceRefs.add(lane.reference);
        JsonObject story = story("story:lane", "laning", 0, 600, verdict,
                position >= 4 ? "辅助路线与核心安全" : "对线执行与经验结果",
                summary, highlight, Math.min(reportConfidence, lane.confidence > 0 ? lane.confidence : reportConfidence),
                metricRefs(dimensions, "lane"), evidenceRefs, "development", highlight, slot);
        return story;
    }

    private static JsonObject combatStory(String id, String phaseName, int start, int end, String title,
            JsonObject phase, List<FightContext> fights, int slot, int position, int reportConfidence,
            JsonArray dimensions, JsonObject evidenceIndex) {
        List<FightContext> passed = fights.stream().filter(FightContext::gatePassed).toList();
        int averageScore = averageFightScore(passed);
        int phaseScore = intValue(phase, "score", 50);
        int score = passed.isEmpty() ? phaseScore : Math.round((phaseScore + averageScore) / 2.0f);
        String verdict = scoreVerdict(score);
        int damage = fights.stream().mapToInt(fight -> intValue(fight.contribution, "damage", 0)).sum();
        int presence = averagePresence(fights);
        String summary = fights.isEmpty()
                ? "该阶段没有足够的个人有效战斗归属，当前只展示阶段聚合事实：K/D/A " + kda(phase) + "。"
                : "参与 " + fights.size() + " 场有效冲突，已归属伤害 " + damage
                        + "，平均战场存在率 " + presence + "%；"
                        + (passed.isEmpty() ? "职责硬门禁均未通过，因此不输出负面职责结论。"
                                : "通过职责硬门禁 " + passed.size() + " 场。");
        if (!passed.isEmpty() && averageScore < 55) verdict = "issue";

        JsonArray evidenceRefs = new JsonArray();
        for (FightContext fight : fights.stream().limit(3).toList()) {
            ensureFightEvidence(evidenceIndex, fight, slot);
            evidenceRefs.add(fight.reference);
        }
        int highlight = fights.isEmpty() ? start : fights.get(0).start;
        return story(id, phaseName, start, end, verdict,
                position >= 4 ? title + " · 团队职责" : title + " · 核心职责",
                summary, highlight, reportConfidence, metricRefs(dimensions, "combat", "utility", "tempo"),
                evidenceRefs, fights.isEmpty() ? "timeline" : "combat", highlight, slot);
    }

    private static JsonObject lateStory(JsonObject facts, FarmContext farm, JsonObject phase,
            List<FightContext> fights, int slot, int position, int reportConfidence, int duration,
            JsonArray dimensions, JsonObject evidenceIndex) {
        int start = Math.min(1200, Math.max(0, duration));
        int end = Math.max(start, duration);
        int phaseScore = intValue(phase, "score", 50);
        String verdict = scoreVerdict(phaseScore);
        String summary;
        JsonArray evidenceRefs = new JsonArray();
        int highlight = start;

        if (duration < 1200) {
            summary = "本场在20分钟前结束，没有20分钟后的路线或团战样本。";
            verdict = "missing";
        } else if (position <= 3) {
            long gatedRoutes = farm.diagnostic != null && intValue(farm.diagnostic, "time", 0) >= 1200 ? 1 : 0;
            summary = "20分钟后参与 " + fights.size() + " 场有效冲突，阶段 K/D/A " + kda(phase)
                    + "；高置信度路线复核 " + gatedRoutes + " 个。"
                    + (gatedRoutes > 0 ? "存在已通过视野与资源存续门禁的替代路线。" : "");
            if (gatedRoutes > 0) {
                String reference = "farm:" + stringValue(farm.diagnostic, "id",
                        "diagnostic-" + slot + "-" + intValue(farm.diagnostic, "time", 0));
                ensureFarmEvidence(evidenceIndex, reference, farm.diagnostic, slot);
                evidenceRefs.add(reference);
                highlight = intValue(farm.diagnostic, "time", start);
                verdict = "issue";
            }
        } else {
            int observers = preferredInt(facts, "aggregate_observer_wards", "observer_wards");
            int sentries = preferredInt(facts, "aggregate_sentry_wards", "sentry_wards");
            summary = "20分钟后参与 " + fights.size() + " 场有效冲突，阶段 K/D/A " + kda(phase)
                    + "；全场布置假眼/真眼 " + observers + "/" + sentries
                    + "。辅助位置按战斗职责、目标前视野和团队功能复核。";
        }

        for (FightContext fight : fights.stream().limit(3).toList()) {
            ensureFightEvidence(evidenceIndex, fight, slot);
            evidenceRefs.add(fight.reference);
            if (highlight == start) highlight = fight.start;
        }
        return story("story:late", "late_game", start, end, verdict,
                position <= 3 ? "20分钟后 · 路线与战斗转化" : "20分钟后 · 团队职责与视野",
                summary, highlight, reportConfidence,
                position <= 3 ? metricRefs(dimensions, "economy", "combat", "objective")
                        : metricRefs(dimensions, "vision", "utility", "tempo"),
                evidenceRefs, !evidenceRefs.isEmpty() && evidenceRefs.get(0).getAsString().startsWith("farm:")
                        ? "farm" : fights.isEmpty() ? "timeline" : "combat",
                highlight, slot);
    }

    private static JsonObject story(String id, String phase, int start, int end, String verdict,
            String title, String summary, int highlightTime, int confidence, JsonArray keyMetrics,
            JsonArray evidenceRefs, String module, int jumpTime, int slot) {
        JsonObject row = new JsonObject();
        row.addProperty("id", id);
        row.addProperty("phase", phase);
        row.addProperty("start", start);
        row.addProperty("end", end);
        row.addProperty("verdict", verdict);
        row.addProperty("title", title);
        row.addProperty("summary", summary);
        row.addProperty("highlight_time", highlightTime);
        row.addProperty("confidence", confidence);
        row.add("key_metrics", keyMetrics);
        row.add("evidence_refs", evidenceRefs);
        row.add("jump_target", jumpTarget(module, jumpTime, slot));
        return row;
    }

    private static JsonArray trainingPlan(List<JsonObject> insights, int slot, int position) {
        JsonArray rows = new JsonArray();
        List<JsonObject> priorities = insights.stream()
                .filter(item -> "improvement".equals(stringValue(item, "kind", "")))
                .limit(2)
                .toList();
        int index = 0;
        for (JsonObject priority : priorities) {
            String category = stringValue(priority, "category", "");
            JsonObject row = new JsonObject();
            row.addProperty("id", "training:" + slot + ":" + index++);
            row.addProperty("trigger", trainingTrigger(category, position));
            row.addProperty("action", stringValue(priority, "action", roleBaselineAction(position)));
            row.addProperty("success_check", trainingSuccess(category, position));
            JsonArray sources = new JsonArray();
            sources.add(stringValue(priority, "id", ""));
            row.add("source_insights", sources);
            rows.add(row);
        }

        if (rows.size() < 2) {
            JsonObject baseline = new JsonObject();
            baseline.addProperty("id", "training:" + slot + ":role");
            baseline.addProperty("trigger", roleBaselineTrigger(position));
            baseline.addProperty("action", roleBaselineAction(position));
            baseline.addProperty("success_check", roleBaselineSuccess(position));
            baseline.add("source_insights", new JsonArray());
            rows.add(baseline);
        }
        if (rows.size() < 2) {
            JsonObject review = new JsonObject();
            review.addProperty("id", "training:" + slot + ":review");
            review.addProperty("trigger", "每局结束后打开一场有明确时间证据的片段");
            review.addProperty("action", "只复核一个可重复决策，并记录下一局的触发条件");
            review.addProperty("success_check", "下一局在同类场景中能够按预设动作执行");
            review.add("source_insights", new JsonArray());
            rows.add(review);
        }

        JsonObject strength = insights.stream()
                .filter(item -> "strength".equals(stringValue(item, "kind", "")))
                .findFirst().orElse(null);
        if (rows.size() < 3 && strength != null) {
            JsonObject keep = new JsonObject();
            keep.addProperty("id", "training:" + slot + ":keep");
            keep.addProperty("trigger", "相同优势窗口再次出现时");
            keep.addProperty("action", stringValue(strength, "action", combatKeepAction(position)));
            keep.addProperty("success_check", "继续产生同类可确认的正向证据");
            JsonArray sources = new JsonArray();
            sources.add(stringValue(strength, "id", ""));
            keep.add("source_insights", sources);
            rows.add(keep);
        }
        return rows;
    }

    private static JsonObject scoreCard(JsonObject report, JsonArray dimensions, int confidence, int overall,
            JsonArray rootCauses) {
        JsonObject row = new JsonObject();
        row.addProperty("overall_score", overall);
        row.addProperty("grade", stringValue(report, "grade", "-"));
        row.addProperty("confidence", confidence);
        row.addProperty("evidence_level", stringValue(report, "evidence_level", "partial"));
        row.addProperty("dimension_coverage", dimensionCoverage(dimensions));
        row.addProperty("dimension_target", 10);
        row.addProperty("available_weight", intValue(report, "available_weight", 0));
        row.add("dimensions", dimensions.deepCopy());
        row.add("root_cause_summary", PlayerReportRootCauseAnalysis.summary(rootCauses));
        return row;
    }

    private static JsonObject brief(JsonArray stories, List<JsonObject> insights, JsonArray training,
            JsonArray dimensions, int confidence, int overall) {
        JsonObject row = new JsonObject();
        JsonObject lane = stories.get(0).getAsJsonObject();
        JsonObject mid = stories.get(1).getAsJsonObject();
        JsonObject late = stories.get(2).getAsJsonObject();
        row.addProperty("verdict", storyPhrase(lane) + "；" + storyPhrase(mid) + "，" + storyPhrase(late) + "。");
        row.addProperty("next_match_focus", training.size() > 0
                ? stringValue(training.get(0).getAsJsonObject(), "action", "")
                : "下一局只选择一个有时间证据的职责动作练习。");
        row.add("domain_scores", domainScores(dimensions, confidence, overall));

        JsonArray storyRefs = new JsonArray();
        for (JsonElement story : stories) storyRefs.add(stringValue(story.getAsJsonObject(), "id", ""));
        row.add("story", storyRefs);

        JsonArray strengths = new JsonArray();
        insights.stream().filter(item -> "strength".equals(stringValue(item, "kind", "")))
                .limit(2).forEach(item -> strengths.add(stringValue(item, "id", "")));
        row.add("strengths", strengths);

        JsonArray priorities = new JsonArray();
        insights.stream().filter(item -> "improvement".equals(stringValue(item, "kind", "")))
                .limit(3).forEach(item -> priorities.add(stringValue(item, "id", "")));
        row.add("priorities", priorities);

        JsonArray trainingRefs = new JsonArray();
        for (JsonElement item : training) {
            trainingRefs.add(stringValue(item.getAsJsonObject(), "id", ""));
        }
        row.add("training_plan", trainingRefs);
        return row;
    }

    private static JsonArray domainScores(JsonArray dimensions, int confidence, int overall) {
        Map<String, Set<String>> sources = new LinkedHashMap<>();
        sources.put("lane", Set.of("lane"));
        sources.put("farm", Set.of("economy", "resource"));
        sources.put("tempo", Set.of("tempo", "objective"));
        sources.put("combat", Set.of("combat", "utility", "survival"));
        sources.put("team", Set.of("vision", "execution"));

        JsonArray result = new JsonArray();
        for (Map.Entry<String, Set<String>> entry : sources.entrySet()) {
            int weighted = 0;
            int weightedConfidence = 0;
            int weight = 0;
            for (JsonElement element : dimensions) {
                if (!element.isJsonObject()) continue;
                JsonObject dimension = element.getAsJsonObject();
                if (!entry.getValue().contains(stringValue(dimension, "source", ""))) continue;
                if (!booleanValue(dimension, "available", dimension.has("score"))) continue;
                int dimensionWeight = Math.max(1, intValue(dimension, "weight", 1));
                weighted += intValue(dimension, "score", overall) * dimensionWeight;
                weightedConfidence += intValue(dimension, "confidence", confidence) * dimensionWeight;
                weight += dimensionWeight;
            }
            JsonObject row = new JsonObject();
            row.addProperty("key", entry.getKey());
            row.addProperty("available", weight > 0);
            if (weight > 0) {
                row.addProperty("score", Math.round(weighted / (float) weight));
                row.addProperty("confidence", clamp(
                        Math.round(weightedConfidence / (float) weight), 0, 100));
            } else {
                row.addProperty("confidence", 0);
                row.addProperty("status", "missing");
            }
            result.add(row);
        }
        return result;
    }

    private static int dimensionCoverage(JsonArray dimensions) {
        int coverage = 0;
        for (JsonElement element : dimensions) {
            if (!element.isJsonObject()) continue;
            JsonObject row = element.getAsJsonObject();
            if (booleanValue(row, "available", row.has("score"))) coverage++;
        }
        return coverage;
    }

    private static void linkDimensionInsights(JsonArray dimensions, List<JsonObject> insights) {
        for (JsonElement element : dimensions) {
            if (!element.isJsonObject()) continue;
            JsonObject dimension = element.getAsJsonObject();
            String source = stringValue(dimension, "source", "");
            String dimensionKey = canonicalDimension(source);
            JsonArray positive = array(dimension, "positive_refs");
            JsonArray negative = array(dimension, "negative_refs");
            JsonArray components = array(dimension, "behavior_components");
            for (JsonObject insight : insights) {
                String category = stringValue(insight, "category", "");
                JsonObject impacts = object(insight, "dimension_impacts");
                boolean exactImpact = impacts != null && impacts.has(dimensionKey);
                if (sourceMatchesCategory(source, category) || exactImpact) {
                    if ("strength".equals(stringValue(insight, "kind", ""))) {
                        positive.add(stringValue(insight, "id", ""));
                    } else {
                        negative.add(stringValue(insight, "id", ""));
                    }
                }
                if (!exactImpact) continue;
                double impact = number(impacts, dimensionKey);
                if (Math.abs(impact) < 0.01) continue;
                JsonObject component = new JsonObject();
                String insightId = stringValue(insight, "id", "");
                component.addProperty("id", "component:" + dimensionKey + ":" + insightId);
                component.addProperty("insight_id", insightId);
                component.addProperty("root_cause_id", stringValue(insight, "root_cause_id", insightId));
                component.addProperty("kind", stringValue(insight, "kind", "improvement"));
                component.addProperty("title", stringValue(insight, "title", "行为证据"));
                component.addProperty("impact", round1(impact));
                JsonObject rawImpacts = object(insight, "raw_dimension_impacts");
                component.addProperty("raw_impact", round1(rawImpacts != null && rawImpacts.has(dimensionKey)
                        ? number(rawImpacts, dimensionKey) : impact));
                component.addProperty("weighted_overall_impact",
                        round1(impact * number(dimension, "effective_weight") / 100.0));
                component.addProperty("confidence", intValue(insight, "confidence", 0));
                component.addProperty("time_start", intValue(insight, "time_start", 0));
                component.addProperty("time_end", intValue(insight, "time_end", 0));
                component.addProperty("location", stringValue(insight, "location", ""));
                component.addProperty("gate_status", stringValue(insight, "gate_status", "passed"));
                JsonArray refs = array(insight, "evidence_refs");
                component.add("evidence_refs", refs == null ? new JsonArray() : refs.deepCopy());
                JsonArray consequenceTypes = array(insight, "consequence_types");
                component.add("consequence_types",
                        consequenceTypes == null ? new JsonArray() : consequenceTypes.deepCopy());
                JsonObject impactCap = object(insight, "impact_cap");
                if (impactCap != null) component.add("impact_cap", impactCap.deepCopy());
                JsonObject jump = object(insight, "jump_target");
                if (jump != null) component.add("jump_target", jump.deepCopy());
                components.add(component);
            }
        }
    }

    private static JsonObject insight(String id, String kind, String category, String severity, int confidence,
            int timeStart, int timeEnd, String location, String title, String fact, String judgment,
            String impact, String action, String module, int jumpTime, int slot, String... evidenceRefs) {
        JsonObject row = new JsonObject();
        row.addProperty("id", id);
        row.addProperty("kind", kind);
        row.addProperty("category", category);
        row.addProperty("severity", severity);
        row.addProperty("confidence", confidence);
        row.addProperty("time_start", timeStart);
        row.addProperty("time_end", timeEnd);
        row.addProperty("location", location);
        row.addProperty("title", title);
        row.addProperty("fact", fact);
        row.addProperty("judgment", judgment);
        row.addProperty("impact", impact);
        row.addProperty("action", action);
        row.addProperty("gate_status", "passed");
        JsonArray refs = new JsonArray();
        for (String reference : evidenceRefs) {
            if (reference != null && !reference.isBlank()) refs.add(reference);
        }
        row.add("evidence_refs", refs);
        row.addProperty("root_cause_id", refs.size() > 0 ? refs.get(0).getAsString() : id);
        applyLocalization(row, PlayerReportLocalization.aggregate(module, jumpTime, slot));
        return row;
    }

    private static void applyLocalization(JsonObject insight, JsonObject jumpTarget) {
        insight.add("jump_target", jumpTarget);
        insight.addProperty("ordinary_eligible", PlayerReportLocalization.ordinaryEligible(jumpTarget));
    }

    private static JsonObject jumpTarget(String module, int time, int slot) {
        return PlayerReportLocalization.aggregate(module, time, slot);
    }

    private static void ensureFarmEvidence(JsonObject evidenceIndex, String reference, JsonObject diagnostic,
            int slot) {
        if (evidenceIndex.has(reference)) return;
        JsonObject row = new JsonObject();
        row.addProperty("id", reference);
        row.addProperty("type", "farm");
        row.addProperty("slot", slot);
        for (String key : List.of("time", "end", "phase", "actual", "recommendation", "actualGold",
                "suggestedGold", "risk", "confidence", "route_safety", "route_blocker",
                "route_resource", "recommendation_enabled", "reason")) {
            copy(row, diagnostic, key);
        }
        evidenceIndex.add(reference, row);
    }

    private static void ensureFightEvidence(JsonObject evidenceIndex, FightContext context, int slot) {
        if (evidenceIndex.has(context.reference)) return;
        JsonObject row = new JsonObject();
        row.addProperty("id", context.reference);
        row.addProperty("type", "combat");
        row.addProperty("fight_id", fightId(context.fight));
        row.addProperty("slot", slot);
        row.addProperty("kind", context.kind);
        row.addProperty("start", context.start);
        row.addProperty("end", context.end);
        row.addProperty("region", context.region);
        copy(row, context.fight, "total_damage");
        JsonObject contribution = new JsonObject();
        for (String key : List.of("responsibilityScore", "presencePct", "arrivalDelay", "damage",
                "teamDamageShare", "damageTaken", "abilityCasts", "itemUses", "controlSeconds",
                "healing", "kills", "deaths", "confidence", "status")) {
            copy(contribution, context.contribution, key);
        }
        JsonObject gate = object(context.contribution, "responsibility_gate");
        if (gate != null) {
            JsonObject gateSummary = new JsonObject();
            for (String key : List.of("model", "status", "coverage_pct", "opportunity_seconds",
                    "patch_metadata_match", "judgment_suppressed")) {
                copy(gateSummary, gate, key);
            }
            contribution.add("responsibility_gate", gateSummary);
        }
        row.add("contribution", contribution);
        evidenceIndex.add(context.reference, row);
    }

    private static JsonObject impacts(Object... values) {
        JsonObject row = new JsonObject();
        for (int index = 0; index + 1 < values.length; index += 2) {
            row.addProperty(String.valueOf(values[index]), ((Number) values[index + 1]).doubleValue());
        }
        return row;
    }

    private static JsonArray metricRefs(JsonArray dimensions, String... sources) {
        Set<String> accepted = Set.of(sources);
        JsonArray refs = new JsonArray();
        for (JsonElement element : dimensions) {
            if (!element.isJsonObject()) continue;
            JsonObject row = element.getAsJsonObject();
            if (!accepted.contains(stringValue(row, "source", ""))) continue;
            JsonArray metricRefs = array(row, "metric_refs");
            if (metricRefs == null) continue;
            for (JsonElement reference : metricRefs) {
                if (refs.size() >= 3) return refs;
                refs.add(reference.deepCopy());
            }
        }
        return refs;
    }

    private static JsonObject lastCheckpoint(JsonObject review) {
        JsonArray checkpoints = array(review, "checkpoints");
        if (checkpoints == null || checkpoints.isEmpty()) return null;
        JsonObject best = null;
        for (JsonElement element : checkpoints) {
            if (!element.isJsonObject()) continue;
            JsonObject checkpoint = element.getAsJsonObject();
            if (best == null || intValue(checkpoint, "time", 0) > intValue(best, "time", 0)) {
                best = checkpoint;
            }
        }
        return best;
    }

    private static JsonObject contribution(JsonObject fight, int slot) {
        JsonArray contributions = array(fight, "contributions");
        if (contributions == null) return null;
        for (JsonElement element : contributions) {
            if (element.isJsonObject() && intValue(element.getAsJsonObject(), "slot", -1) == slot) {
                return element.getAsJsonObject();
            }
        }
        return null;
    }

    private static JsonObject phase(JsonArray phases, String name) {
        if (phases == null) return null;
        for (JsonElement element : phases) {
            if (element.isJsonObject() && name.equals(stringValue(element.getAsJsonObject(), "phase", ""))) {
                return element.getAsJsonObject();
            }
        }
        return null;
    }

    private static int phaseDuration(JsonArray phases) {
        int result = 0;
        if (phases == null) return result;
        for (JsonElement element : phases) {
            if (element.isJsonObject()) {
                result = Math.max(result, intValue(element.getAsJsonObject(), "end", 0));
            }
        }
        return result;
    }

    private static int dimensionScore(JsonArray dimensions, String source, int fallback) {
        for (JsonElement element : dimensions) {
            if (!element.isJsonObject()) continue;
            JsonObject row = element.getAsJsonObject();
            if (!source.equals(stringValue(row, "source", ""))) continue;
            if (!booleanValue(row, "available", row.has("score"))) return fallback;
            return intValue(row, "score", fallback);
        }
        return fallback;
    }

    private static int averageFightScore(List<FightContext> fights) {
        if (fights.isEmpty()) return 50;
        return Math.round(fights.stream().mapToInt(FightContext::score).sum() / (float) fights.size());
    }

    private static int averagePresence(List<FightContext> fights) {
        if (fights.isEmpty()) return 0;
        return Math.round(fights.stream()
                .mapToInt(fight -> intValue(fight.contribution, "presencePct", 0))
                .sum() / (float) fights.size());
    }

    private static int supportRouteGains(JsonObject route) {
        return intValue(route, "stacks", 0)
                + intValue(route, "runes", 0)
                + intValue(route, "wards", 0)
                + intValue(route, "away_assists", 0)
                + intValue(route, "away_kills", 0);
    }

    private static String supportRouteOutcome(JsonObject route) {
        List<String> values = new ArrayList<>();
        addCount(values, route, "stacks", "次叠野");
        addCount(values, route, "runes", "个神符");
        addCount(values, route, "wards", "个眼位");
        addCount(values, route, "away_assists", "次助攻");
        addCount(values, route, "away_kills", "次击杀");
        return values.isEmpty() ? "没有可确认收益" : String.join("、", values);
    }

    private static void addCount(List<String> values, JsonObject object, String key, String suffix) {
        int value = intValue(object, key, 0);
        if (value > 0) values.add(value + suffix);
    }

    private static String supportLaneAction(int position) {
        return position == 4
                ? "离线前确认3号位血量、兵线位置和敌方双人动向；没有明确收益时提前回线。"
                : "离线前确认1号位可以安全补刀；没有神符、叠野、视野或击杀收益时优先回线。";
    }

    private static String supportLaneKeepAction(int position) {
        return position == 4
                ? "保留这类有目标的游走，并在离线前给3号位明确的安全窗口。"
                : "继续把拉野、控符或视野动作安排在1号位能够安全单吃经验的窗口。";
    }

    private static String coreLaneIssueTitle(int position) {
        return switch (position) {
            case 1 -> "对线经验与补刀差已影响1号位发育";
            case 2 -> "中路等级或补刀差已影响首轮节奏";
            default -> "劣势路经验与兵线控制需要优先止损";
        };
    }

    private static String coreLaneStrengthTitle(int position) {
        return switch (position) {
            case 1 -> "对线资源转化达到优势门槛";
            case 2 -> "中路对位为首轮节奏提供了基础";
            default -> "劣势路完成了对位压制或资源交换";
        };
    }

    private static String coreLaneAction(int position) {
        return switch (position) {
            case 1 -> "等级或经验开始落后时减少越线换血，先保证经验区和塔下兵。";
            case 2 -> "对位承压时先保证远程兵与关键等级，再决定控符或边路支援。";
            default -> "对线承压时优先控线与保经验，等待4号位回线或明确的击杀窗口。";
        };
    }

    private static String coreLaneKeepAction(int position) {
        return switch (position) {
            case 1 -> "维持补刀与兵线控制，把优势转换为安全的线野循环。";
            case 2 -> "用等级与补刀优势控制下一轮神符，并提前规划边路动作。";
            default -> "继续压缩敌方1号位资源，同时保留撤退和接应空间。";
        };
    }

    private static String farmAction(int position, String recommendation) {
        boolean laneRecommendation = recommendation.contains("兵线");
        return switch (position) {
            case 1 -> laneRecommendation
                    ? "相同视野条件下先收会消失的安全兵线，再衔接最近的安全野区。"
                    : "兵线安全门禁未通过时，按营地存续顺序清理最近的安全野区资源。";
            case 2 -> "在不延误神符、TP或关键装备节奏时，优先衔接" + recommendation + "。";
            default -> "先确认队伍不需要你接战，再把空档转换为" + recommendation + "。";
        };
    }

    private static String combatAction(int position) {
        return switch (position) {
            case 1 -> "等先手与关键控制出现后进入输出位，保持存活输出时间并保留撤退路线。";
            case 2 -> "围绕第一轮爆发选择关键目标，并预留位移或保命资源完成第二轮技能。";
            case 3 -> "接战前确认队友距离，先手后持续限制关键目标，不要脱离后排接应。";
            case 4 -> "优先完成先手或反手控制，第一轮技能后继续保护核心输出空间。";
            default -> "站在核心可接应范围内，优先完成救人、反手与关键目标视野职责。";
        };
    }

    private static String combatKeepAction(int position) {
        return switch (position) {
            case 1 -> "继续在先手和控制生效后进场，保持安全输出时间。";
            case 2 -> "继续把第一轮爆发集中在关键目标，并保留第二轮技能空间。";
            case 3 -> "继续用先手和承伤为后排建立可输出的战场。";
            case 4 -> "继续保持先反手技能与核心输出节奏的衔接。";
            default -> "继续保持救人、反手和目标前视野的完整顺序。";
        };
    }

    private static String trainingTrigger(String category, int position) {
        if (category.contains("lane_support")) {
            return position == 4 ? "准备离开3号位超过20秒前" : "准备离开1号位超过20秒前";
        }
        if (category.contains("lane")) return "补刀、等级或经验差开始扩大时";
        if (category.contains("farm")) return "兵线即将消失且候选路线安全门禁通过时";
        if (category.contains("combat")) return "下一场有效冲突进入接触前10秒时";
        return "相同场景再次出现时";
    }

    private static String trainingSuccess(String category, int position) {
        if (category.contains("lane_support")) {
            return position == 4
                    ? "离线期间3号位不因失去保护阵亡，且游走产生至少一项明确收益"
                    : "离线期间1号位能够安全补刀，且游走产生至少一项明确收益";
        }
        if (category.contains("lane")) return "下一检查点的等级或经验差不再继续扩大";
        if (category.contains("farm")) return "30秒内先收会消失的资源，再衔接下一处安全资源";
        if (category.contains("combat")) return combatSuccess(position);
        return "对应证据可以在时间线中确认";
    }

    private static String combatSuccess(int position) {
        return switch (position) {
            case 1 -> "在首轮控制后进入战场，并保持至少一轮完整输出";
            case 2 -> "第一轮技能命中关键目标，并保留继续追击或撤退的资源";
            case 3 -> "先手时队友在可接应距离内，且关键目标受到持续限制";
            case 4 -> "先反手职责至少完成一项，并在第一轮后仍能保护核心";
            default -> "救人、反手或视野职责至少完成一项，且自己不先于核心无效阵亡";
        };
    }

    private static String roleBaselineTrigger(int position) {
        return switch (position) {
            case 1 -> "安全兵线与野区资源同时可用时";
            case 2 -> "关键神符或边路动作前45秒";
            case 3 -> "准备先手或进入敌方区域前";
            case 4 -> "准备游走、控符或接战前";
            default -> "准备离开核心、布置视野或接战前";
        };
    }

    private static String roleBaselineAction(int position) {
        return switch (position) {
            case 1 -> "先收会消失的安全兵线，再衔接最近的安全野区。";
            case 2 -> "提前处理当前兵线，给关键神符、TP和首轮技能留出时间。";
            case 3 -> "先确认队友距离和后排位置，再承担先手与承伤职责。";
            case 4 -> "每次离线都绑定一个明确目标，并确认3号位能否安全留线。";
            default -> "围绕1号位安全和下一目标安排眼位、拉野与反手位置。";
        };
    }

    private static String roleBaselineSuccess(int position) {
        return switch (position) {
            case 1 -> "连续两个资源窗口没有空转，并且没有放弃可安全收取的兵线";
            case 2 -> "到达关键时间点时兵线已处理，TP、魔法和技能可用";
            case 3 -> "开战时队友能跟上，自己没有独自消耗第一轮关键资源";
            case 4 -> "游走有明确收益，且3号位没有因离线失去经验或阵亡";
            default -> "核心保持安全，目标前形成可用视野或反手站位";
        };
    }

    private static String keepAction(int position, String source) {
        if ("vision".equals(source)) {
            return position >= 4 ? "继续把眼位布置在下一目标和队友可接应的区域。"
                    : "继续利用已有视野选择安全资源和进场路径。";
        }
        if ("lane".equals(source)) return position >= 4 ? supportLaneKeepAction(position) : coreLaneKeepAction(position);
        if ("combat".equals(source) || "utility".equals(source)) return combatKeepAction(position);
        return roleBaselineAction(position);
    }

    private static String storyPhrase(JsonObject story) {
        String verdict = switch (stringValue(story, "verdict", "missing")) {
            case "major_advantage" -> "大优势";
            case "advantage" -> "占优";
            case "stable" -> "稳定";
            case "even" -> "均势";
            case "major_disadvantage" -> "大劣势";
            case "disadvantage", "issue" -> "需要优先复核";
            default -> "证据不足";
        };
        return stringValue(story, "title", "阶段") + verdict;
    }

    private static String scoreVerdict(int score) {
        if (score >= 68) return "stable";
        if (score < 52) return "issue";
        return "even";
    }

    private static String laneVerdict(String verdict) {
        return switch (verdict) {
            case "major_advantage", "advantage", "major_disadvantage", "disadvantage" -> verdict;
            default -> "even";
        };
    }

    private static String categoryForSource(String source) {
        return canonicalDimension(source);
    }

    private static String canonicalDimension(String source) {
        return switch (source) {
            case "lane" -> "lane_execution";
            case "economy" -> "farm_efficiency";
            case "resource" -> "resource_decision";
            case "tempo" -> "map_tempo";
            case "combat" -> "combat_output";
            case "utility" -> "combat_duty";
            case "survival" -> "survival_risk";
            case "vision" -> "vision_team";
            case "objective" -> "objective_conversion";
            case "execution" -> "observable_execution";
            default -> "map_tempo";
        };
    }

    private static boolean sourceMatchesCategory(String source, String category) {
        if (canonicalDimension(source).equals(category)) return true;
        if (category.contains("lane")) {
            return "lane".equals(source)
                    || "lane_support_route".equals(category) && "tempo".equals(source);
        }
        if (category.contains("farm") || category.contains("resource")) {
            return "economy".equals(source) || "resource".equals(source);
        }
        if (category.contains("combat")) {
            return "combat".equals(source) || "utility".equals(source) || "survival".equals(source);
        }
        if (category.contains("vision")) return "vision".equals(source);
        if (category.contains("objective")) return "objective".equals(source);
        if (category.contains("execution")) return "execution".equals(source);
        return "tempo".equals(source);
    }

    private static String moduleForSource(String source) {
        return switch (source) {
            case "lane" -> "development";
            case "economy", "resource" -> "farm";
            case "combat", "utility", "survival" -> "combat";
            case "vision" -> "vision";
            case "objective" -> "map";
            case "execution" -> "combat";
            default -> "timeline";
        };
    }

    private static String dimensionLabel(String key) {
        return switch (key) {
            case "lane_execution" -> "对线执行";
            case "farm_efficiency" -> "发育效率";
            case "resource_decision" -> "资源决策";
            case "map_tempo" -> "地图节奏";
            case "combat_output" -> "战斗输出";
            case "combat_duty" -> "战斗职责";
            case "survival_risk" -> "生存与风险";
            case "objective_conversion" -> "目标转化";
            case "vision_team" -> "视野与团队";
            case "observable_execution" -> "可观测执行";
            default -> "位置职责";
        };
    }

    private static String metricLabel(String key) {
        return switch (key) {
            case "lane_score" -> "对线模型";
            case "lane_confidence" -> "对线置信度";
            case "secured_lane_units" -> "已补线上单位";
            case "reviewable_misses" -> "附近可复核漏刀";
            case "estimated_reviewable_gold" -> "可复核损失";
            case "last_hits" -> "补刀";
            case "denies" -> "反补";
            case "level" -> "等级";
            case "gpm" -> "GPM";
            case "xpm" -> "XPM";
            case "networth" -> "净值";
            case "lane_gold" -> "兵线收入";
            case "neutral_gold" -> "野区收入";
            case "resource_review_windows" -> "有效路线窗口";
            case "resource_missed_windows" -> "错失路线窗口";
            case "resource_estimated_loss" -> "路线机会损失";
            case "lane_jungle_cycles" -> "线野循环";
            case "hero_damage" -> "英雄伤害";
            case "fight_score" -> "战斗职责分";
            case "fight_damage_share" -> "战斗伤害占比";
            case "kill_conversion" -> "击杀转化";
            case "fight_presence" -> "战场存在率";
            case "reviewable_fights" -> "有效战斗样本";
            case "passed_duty_fights" -> "职责门禁通过场次";
            case "deaths" -> "阵亡";
            case "dead_seconds" -> "死亡时间";
            case "buyback_count" -> "买活次数";
            case "tower_damage" -> "建筑伤害";
            case "tower_kills" -> "防御塔击杀";
            case "roshan_kills" -> "肉山击杀";
            case "damage_taken" -> "承受伤害";
            case "healing" -> "治疗量";
            case "observer_wards" -> "假眼";
            case "sentry_wards" -> "真眼";
            case "dewards" -> "排眼";
            case "vision_score" -> "眼位评分";
            case "ward_detections" -> "眼位发现";
            case "teleport_uses" -> "TP 使用";
            case "rune_pickups" -> "神符拾取";
            case "actions_per_min" -> "APM";
            case "ability_casts" -> "技能使用";
            case "item_uses" -> "物品使用";
            case "observable_uses_per_min" -> "技能物品频率";
            case "teamfight_participation" -> "战斗参与率";
            case "control_seconds" -> "控制时长";
            case "stack_team_value_estimate" -> "叠野团队价值";
            default -> key;
        };
    }

    private static String fightKindLabel(String kind) {
        return switch (kind) {
            case "teamfight" -> "团战";
            case "pickoff" -> "抓单";
            default -> "小规模冲突";
        };
    }

    private static String fightId(JsonObject fight) {
        return stringValue(fight, "id", "fight-" + intValue(fight, "start", 0));
    }

    private static String positionName(int position) {
        return switch (position) {
            case 1 -> "1号位";
            case 2 -> "2号位";
            case 3 -> "3号位";
            case 4 -> "4号位";
            default -> "5号位";
        };
    }

    private static String laneLabel(String lane) {
        return switch (lane) {
            case "top", "top_lane" -> "上路";
            case "mid", "mid_lane" -> "中路";
            case "bottom", "bottom_lane" -> "下路";
            default -> "对线区域";
        };
    }

    private static String regionLabel(String region) {
        return switch (region) {
            case "top_lane", "top" -> "上路";
            case "mid_lane", "mid" -> "中路";
            case "bottom_lane", "bottom" -> "下路";
            case "radiant_jungle" -> "天辉野区";
            case "dire_jungle" -> "夜魇野区";
            case "river" -> "河道";
            case "radiant_base" -> "天辉基地";
            case "dire_base" -> "夜魇基地";
            case "roshan", "roshan_pit" -> "肉山区域";
            default -> region == null || region.isBlank() || "unknown".equals(region) ? "未知区域" : region;
        };
    }

    private static String routeRegion(String resource) {
        if (resource == null) return "unknown";
        if (resource.contains("top")) return "top_lane";
        if (resource.contains("mid")) return "mid_lane";
        if (resource.contains("bottom")) return "bottom_lane";
        return "unknown";
    }

    private static String farmOptionLabel(String option) {
        return switch (option) {
            case "collect_lane" -> "安全兵线";
            case "lane_jungle_cycle" -> "线野循环";
            case "farm_jungle", "hold_jungle" -> "野区资源";
            case "combat" -> "参战";
            case "objective" -> "目标推进";
            case "idle", "movement" -> "移动或空转";
            default -> "当前资源";
        };
    }

    private static String kda(JsonObject phase) {
        return intValue(phase, "kills", 0) + "/" + intValue(phase, "deaths", 0) + "/"
                + intValue(phase, "assists", 0);
    }

    private static String signed(int value) {
        return value > 0 ? "+" + value : Integer.toString(value);
    }

    private static String formatSeconds(int seconds) {
        int safe = Math.max(0, seconds);
        return String.format("%02d:%02d", safe / 60, safe % 60);
    }

    private static JsonArray toArray(List<JsonObject> values) {
        JsonArray result = new JsonArray();
        values.forEach(result::add);
        return result;
    }

    private static String[] strings(JsonArray values) {
        if (values == null) return new String[0];
        String[] result = new String[values.size()];
        for (int index = 0; index < values.size(); index++) result[index] = values.get(index).getAsString();
        return result;
    }

    private static int preferredInt(JsonObject row, String primary, String fallback) {
        int value = intValue(row, primary, 0);
        return value > 0 ? value : intValue(row, fallback, 0);
    }

    private static void copy(JsonObject target, JsonObject source, String key) {
        if (source == null) return;
        JsonElement value = source.get(key);
        if (value != null && !value.isJsonNull()) target.add(key, value.deepCopy());
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

    private static String stringValue(JsonObject object, String key, String fallback) {
        if (object == null) return fallback;
        JsonElement value = object.get(key);
        if (value == null || value.isJsonNull()) return fallback;
        try {
            return value.getAsString();
        } catch (RuntimeException ignored) {
            return fallback;
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

    private static double round1(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private static int clamp(int value, int minimum, int maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    private record LaneContext(JsonObject review, JsonObject checkpoint, JsonObject route,
            String reference, int time, int confidence) {
    }

    private record FarmContext(JsonObject diagnostic, int gain) {
    }

    private record FightContext(JsonObject fight, JsonObject contribution, String reference,
            int start, int end, String kind, String region, int score, int confidence, boolean gatePassed) {
    }
}
