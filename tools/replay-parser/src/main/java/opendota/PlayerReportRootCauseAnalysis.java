package opendota;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

final class PlayerReportRootCauseAnalysis {
    static final String MODEL = "player-root-cause/1.0";
    static final String CAP_MODEL = "root-cause-overall-impact-cap/1.0";
    static final double OVERALL_PENALTY_CAP = 6.0;
    static final double DIMENSION_IMPACT_CAP = 25.0;

    private static final Map<String, String> MAJOR_ITEMS = Map.ofEntries(
            Map.entry("phase_boots", "相位鞋"),
            Map.entry("power_treads", "动力鞋"),
            Map.entry("arcane_boots", "秘法鞋"),
            Map.entry("travel_boots", "远行鞋"),
            Map.entry("blink", "闪烁匕首"),
            Map.entry("overwhelming_blink", "盛势闪光"),
            Map.entry("swift_blink", "迅疾闪光"),
            Map.entry("arcane_blink", "秘奥闪光"),
            Map.entry("blade_mail", "刃甲"),
            Map.entry("black_king_bar", "黑皇杖"),
            Map.entry("ultimate_scepter", "阿哈利姆神杖"),
            Map.entry("aghanims_shard", "阿哈利姆魔晶"),
            Map.entry("shivas_guard", "希瓦的守护"),
            Map.entry("lotus_orb", "清莲宝珠"),
            Map.entry("pipe", "洞察烟斗"),
            Map.entry("crimson_guard", "赤红甲"),
            Map.entry("guardian_greaves", "卫士胫甲"),
            Map.entry("force_staff", "原力法杖"),
            Map.entry("hurricane_pike", "飓风长戟"),
            Map.entry("glimmer_cape", "微光披风"),
            Map.entry("solar_crest", "炎阳纹章"),
            Map.entry("boots_of_bearing", "宽容之靴"),
            Map.entry("manta", "幻影斧"),
            Map.entry("desolator", "黯灭"),
            Map.entry("bfury", "狂战斧"),
            Map.entry("radiance", "辉耀"),
            Map.entry("sange_and_yasha", "散夜对剑"),
            Map.entry("kaya_and_sange", "慧夜对剑"),
            Map.entry("yasha_and_kaya", "散慧对剑"),
            Map.entry("bloodstone", "血精石"),
            Map.entry("orchid", "紫怨"),
            Map.entry("bloodthorn", "血棘"),
            Map.entry("sheepstick", "邪恶镰刀"),
            Map.entry("refresher", "刷新球"),
            Map.entry("satanic", "撒旦之邪力"),
            Map.entry("butterfly", "蝴蝶"),
            Map.entry("heart", "恐鳌之心"),
            Map.entry("skadi", "斯嘉蒂之眼"),
            Map.entry("monkey_king_bar", "金箍棒"),
            Map.entry("silver_edge", "白银之锋"),
            Map.entry("shadow_blade", "影刃"),
            Map.entry("sphere", "林肯法球"),
            Map.entry("aeon_disk", "永恒之盘"),
            Map.entry("euls", "风之杖"),
            Map.entry("wind_waker", "风之杖升级"),
            Map.entry("diffusal_blade", "净魂之刃"),
            Map.entry("disperser", "散魂剑"),
            Map.entry("harpoon", "鱼叉"));

    private PlayerReportRootCauseAnalysis() {
    }

    static JsonArray aggregate(JsonObject modules, JsonObject facts, List<JsonObject> insights,
            JsonObject evidenceIndex, int slot, int position, JsonArray dimensions) {
        Map<String, List<JsonObject>> groups = new LinkedHashMap<>();
        for (JsonObject insight : insights) {
            String insightId = stringValue(insight, "id", "insight");
            String rootId = stringValue(insight, "root_cause_id", insightId);
            groups.computeIfAbsent(rootId, ignored -> new ArrayList<>()).add(insight);
        }

        List<JsonObject> timeline = objects(array(object(modules, "timeline"), "events"));
        List<JsonObject> fights = objects(array(object(modules, "combat"), "fights"));
        Map<String, Double> weights = dimensionWeights(dimensions);
        List<JsonObject> roots = new ArrayList<>();
        List<JsonObject> mergedInsights = new ArrayList<>();

        for (Map.Entry<String, List<JsonObject>> entry : groups.entrySet()) {
            String rootId = entry.getKey();
            List<JsonObject> sourceInsights = entry.getValue();
            JsonObject primary = primaryInsight(sourceInsights);
            boolean improvement = "improvement".equals(stringValue(primary, "kind", ""));
            int start = sourceInsights.stream().mapToInt(item -> intValue(item, "time_start", 0)).min().orElse(0);
            int end = sourceInsights.stream().mapToInt(item -> intValue(item, "time_end", start)).max()
                    .orElse(start);
            JsonObject fight = findFight(rootId, sourceInsights, fights);

            JsonObject rawImpacts = new JsonObject();
            for (JsonObject source : sourceInsights) {
                mergeImpacts(rawImpacts, object(source, "dimension_impacts"));
            }

            List<JsonObject> consequences = new ArrayList<>();
            DeathContext death = improvement
                    ? deathConsequence(timeline, evidenceIndex, slot, start, end)
                    : null;
            if (death != null) consequences.add(death.consequence);

            JsonObject itemDelay = improvement && death != null
                    ? itemDelayConsequence(modules, facts, evidenceIndex, slot, death)
                    : null;
            if (itemDelay != null) consequences.add(itemDelay);

            JsonObject objectiveLoss = improvement
                    ? objectiveLossConsequence(timeline, evidenceIndex, slot, start, end, death, fight)
                    : null;
            if (objectiveLoss != null) consequences.add(objectiveLoss);

            JsonObject visionGap = improvement
                    ? visionGapConsequence(fight, position, slot, objectiveLoss)
                    : null;
            if (visionGap != null) consequences.add(visionGap);

            for (JsonObject consequence : consequences) {
                mergeImpacts(rawImpacts, object(consequence, "dimension_impacts"));
            }

            CapResult cap = capDimensionImpacts(rawImpacts, weights);
            JsonArray consequenceRows = toArray(consequences);
            JsonArray consequenceRefs = consequenceRefs(consequences);
            JsonArray consequenceTypes = consequenceTypes(consequences);
            JsonArray sourceIds = new JsonArray();
            for (JsonObject source : sourceInsights) {
                sourceIds.add(stringValue(source, "id", ""));
                appendEvidenceRefs(primary, array(source, "evidence_refs"));
                if (source != primary) mergedInsights.add(source);
            }
            appendEvidenceRefs(primary, consequenceRefs);

            primary.addProperty("root_cause_id", rootId);
            primary.add("raw_dimension_impacts", cap.rawImpacts.deepCopy());
            primary.add("dimension_impacts", cap.cappedImpacts.deepCopy());
            primary.add("impact_cap", cap.summary.deepCopy());
            primary.add("consequence_refs", consequenceRefs.deepCopy());
            primary.add("consequence_types", consequenceTypes.deepCopy());
            primary.addProperty("consequence_summary", consequenceSummary(consequences));

            JsonObject root = new JsonObject();
            root.addProperty("id", rootId);
            root.addProperty("model", MODEL);
            root.addProperty("kind", stringValue(primary, "kind", "improvement"));
            root.addProperty("category", stringValue(primary, "category", "timeline"));
            root.addProperty("title", stringValue(primary, "title", "比赛行为根因"));
            root.addProperty("time_start", start);
            root.addProperty("time_end", end);
            root.addProperty("location", stringValue(primary, "location", ""));
            root.addProperty("confidence", intValue(primary, "confidence", 0));
            root.addProperty("primary_insight_id", stringValue(primary, "id", ""));
            root.add("source_insight_ids", sourceIds);
            root.add("consequences", consequenceRows);
            root.addProperty("consequence_count", consequences.size());
            root.add("consequence_types", consequenceTypes);
            root.add("evidence_refs", array(primary, "evidence_refs").deepCopy());
            root.add("raw_dimension_impacts", cap.rawImpacts);
            root.add("dimension_impacts", cap.cappedImpacts);
            root.add("impact_cap", cap.summary);
            JsonObject jump = object(primary, "jump_target");
            if (jump != null) root.add("jump_target", jump.deepCopy());
            roots.add(root);
        }

        insights.removeAll(mergedInsights);
        roots.sort(Comparator.comparingInt(item -> intValue(item, "time_start", 0)));
        return toArray(roots);
    }

    static JsonObject summary(JsonArray roots) {
        JsonObject row = new JsonObject();
        int improvementRoots = 0;
        int consequenceCount = 0;
        int cappedRoots = 0;
        double rawPenalty = 0;
        double cappedPenalty = 0;
        for (JsonElement element : roots) {
            if (!element.isJsonObject()) continue;
            JsonObject root = element.getAsJsonObject();
            if (!"improvement".equals(stringValue(root, "kind", ""))) continue;
            improvementRoots++;
            consequenceCount += intValue(root, "consequence_count", 0);
            JsonObject cap = object(root, "impact_cap");
            rawPenalty += number(cap, "raw_negative_overall");
            cappedPenalty += number(cap, "capped_negative_overall");
            if (booleanValue(cap, "applied", false)) cappedRoots++;
        }
        row.addProperty("model", MODEL);
        row.addProperty("cap_model", CAP_MODEL);
        row.addProperty("improvement_root_count", improvementRoots);
        row.addProperty("consequence_count", consequenceCount);
        row.addProperty("cap_applied_count", cappedRoots);
        row.addProperty("raw_negative_overall", round2(rawPenalty));
        row.addProperty("capped_negative_overall", round2(cappedPenalty));
        row.addProperty("per_root_overall_cap", OVERALL_PENALTY_CAP);
        row.addProperty("attribution_only", true);
        return row;
    }

    static CapResult capDimensionImpacts(JsonObject source, Map<String, Double> weights) {
        JsonObject raw = new JsonObject();
        for (Map.Entry<String, JsonElement> entry : source.entrySet()) {
            double value = clamp(number(entry.getValue()), -DIMENSION_IMPACT_CAP, DIMENSION_IMPACT_CAP);
            if (Math.abs(value) >= 0.01) raw.addProperty(entry.getKey(), round2(value));
        }

        double rawPenalty = negativeOverall(raw, weights);
        double scale = rawPenalty > OVERALL_PENALTY_CAP
                ? OVERALL_PENALTY_CAP / rawPenalty
                : 1.0;
        JsonObject capped = new JsonObject();
        for (Map.Entry<String, JsonElement> entry : raw.entrySet()) {
            double value = number(entry.getValue());
            capped.addProperty(entry.getKey(), round2(value < 0 ? value * scale : value));
        }
        double cappedPenalty = rawPenalty > OVERALL_PENALTY_CAP
                ? OVERALL_PENALTY_CAP
                : negativeOverall(capped, weights);

        JsonObject summary = new JsonObject();
        summary.addProperty("model", CAP_MODEL);
        summary.addProperty("dimension_impact_cap", DIMENSION_IMPACT_CAP);
        summary.addProperty("overall_penalty_cap", OVERALL_PENALTY_CAP);
        summary.addProperty("raw_negative_overall", round2(rawPenalty));
        summary.addProperty("capped_negative_overall", round2(cappedPenalty));
        summary.addProperty("scale", round3(scale));
        summary.addProperty("applied", scale < 0.999);
        summary.addProperty("weight_basis", "available_dimension_effective_weight");
        return new CapResult(raw, capped, summary);
    }

    private static DeathContext deathConsequence(List<JsonObject> timeline, JsonObject evidenceIndex,
            int slot, int start, int end) {
        List<JsonObject> deaths = timeline.stream()
                .filter(event -> "hero_death".equals(stringValue(event, "kind", "")))
                .filter(event -> intValue(event, "target_slot", -1) == slot)
                .filter(event -> inWindow(intValue(event, "time", Integer.MIN_VALUE), start - 10, end + 3))
                .sorted(Comparator.comparingInt(event -> intValue(event, "time", 0)))
                .toList();
        if (deaths.isEmpty()) return null;

        JsonArray refs = new JsonArray();
        int goldLost = 0;
        for (JsonObject death : deaths) {
            addRef(refs, ensureTimelineEvidence(evidenceIndex, death, "death"));
            int deathTime = intValue(death, "time", 0);
            for (JsonObject event : timeline) {
                if (!"gold".equals(stringValue(event, "kind", ""))) continue;
                if (intValue(event, "actor_slot", -1) != slot) continue;
                if (!"death_loss".equals(stringValue(event, "source", ""))) continue;
                if (Math.abs(intValue(event, "time", 0) - deathTime) > 2) continue;
                goldLost += Math.abs(intValue(event, "value", 0));
                addRef(refs, ensureTimelineEvidence(evidenceIndex, event, "death_gold_loss"));
            }
        }

        int first = intValue(deaths.get(0), "time", start);
        int last = intValue(deaths.get(deaths.size() - 1), "time", first);
        JsonObject consequence = consequence(
                "consequence:death:" + slot + ":" + first,
                "death",
                "阵亡",
                "fact",
                first,
                deaths.size() == 1
                        ? formatTime(first) + " 在根因窗口内阵亡。"
                        : formatTime(first) + " 至 " + formatTime(last) + " 在同一根因窗口内阵亡 "
                                + deaths.size() + " 次。",
                refs,
                impacts("survival_risk", deaths.size() == 1 ? -4.0 : -6.0));
        consequence.addProperty("count", deaths.size());
        consequence.addProperty("gold_lost", goldLost);
        consequence.addProperty("last_time", last);
        return new DeathContext(consequence, deaths, goldLost, first, last);
    }

    private static JsonObject itemDelayConsequence(JsonObject modules, JsonObject facts, JsonObject evidenceIndex,
            int slot, DeathContext death) {
        int gpm = Math.max(0, intValue(facts, "gpm", 0));
        if (death.goldLost < 100 || gpm < 100) return null;
        JsonObject purchase = nextMajorPurchase(modules, slot, death.lastTime);
        if (purchase == null) return null;

        int delaySeconds = Math.max(1, (int) Math.round(death.goldLost * 60.0 / gpm));
        if (delaySeconds < 8) return null;
        String key = stringValue(purchase, "key", "");
        String label = MAJOR_ITEMS.get(key);
        if (label == null) return null;
        int purchaseTime = intValue(purchase, "time", death.lastTime);
        String purchaseRef = ensureTimelineEvidence(evidenceIndex, purchase, "key_item_purchase");
        JsonArray refs = new JsonArray();
        addRef(refs, purchaseRef);
        JsonArray deathRefs = array(death.consequence, "evidence_refs");
        if (deathRefs != null) {
            for (JsonElement ref : deathRefs) addRef(refs, ref.getAsString());
        }

        double tempoImpact = -round1(Math.min(2.0, Math.max(0.5, delaySeconds / 30.0)));
        JsonObject consequence = consequence(
                "consequence:item-delay:" + slot + ":" + death.firstTime,
                "item_delay",
                "关键装备延误",
                "estimated",
                death.firstTime,
                "阵亡损失 " + death.goldLost + " 金，按本场 GPM 折算约 " + delaySeconds
                        + " 秒资源进度；下一件可见关键成装「" + label + "」在 "
                        + formatTime(purchaseTime) + " 完成。",
                refs,
                impacts("map_tempo", tempoImpact));
        consequence.addProperty("gold_lost", death.goldLost);
        consequence.addProperty("estimated_delay_seconds", delaySeconds);
        consequence.addProperty("item_key", key);
        consequence.addProperty("item_name", label);
        consequence.addProperty("purchase_time", purchaseTime);
        consequence.addProperty("estimate_basis", "death_gold_loss_divided_by_match_gpm");
        return consequence;
    }

    private static JsonObject objectiveLossConsequence(List<JsonObject> timeline, JsonObject evidenceIndex,
            int slot, int start, int end, DeathContext death, JsonObject fight) {
        if (death == null && fight == null) return null;
        int enemyTeam = slot < 5 ? 3 : 2;
        int latest = end + 90;
        JsonObject best = null;
        int bestPriority = -1;
        for (JsonObject event : timeline) {
            if (!"objective".equals(stringValue(event, "kind", ""))) continue;
            int time = intValue(event, "time", Integer.MIN_VALUE);
            if (!inWindow(time, Math.max(0, start - 2), latest)) continue;
            if (intValue(event, "attackerTeam", -1) != enemyTeam) continue;
            int priority = objectivePriority(event);
            if (priority <= 0) continue;
            if (best == null || priority > bestPriority
                    || priority == bestPriority && time < intValue(best, "time", Integer.MAX_VALUE)) {
                best = event;
                bestPriority = priority;
            }
        }
        if (best == null) return null;

        int time = intValue(best, "time", end);
        String label = objectiveLabel(best);
        String ref = ensureTimelineEvidence(evidenceIndex, best, "objective_loss");
        JsonArray refs = new JsonArray();
        addRef(refs, ref);
        JsonObject consequence = consequence(
                "consequence:objective:" + slot + ":" + time,
                "objective_loss",
                "目标损失",
                "derived",
                time,
                "根因窗口开始后 " + Math.max(0, time - start) + " 秒，敌方取得「" + label + "」。",
                refs,
                impacts("objective_conversion", bestPriority >= 4 ? -3.0 : -2.0));
        consequence.addProperty("objective_kind", stringValue(best, "objective_kind", "objective"));
        consequence.addProperty("objective_label", label);
        consequence.addProperty("delay_from_root_seconds", Math.max(0, time - start));
        consequence.addProperty("association_window_seconds", 90);
        return consequence;
    }

    private static JsonObject visionGapConsequence(JsonObject fight, int position, int slot,
            JsonObject objectiveLoss) {
        if (fight == null) return null;
        JsonObject vision = object(fight, "vision");
        JsonObject teamVision = object(vision, slot < 5 ? "radiant" : "dire");
        if (teamVision == null) return null;

        int teamDeaths = intValue(fight, slot < 5 ? "radiant_deaths" : "dire_deaths", 0);
        int enemyDeaths = intValue(fight, slot < 5 ? "dire_deaths" : "radiant_deaths", 0);
        boolean lostExchange = teamDeaths > enemyDeaths;
        boolean observerGap = !booleanValue(teamVision, "observer_coverage", false)
                && intValue(teamVision, "setup_observers", 0) == 0
                && intValue(teamVision, "nearby_observers", 0) == 0;
        JsonObject importance = object(fight, "importance");
        boolean important = booleanValue(importance, "important", false)
                || "teamfight".equals(stringValue(fight, "kind", ""));
        if (!observerGap || !important || !lostExchange && objectiveLoss == null) return null;

        int time = intValue(fight, "review_start",
                intValue(fight, "contact_start", intValue(fight, "start", 0)));
        JsonArray refs = new JsonArray();
        String fightId = stringValue(fight, "id", "fight-" + time);
        addRef(refs, "combat:" + fightId + ":" + slot);
        JsonObject impacts = position >= 4 ? impacts("vision_team", -2.0) : new JsonObject();
        JsonObject consequence = consequence(
                "consequence:vision-gap:" + slot + ":" + fightId,
                "vision_gap",
                "战前视野缺口",
                "gated",
                time,
                "战前与战场附近均没有可确认假眼覆盖；交战中本方阵亡 " + teamDeaths
                        + " 人、敌方阵亡 " + enemyDeaths + " 人。",
                refs,
                impacts);
        consequence.addProperty("observer_coverage", false);
        consequence.addProperty("setup_observers", 0);
        consequence.addProperty("nearby_observers", 0);
        consequence.addProperty("combat_visibility_pct",
                intValue(teamVision, "combat_log_visibility_pct", 0));
        consequence.addProperty("personal_penalty_applied", position >= 4);
        consequence.addProperty("attribution", position >= 4 ? "support_shared_responsibility" : "team_context_only");
        return consequence;
    }

    private static JsonObject consequence(String id, String type, String label, String status, int time,
            String fact, JsonArray refs, JsonObject impacts) {
        JsonObject row = new JsonObject();
        row.addProperty("id", id);
        row.addProperty("type", type);
        row.addProperty("label", label);
        row.addProperty("evidence_status", status);
        row.addProperty("time", time);
        row.addProperty("fact", fact);
        row.add("evidence_refs", refs);
        row.add("dimension_impacts", impacts);
        return row;
    }

    private static JsonObject nextMajorPurchase(JsonObject modules, int slot, int after) {
        JsonObject build = object(modules, "build");
        JsonObject bySlot = object(build, "by_slot");
        JsonObject player = object(bySlot, Integer.toString(slot));
        JsonArray purchases = array(player, "purchases");
        if (purchases == null) return null;
        JsonObject best = null;
        for (JsonElement element : purchases) {
            if (!element.isJsonObject()) continue;
            JsonObject purchase = element.getAsJsonObject();
            int time = intValue(purchase, "time", Integer.MIN_VALUE);
            String key = stringValue(purchase, "key", "");
            if (time <= after || !MAJOR_ITEMS.containsKey(key)) continue;
            if (best == null || time < intValue(best, "time", Integer.MAX_VALUE)) best = purchase;
        }
        return best;
    }

    private static JsonObject findFight(String rootId, List<JsonObject> insights, List<JsonObject> fights) {
        String fightId = combatFightId(rootId);
        if (fightId == null) {
            for (JsonObject insight : insights) {
                JsonArray refs = array(insight, "evidence_refs");
                if (refs == null) continue;
                for (JsonElement ref : refs) {
                    fightId = combatFightId(ref.getAsString());
                    if (fightId != null) break;
                }
                if (fightId != null) break;
            }
        }
        if (fightId == null) return null;
        for (JsonObject fight : fights) {
            if (fightId.equals(stringValue(fight, "id", ""))) return fight;
        }
        return null;
    }

    private static String combatFightId(String reference) {
        if (reference == null || !reference.startsWith("combat:")) return null;
        int slotSeparator = reference.lastIndexOf(':');
        if (slotSeparator <= "combat:".length()) return null;
        return reference.substring("combat:".length(), slotSeparator);
    }

    private static int objectivePriority(JsonObject event) {
        String kind = stringValue(event, "objective_kind", "");
        String target = stringValue(event, "target", "");
        if ("roshan".equals(kind)) return 5;
        if ("aegis".equals(kind)) return 4;
        if (!"building".equals(kind)) return 0;
        if (target.contains("fort")) return 6;
        if (target.contains("rax") || target.contains("tower4") || target.contains("tower3")) return 4;
        if (target.contains("tower2")) return 2;
        if (target.contains("tower1")) return 1;
        return 1;
    }

    private static String objectiveLabel(JsonObject event) {
        String kind = stringValue(event, "objective_kind", "");
        String target = stringValue(event, "target", "");
        if ("roshan".equals(kind)) return "肉山";
        if ("aegis".equals(kind)) return "不朽之守护";
        if (target.contains("fort")) return "遗迹";
        if (target.contains("melee_rax")) return lanePrefix(target) + "近战兵营";
        if (target.contains("range_rax")) return lanePrefix(target) + "远程兵营";
        if (target.contains("tower4")) return "基地四塔";
        if (target.contains("tower3")) return lanePrefix(target) + "高地塔";
        if (target.contains("tower2")) return lanePrefix(target) + "二塔";
        if (target.contains("tower1")) return lanePrefix(target) + "一塔";
        return "地图目标";
    }

    private static String lanePrefix(String target) {
        if (target.contains("_top")) return "上路";
        if (target.contains("_mid")) return "中路";
        if (target.contains("_bot")) return "下路";
        return "";
    }

    private static JsonObject primaryInsight(List<JsonObject> insights) {
        return insights.stream()
                .sorted(Comparator
                        .comparing((JsonObject item) -> !"improvement".equals(stringValue(item, "kind", "")))
                        .thenComparingInt(item -> intValue(item, "time_start", 0)))
                .findFirst()
                .orElseThrow();
    }

    private static Map<String, Double> dimensionWeights(JsonArray dimensions) {
        Map<String, Double> result = new LinkedHashMap<>();
        for (JsonElement element : dimensions) {
            if (!element.isJsonObject()) continue;
            JsonObject dimension = element.getAsJsonObject();
            if (!booleanValue(dimension, "available", dimension.has("score"))) continue;
            String key = stringValue(dimension, "key", "");
            double effectiveWeight = number(dimension, "effective_weight");
            if (!key.isBlank() && effectiveWeight > 0) result.put(key, effectiveWeight / 100.0);
        }
        return result;
    }

    private static double negativeOverall(JsonObject impacts, Map<String, Double> weights) {
        double result = 0;
        for (Map.Entry<String, JsonElement> entry : impacts.entrySet()) {
            double impact = number(entry.getValue());
            if (impact >= 0) continue;
            result += -impact * weights.getOrDefault(entry.getKey(), 0.0);
        }
        return result;
    }

    private static void mergeImpacts(JsonObject target, JsonObject source) {
        if (source == null) return;
        for (Map.Entry<String, JsonElement> entry : source.entrySet()) {
            double current = target.has(entry.getKey()) ? number(target.get(entry.getKey())) : 0;
            target.addProperty(entry.getKey(), current + number(entry.getValue()));
        }
    }

    private static JsonObject impacts(Object... values) {
        JsonObject result = new JsonObject();
        for (int index = 0; index + 1 < values.length; index += 2) {
            result.addProperty(String.valueOf(values[index]), ((Number) values[index + 1]).doubleValue());
        }
        return result;
    }

    private static JsonArray consequenceRefs(List<JsonObject> consequences) {
        JsonArray result = new JsonArray();
        for (JsonObject consequence : consequences) {
            JsonArray refs = array(consequence, "evidence_refs");
            if (refs == null) continue;
            for (JsonElement ref : refs) addRef(result, ref.getAsString());
        }
        return result;
    }

    private static JsonArray consequenceTypes(List<JsonObject> consequences) {
        JsonArray result = new JsonArray();
        for (JsonObject consequence : consequences) {
            String type = stringValue(consequence, "type", "");
            if (!type.isBlank()) addRef(result, type);
        }
        return result;
    }

    private static String consequenceSummary(List<JsonObject> consequences) {
        if (consequences.isEmpty()) return "";
        return consequences.stream().map(item -> stringValue(item, "label", "后果")).distinct()
                .reduce((left, right) -> left + "、" + right).orElse("");
    }

    private static void appendEvidenceRefs(JsonObject target, JsonArray refs) {
        if (refs == null) return;
        JsonArray targetRefs = array(target, "evidence_refs");
        if (targetRefs == null) {
            targetRefs = new JsonArray();
            target.add("evidence_refs", targetRefs);
        }
        for (JsonElement ref : refs) addRef(targetRefs, ref.getAsString());
    }

    private static void addRef(JsonArray refs, String value) {
        if (value == null || value.isBlank()) return;
        for (JsonElement existing : refs) {
            if (value.equals(existing.getAsString())) return;
        }
        refs.add(value);
    }

    private static String ensureTimelineEvidence(JsonObject evidenceIndex, JsonObject event, String type) {
        String id = stringValue(event, "id",
                "timeline:" + type + ":" + intValue(event, "time", 0) + ":" + intValue(event, "event_seq", 0));
        if (!evidenceIndex.has(id)) {
            JsonObject row = new JsonObject();
            row.addProperty("id", id);
            row.addProperty("type", type);
            for (String key : List.of("time", "game_time_ms", "event_seq", "kind", "category", "actor_slot",
                    "target_slot", "key", "value", "source", "target", "attackerTeam", "objective_kind",
                    "region", "location")) {
                copy(row, event, key);
            }
            evidenceIndex.add(id, row);
        }
        return id;
    }

    private static List<JsonObject> objects(JsonArray values) {
        if (values == null) return List.of();
        List<JsonObject> result = new ArrayList<>();
        for (JsonElement element : values) {
            if (element.isJsonObject()) result.add(element.getAsJsonObject());
        }
        return result;
    }

    private static JsonArray toArray(List<JsonObject> values) {
        JsonArray result = new JsonArray();
        values.forEach(result::add);
        return result;
    }

    private static boolean inWindow(int value, int start, int end) {
        return value >= start && value <= end;
    }

    private static String formatTime(int seconds) {
        int safe = Math.max(0, seconds);
        return String.format("%02d:%02d", safe / 60, safe % 60);
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
        return number(object.get(key));
    }

    private static double number(JsonElement value) {
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

    private static double clamp(double value, double minimum, double maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    private static double round1(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private static double round3(double value) {
        return Math.round(value * 1000.0) / 1000.0;
    }

    private record DeathContext(JsonObject consequence, List<JsonObject> deaths, int goldLost,
            int firstTime, int lastTime) {
    }

    static record CapResult(JsonObject rawImpacts, JsonObject cappedImpacts, JsonObject summary) {
    }
}
