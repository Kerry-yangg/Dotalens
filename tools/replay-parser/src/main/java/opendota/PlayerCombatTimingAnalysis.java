package opendota;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

final class PlayerCombatTimingAnalysis {
    static final String MODEL = "player-combat-timing/1.0";

    private static final Set<String> ELIGIBLE_FIGHT_KINDS = Set.of(
            "pickoff", "skirmish", "small_skirmish", "teamfight");
    private static final Set<String> MEANINGFUL_ACTION_KINDS = Set.of(
            "damage", "heal", "control", "ability_use", "hero_death");
    private static final Map<String, String> ACTIVATION_ITEMS = Map.ofEntries(
            Map.entry("blink", "闪烁匕首"),
            Map.entry("overwhelming_blink", "盛势闪光"),
            Map.entry("swift_blink", "迅疾闪光"),
            Map.entry("arcane_blink", "秘奥闪光"),
            Map.entry("black_king_bar", "黑皇杖"),
            Map.entry("force_staff", "原力法杖"),
            Map.entry("glimmer_cape", "微光披风"),
            Map.entry("lotus_orb", "清莲宝珠"));

    private PlayerCombatTimingAnalysis() {
    }

    static JsonObject analyze(JsonObject modules, int slot, int position,
            int roleConfidence, int duration) {
        JsonObject result = new JsonObject();
        result.addProperty("model", MODEL);
        JsonArray facts = new JsonArray();
        result.add("fight_facts", facts);

        SnapshotTable snapshots = SnapshotTable.from(object(modules, "snapshots"));
        JsonArray fights = array(object(modules, "combat"), "fights");
        int eligibleFights = 0;
        int spatialFacts = 0;
        if (fights != null) {
            for (JsonElement element : fights) {
                if (!element.isJsonObject()) continue;
                JsonObject fight = element.getAsJsonObject();
                String kind = stringValue(fight, "kind", "");
                if (!ELIGIBLE_FIGHT_KINDS.contains(kind)) continue;
                if (intValue(object(fight, "classification"), "confidence", 0) < 75) continue;
                eligibleFights++;

                Point center = fightCenter(fight);
                int reviewStart = intValue(fight, "review_start",
                        Math.max(0, intValue(fight, "start", 0)));
                int engageTime = intValue(fight, "contact_start", intValue(fight, "start", 0));
                int end = intValue(fight, "contact_end", intValue(fight, "end", engageTime));
                double radius = clamp(number(fight, "scatter_radius_pct", 4.0) + 2.0, 6.0, 12.0);
                Integer arrival = center == null
                        ? null
                        : spatialArrival(snapshots.rows(slot), engageTime, end, center, radius);
                Integer firstAction = firstCombatAction(fight, slot);
                Integer firstMeaningfulAction = arrival == null
                        ? null : firstCombatActionAtOrAfter(fight, slot, arrival);
                Integer firstLocalAction = center == null
                        ? null
                        : firstLocalAction(fight, slot, snapshots, center, radius, reviewStart);
                int alliesAtFirstAction = firstLocalAction == null
                        ? 0
                        : alliesInRange(snapshots, slot, firstLocalAction, center, radius);
                boolean prematureInitiation = firstLocalAction != null
                        && firstLocalAction <= engageTime - 3
                        && alliesAtFirstAction == 0;
                int firstRotationEnd = firstRotationEnd(fight, engageTime);
                int firstRotationActions = alliedFirstRotationActionCount(
                        fight, slot, engageTime, arrival == null ? firstRotationEnd : arrival);
                String firstRotationEvidence = firstRotationActions >= 2
                        ? "phase_plus_actions" : "phase_only";
                boolean missedFirstRotation = arrival != null && arrival > firstRotationEnd;
                int coveragePct = snapshots.coveragePct(slot, reviewStart, end);
                SnapshotRow engageSnapshot = snapshots.atOrBefore(slot, engageTime);
                SnapshotRow reviewSnapshot = snapshots.atOrBefore(slot, reviewStart);
                JsonArray suppressedReasons = new JsonArray();
                String joinFeasibility;
                Integer expectedArrivalSeconds = null;
                if (roleConfidence < 65) {
                    joinFeasibility = "insufficient_evidence";
                    suppressedReasons.add("role_confidence_low");
                } else if (center == null) {
                    joinFeasibility = "insufficient_evidence";
                    suppressedReasons.add("invalid_coordinates");
                } else if (coveragePct < 80 || reviewSnapshot == null) {
                    joinFeasibility = "insufficient_evidence";
                    suppressedReasons.add("snapshot_coverage_low");
                } else if (engageSnapshot != null && !engageSnapshot.alive()) {
                    joinFeasibility = "dead";
                    suppressedReasons.add("player_dead");
                } else {
                    expectedArrivalSeconds = expectedArrivalSeconds(reviewSnapshot, center);
                    int availableSeconds = Math.max(0, firstRotationEnd - reviewStart);
                    if (expectedArrivalSeconds == null || expectedArrivalSeconds > availableSeconds) {
                        joinFeasibility = "unreachable";
                        suppressedReasons.add("arrival_unreachable");
                    } else {
                        joinFeasibility = "reachable";
                    }
                }
                int lateThreshold = lateThreshold(position);
                int confidence = clampInt((int) Math.round((
                        intValue(object(fight, "classification"), "confidence", 0)
                        + Math.min(100, roleConfidence)
                        + coveragePct) / 3.0), 0, 100);
                boolean negativeEligible = "reachable".equals(joinFeasibility)
                        && arrival != null
                        && arrival - engageTime >= lateThreshold
                        && missedFirstRotation;
                FightOutcome outcome = fightOutcome(fight, slot,
                        firstMeaningfulAction == null
                                ? arrival == null ? end : arrival
                                : firstMeaningfulAction);
                boolean initiationNegativeEligible = "reachable".equals(joinFeasibility)
                        && position >= 2
                        && position <= 4
                        && prematureInitiation
                        && confidence >= 78;

                JsonObject fact = new JsonObject();
                fact.addProperty("id", "combat-timing:" + stringValue(fight, "id", "fight") + ":" + slot);
                fact.addProperty("fight_id", stringValue(fight, "id", ""));
                fact.addProperty("player_slot", slot);
                fact.addProperty("position", position);
                fact.addProperty("role_confidence", roleConfidence);
                fact.addProperty("kind", kind);
                fact.addProperty("time", engageTime);
                fact.addProperty("review_start", reviewStart);
                fact.addProperty("team_engage_time", engageTime);
                if (arrival != null) {
                    fact.addProperty("player_spatial_arrival_time", arrival);
                    fact.addProperty("arrival_delta_seconds", Math.max(0, arrival - engageTime));
                    fact.addProperty("actual_arrival_seconds", Math.max(0, arrival - reviewStart));
                    spatialFacts++;
                }
                if (firstAction != null) fact.addProperty("first_combat_action_time", firstAction);
                if (firstMeaningfulAction != null) {
                    fact.addProperty("first_meaningful_action_time", firstMeaningfulAction);
                }
                if (firstLocalAction != null) {
                    fact.addProperty("first_local_action_time", firstLocalAction);
                    fact.addProperty("initiation_lead_seconds",
                            Math.max(0, engageTime - firstLocalAction));
                }
                fact.addProperty("allies_in_range_at_first_action", alliesAtFirstAction);
                fact.addProperty("premature_initiation", prematureInitiation);
                fact.addProperty("initiation_negative_eligible", initiationNegativeEligible);
                fact.addProperty("first_rotation_end", firstRotationEnd);
                fact.addProperty("first_rotation_action_count", firstRotationActions);
                fact.addProperty("first_rotation_evidence", firstRotationEvidence);
                fact.addProperty("missed_first_rotation", missedFirstRotation);
                fact.addProperty("join_feasibility", joinFeasibility);
                if (expectedArrivalSeconds != null) {
                    fact.addProperty("expected_arrival_seconds", expectedArrivalSeconds);
                }
                fact.addProperty("role_expectation", roleExpectation(position));
                fact.addProperty("late_threshold_seconds", lateThreshold);
                fact.addProperty("snapshot_coverage_pct", coveragePct);
                fact.addProperty("confidence", confidence);
                fact.addProperty("negative_eligible", negativeEligible);
                fact.add("suppressed_reasons", suppressedReasons);
                fact.addProperty("team_deaths", outcome.teamDeaths);
                fact.addProperty("enemy_deaths", outcome.enemyDeaths);
                fact.addProperty("ally_deaths_before_first_action",
                        outcome.allyDeathsBeforeFirstAction);
                fact.addProperty("adverse_consequence", outcome.adverse());
                fact.addProperty("positive_consequence", outcome.positive());
                String importanceTier = stringValue(object(fight, "importance"), "tier", "routine");
                fact.addProperty("importance_tier", importanceTier);
                fact.addProperty("critical_context", criticalContext(fight, importanceTier));
                fact.addProperty("battle_radius_pct", round2(radius));
                if (center != null) {
                    fact.addProperty("x", round2(center.x));
                    fact.addProperty("y", round2(center.y));
                    fact.addProperty("coordinate_valid", true);
                }
                fact.addProperty("region", stringValue(fight, "region", "unknown"));
                fact.add("jump_target", PlayerReportLocalization.forFight(fight, slot));
                facts.add(fact);
            }
        }

        JsonObject coverage = new JsonObject();
        coverage.addProperty("eligible_fights", eligibleFights);
        coverage.addProperty("spatial_fact_count", spatialFacts);
        coverage.addProperty("spatial_fact_pct", eligibleFights == 0
                ? 0 : Math.round(spatialFacts * 100.0 / eligibleFights));
        coverage.addProperty("snapshot_rows", snapshots.rowCount(slot));
        result.add("coverage", coverage);
        result.add("patterns", buildPatterns(modules, facts, slot, position));
        return result;
    }

    private static JsonArray buildPatterns(JsonObject modules, JsonArray facts, int slot, int position) {
        List<JsonObject> comparable = new ArrayList<>();
        for (JsonElement element : facts) {
            if (!element.isJsonObject()) continue;
            JsonObject fact = element.getAsJsonObject();
            if (!"reachable".equals(stringValue(fact, "join_feasibility", ""))) continue;
            comparable.add(fact);
        }
        comparable.sort(Comparator.comparingInt(fact -> intValue(fact, "time", 0)));

        JsonArray patterns = new JsonArray();
        List<JsonObject> repeatedLate = consecutiveLateRun(comparable);
        if (repeatedLate.size() >= 2) {
            JsonObject main = latePattern(modules, repeatedLate, slot, position,
                    "late_arrival_sequence", true);
            patterns.add(main);
            if (missedRotationCount(repeatedLate) >= 2) {
                patterns.add(linkedDiagnostic(main, "missed_first_rotation_sequence",
                        "连续两次错过第一轮交战",
                        "两次到场都晚于第一轮交战窗口，具体技能与控制事件保留在逐场证据中。"));
            }
            if (object(main, "item_context") != null) {
                patterns.add(linkedDiagnostic(main, "key_item_activation_gap",
                        "关键装备后的参战转化不足",
                        "关键装备完成后的五分钟内，连续冲突仍出现到场或衔接偏晚。"));
            }
        }

        for (JsonObject fact : comparable) {
            if (!booleanValue(fact, "negative_eligible", false)) continue;
            if (containsFact(repeatedLate, stringValue(fact, "id", ""))) continue;
            boolean critical = booleanValue(fact, "critical_context", false)
                    && booleanValue(fact, "adverse_consequence", false)
                    && intValue(fact, "confidence", 0) >= 85;
            patterns.add(latePattern(
                    modules,
                    List.of(fact),
                    slot,
                    position,
                    critical ? "critical_late_arrival" : "late_arrival_observation",
                    critical));
        }

        List<JsonObject> repeatedPremature = consecutivePrematureRun(comparable);
        if (repeatedPremature.size() >= 2) {
            patterns.add(prematurePattern(repeatedPremature, slot, position,
                    "premature_initiation_sequence", true));
        }
        for (JsonObject fact : comparable) {
            if (!booleanValue(fact, "initiation_negative_eligible", false)) continue;
            if (containsFact(repeatedPremature, stringValue(fact, "id", ""))) continue;
            boolean critical = booleanValue(fact, "critical_context", false)
                    && intValue(fact, "confidence", 0) >= 85;
            patterns.add(prematurePattern(
                    List.of(fact),
                    slot,
                    position,
                    critical ? "critical_premature_initiation"
                            : "premature_initiation_observation",
                    critical));
        }

        List<JsonObject> onTime = consecutiveOnTimeRun(comparable);
        if (onTime.size() >= 2) {
            patterns.add(onTimePattern(onTime, slot, position));
        }
        return patterns;
    }

    private static JsonObject linkedDiagnostic(JsonObject source, String patternType,
            String title, String summary) {
        JsonObject row = new JsonObject();
        row.addProperty("id", stringValue(source, "id", "pattern") + ":" + patternType);
        row.addProperty("kind", "observation");
        row.addProperty("category", "combat_timing");
        row.addProperty("pattern_type", patternType);
        row.addProperty("title", title);
        row.addProperty("what_happened", summary);
        row.addProperty("why_it_matters", stringValue(source, "why_it_matters", ""));
        row.addProperty("result", stringValue(source, "result", ""));
        row.addProperty("next_action", stringValue(source, "next_action", ""));
        row.addProperty("confidence", intValue(source, "confidence", 0));
        row.addProperty("ordinary_eligible", false);
        row.addProperty("linked_pattern_id", stringValue(source, "id", ""));
        for (String key : List.of("occurrences", "evidence_refs", "jump_target", "item_context")) {
            copy(row, source, key);
        }
        return row;
    }

    private static List<JsonObject> consecutiveLateRun(List<JsonObject> comparable) {
        List<JsonObject> best = new ArrayList<>();
        List<JsonObject> current = new ArrayList<>();
        for (JsonObject fact : comparable) {
            boolean late = booleanValue(fact, "negative_eligible", false);
            if (!late) {
                current.clear();
                continue;
            }
            if (!current.isEmpty()
                    && intValue(fact, "time", 0)
                            - intValue(current.get(current.size() - 1), "time", 0) > 600) {
                current.clear();
            }
            current.add(fact);
            if (current.size() >= 2
                    && current.stream().anyMatch(item ->
                            booleanValue(item, "adverse_consequence", false))
                    && averageConfidence(current) >= 78
                    && current.size() > best.size()) {
                best = new ArrayList<>(current);
            }
        }
        return best;
    }

    private static List<JsonObject> consecutiveOnTimeRun(List<JsonObject> comparable) {
        List<JsonObject> best = new ArrayList<>();
        List<JsonObject> current = new ArrayList<>();
        for (JsonObject fact : comparable) {
            int delta = intValue(fact, "arrival_delta_seconds", Integer.MAX_VALUE);
            boolean onTime = delta < intValue(fact, "late_threshold_seconds", 5)
                    && !booleanValue(fact, "missed_first_rotation", true);
            if (!onTime) {
                current.clear();
                continue;
            }
            current.add(fact);
            if (current.size() >= 2
                    && current.stream().anyMatch(item ->
                            booleanValue(item, "positive_consequence", false))
                    && averageConfidence(current) >= 78
                    && current.size() > best.size()) {
                best = new ArrayList<>(current);
            }
        }
        return best;
    }

    private static List<JsonObject> consecutivePrematureRun(List<JsonObject> comparable) {
        List<JsonObject> best = new ArrayList<>();
        List<JsonObject> current = new ArrayList<>();
        for (JsonObject fact : comparable) {
            boolean premature = booleanValue(fact, "initiation_negative_eligible", false);
            if (!premature) {
                current.clear();
                continue;
            }
            if (!current.isEmpty()
                    && intValue(fact, "time", 0)
                            - intValue(current.get(current.size() - 1), "time", 0) > 600) {
                current.clear();
            }
            current.add(fact);
            if (current.size() >= 2
                    && current.stream().anyMatch(item ->
                            booleanValue(item, "adverse_consequence", false))
                    && averageConfidence(current) >= 78
                    && current.size() > best.size()) {
                best = new ArrayList<>(current);
            }
        }
        return best;
    }

    private static JsonObject latePattern(JsonObject modules, List<JsonObject> occurrences,
            int slot, int position, String patternType, boolean ordinaryEligible) {
        JsonObject first = occurrences.get(0);
        JsonObject row = new JsonObject();
        String id = "pattern:" + patternType + ":" + slot + ":" + intValue(first, "time", 0);
        row.addProperty("id", id);
        row.addProperty("kind", "improvement");
        row.addProperty("category", "combat_timing");
        row.addProperty("pattern_type", patternType);
        row.addProperty("title", switch (patternType) {
            case "late_arrival_sequence" -> "连续冲突中的到场时机偏晚";
            case "critical_late_arrival" -> "本场关键时机到场偏晚";
            default -> "单次到场时机待复核";
        });
        row.addProperty("what_happened", lateWhatHappened(occurrences));
        row.addProperty("why_it_matters", missedRotationCount(occurrences) > 0
                ? "到场晚于第一轮交战窗口，队伍的先手、控制或第一轮伤害无法得到及时衔接。"
                : "到场时间晚于同队有效接触，能够参与的输出和保护窗口被压缩。");
        int adverseCount = (int) occurrences.stream()
                .filter(item -> booleanValue(item, "adverse_consequence", false)).count();
        row.addProperty("result", adverseCount > 0
                ? occurrences.size() == 1
                        ? "你完成首次有效行动前，队伍已经出现减员或不利交换。"
                        : "这些冲突中有 " + adverseCount
                                + " 次在你完成首次有效行动前出现队友减员或不利交换。"
                : "该问题压缩了本位置衔接第一轮技能与保护队友的时间。");

        JsonObject itemContext = activationItemContext(modules, slot, occurrences);
        if (itemContext != null) {
            row.add("item_context", itemContext);
            row.addProperty("next_action",
                    itemContext.get("label").getAsString()
                            + "完成后的五分钟内，优先保持在先手队友一次移动或一次 TP 可跟进的范围。");
        } else {
            row.addProperty("next_action", roleAction(position));
        }
        row.addProperty("confidence", averageConfidence(occurrences));
        row.addProperty("ordinary_eligible", ordinaryEligible);
        row.addProperty("root_cause_id", "combat-timing:" + id);

        JsonArray occurrenceRows = new JsonArray();
        JsonArray evidenceRefs = new JsonArray();
        for (JsonObject occurrence : occurrences) {
            occurrenceRows.add(occurrenceRow(occurrence));
            addOccurrenceEvidenceRefs(evidenceRefs, occurrence, slot);
        }
        row.add("occurrences", occurrenceRows);
        row.add("evidence_refs", evidenceRefs);
        row.add("jump_target", object(first, "jump_target").deepCopy());

        JsonObject impacts = new JsonObject();
        impacts.addProperty("combat_duty", ordinaryEligible ? -5.0 : -2.0);
        impacts.addProperty("map_tempo", ordinaryEligible ? -3.0 : -1.0);
        row.add("dimension_impacts", impacts);

        JsonArray tags = new JsonArray();
        if (missedRotationCount(occurrences) >= 2) tags.add("missed_first_rotation_sequence");
        if (itemContext != null) tags.add("key_item_activation_gap");
        row.add("diagnostic_tags", tags);
        return row;
    }

    private static JsonObject onTimePattern(List<JsonObject> occurrences, int slot, int position) {
        JsonObject first = occurrences.get(0);
        JsonObject row = new JsonObject();
        String id = "pattern:on-time-follow-up:" + slot + ":" + intValue(first, "time", 0);
        row.addProperty("id", id);
        row.addProperty("kind", "strength");
        row.addProperty("category", "combat_timing");
        row.addProperty("pattern_type", "on_time_follow_up_sequence");
        row.addProperty("title", "连续冲突中及时衔接队友");
        row.addProperty("what_happened",
                formatTime(intValue(occurrences.get(0), "time", 0)) + " 和 "
                        + formatTime(intValue(occurrences.get(1), "time", 0))
                        + " 的两次冲突中，你都在第一轮交战结束前到场。");
        row.addProperty("why_it_matters", "及时到场让本位置能够衔接先手、控制或保护。");
        row.addProperty("result", "至少一次及时到场转化为有利交换。");
        row.addProperty("next_action", "继续保持开战前与队友的可跟进距离。");
        row.addProperty("confidence", averageConfidence(occurrences));
        row.addProperty("ordinary_eligible", true);
        row.addProperty("root_cause_id", "combat-timing:" + id);
        JsonArray occurrenceRows = new JsonArray();
        JsonArray refs = new JsonArray();
        for (JsonObject occurrence : occurrences) {
            occurrenceRows.add(occurrenceRow(occurrence));
            addOccurrenceEvidenceRefs(refs, occurrence, slot);
        }
        row.add("occurrences", occurrenceRows);
        row.add("evidence_refs", refs);
        row.add("jump_target", object(first, "jump_target").deepCopy());
        JsonObject impacts = new JsonObject();
        impacts.addProperty("combat_duty", 4.0);
        impacts.addProperty("map_tempo", 2.0);
        row.add("dimension_impacts", impacts);
        return row;
    }

    private static JsonObject prematurePattern(List<JsonObject> occurrences, int slot,
            int position, String patternType, boolean ordinaryEligible) {
        JsonObject first = occurrences.get(0);
        JsonObject row = new JsonObject();
        String id = "pattern:" + patternType + ":" + slot + ":" + intValue(first, "time", 0);
        row.addProperty("id", id);
        row.addProperty("kind", "improvement");
        row.addProperty("category", "combat_timing");
        row.addProperty("pattern_type", patternType);
        row.addProperty("title", switch (patternType) {
            case "premature_initiation_sequence" -> "连续先手早于队友到场";
            case "critical_premature_initiation" -> "本场关键先手缺少队友跟进";
            default -> "单次先手时机待复核";
        });
        if (occurrences.size() >= 2) {
            row.addProperty("what_happened",
                    formatTime(intValue(first, "time", 0))
                            + " 后连续两次冲突中，你都早于队友有效接触先手；"
                            + "先手时附近可立即跟进的队友均为 0 人。");
        } else {
            row.addProperty("what_happened",
                    formatTime(intValue(first, "time", 0)) + " 的"
                            + regionLabel(stringValue(first, "region", "unknown"))
                            + "冲突中，你早于队友有效接触 "
                            + intValue(first, "initiation_lead_seconds", 0)
                            + " 秒先手，附近没有可立即跟进的队友。");
        }
        row.addProperty("why_it_matters", "控制或先手窗口开始时没有队友接续，目标可以脱离或反打。");
        row.addProperty("result", occurrences.size() == 1
                ? "这次先手后、本队在你完成第二轮行动前出现了减员或不利交换。"
                : "这些冲突中至少一次在队友完成跟进前出现本方减员或不利交换。");
        row.addProperty("next_action", position == 3
                ? "下一局先手前确认至少一名输出队友能在三秒内进入施法或攻击范围。"
                : "下一局先手前确认至少一名队友能在三秒内完成控制、伤害或保护衔接。");
        row.addProperty("confidence", averageConfidence(occurrences));
        row.addProperty("ordinary_eligible", ordinaryEligible);
        row.addProperty("root_cause_id", "combat-timing:" + id);
        JsonArray occurrenceRows = new JsonArray();
        JsonArray refs = new JsonArray();
        for (JsonObject occurrence : occurrences) {
            occurrenceRows.add(occurrenceRow(occurrence));
            addOccurrenceEvidenceRefs(refs, occurrence, slot);
        }
        row.add("occurrences", occurrenceRows);
        row.add("evidence_refs", refs);
        row.add("jump_target", object(first, "jump_target").deepCopy());
        JsonObject impacts = new JsonObject();
        impacts.addProperty("combat_duty", ordinaryEligible ? -5.0 : -2.0);
        impacts.addProperty("survival_risk", ordinaryEligible ? -2.0 : -1.0);
        row.add("dimension_impacts", impacts);
        return row;
    }

    private static void addOccurrenceEvidenceRefs(JsonArray refs, JsonObject occurrence, int slot) {
        refs.add(stringValue(occurrence, "id", ""));
        String fightId = stringValue(occurrence, "fight_id", "");
        if (!fightId.isBlank()) refs.add("combat:" + fightId + ":" + slot);
    }

    private static JsonObject occurrenceRow(JsonObject fact) {
        JsonObject row = new JsonObject();
        for (String key : List.of(
                "id", "fight_id", "time", "region", "team_engage_time",
                "player_spatial_arrival_time", "first_meaningful_action_time",
                "arrival_delta_seconds", "first_rotation_end",
                "missed_first_rotation", "join_feasibility", "adverse_consequence",
                "confidence", "importance_tier", "first_local_action_time",
                "initiation_lead_seconds", "allies_in_range_at_first_action",
                "premature_initiation")) {
            copy(row, fact, key);
        }
        int delta = intValue(fact, "arrival_delta_seconds", 0);
        row.addProperty("label",
                formatTime(intValue(fact, "time", 0)) + " "
                        + regionLabel(stringValue(fact, "region", "unknown"))
                        + " +" + delta + "秒");
        JsonObject jump = object(fact, "jump_target");
        if (jump != null) row.add("jump_target", jump.deepCopy());
        return row;
    }

    private static JsonObject activationItemContext(JsonObject modules, int slot,
            List<JsonObject> occurrences) {
        JsonObject build = object(modules, "build");
        JsonObject bySlot = object(build, "by_slot");
        JsonObject player = object(bySlot, Integer.toString(slot));
        JsonArray purchases = array(player, "purchases");
        if (purchases == null || occurrences.isEmpty()) return null;
        int firstTime = intValue(occurrences.get(0), "time", 0);
        int lastTime = intValue(occurrences.get(occurrences.size() - 1), "time", firstTime);
        JsonObject best = null;
        for (JsonElement element : purchases) {
            if (!element.isJsonObject()) continue;
            JsonObject purchase = element.getAsJsonObject();
            String key = stringValue(purchase, "key", "");
            if (!ACTIVATION_ITEMS.containsKey(key)) continue;
            int time = intValue(purchase, "time", Integer.MIN_VALUE);
            if (time > firstTime || lastTime > time + 300) continue;
            if (best == null || time > intValue(best, "time", Integer.MIN_VALUE)) {
                best = purchase;
            }
        }
        if (best == null) return null;
        String key = stringValue(best, "key", "");
        int time = intValue(best, "time", 0);
        JsonObject context = new JsonObject();
        context.addProperty("key", key);
        context.addProperty("label", ACTIVATION_ITEMS.get(key));
        context.addProperty("purchase_time", time);
        context.addProperty("window_start", time);
        context.addProperty("window_end", time + 300);
        return context;
    }

    private static String lateWhatHappened(List<JsonObject> occurrences) {
        if (occurrences.size() == 1) {
            JsonObject occurrence = occurrences.get(0);
            return formatTime(intValue(occurrence, "time", 0))
                    + " 的" + regionLabel(stringValue(occurrence, "region", "unknown"))
                    + "冲突中，你晚于队伍接触 "
                    + intValue(occurrence, "arrival_delta_seconds", 0) + " 秒到场。";
        }
        JsonObject first = occurrences.get(0);
        JsonObject second = occurrences.get(1);
        return formatTime(intValue(first, "time", 0)) + " 后连续两次冲突中，你分别晚于队伍接触 "
                + intValue(first, "arrival_delta_seconds", 0) + " 秒和 "
                + intValue(second, "arrival_delta_seconds", 0)
                + " 秒到场。";
    }

    private static String roleAction(int position) {
        return switch (position) {
            case 1 -> "下一局只在关键目标或装备窗口到来时提前靠近队伍，避免临时从远端路线赶场。";
            case 2 -> "下一局进入节奏期后，优先保持在先手队友一次移动或一次 TP 可跟进的范围。";
            case 3 -> "下一局准备接第一轮先手时，先确认至少一名输出队友能在三秒内跟进。";
            case 4 -> "下一局可到场冲突出现时，优先跟随先手队友并衔接第一轮控制或保护。";
            default -> "下一局关键冲突前提前靠近核心，确保第一轮控制或救人技能能够覆盖。";
        };
    }

    private static int missedRotationCount(List<JsonObject> occurrences) {
        return (int) occurrences.stream()
                .filter(item -> booleanValue(item, "missed_first_rotation", false)).count();
    }

    private static int averageConfidence(List<JsonObject> rows) {
        if (rows.isEmpty()) return 0;
        return (int) Math.round(rows.stream()
                .mapToInt(item -> intValue(item, "confidence", 0)).average().orElse(0));
    }

    private static boolean containsFact(List<JsonObject> rows, String id) {
        return rows.stream().anyMatch(item -> id.equals(stringValue(item, "id", "")));
    }

    private static boolean criticalContext(JsonObject fight, String importanceTier) {
        if ("critical".equals(importanceTier)) return true;
        String region = stringValue(fight, "region", "");
        if (region.contains("roshan") || region.contains("base") || region.contains("highground")) {
            return true;
        }
        JsonObject tower = object(fight, "tower_context");
        return tower != null && (
                booleanValue(tower, "confirmed_dive", false)
                || "high_ground".equals(stringValue(tower, "status", "")));
    }

    private static FightOutcome fightOutcome(JsonObject fight, int slot, int firstActionTime) {
        int teamDeaths = 0;
        int enemyDeaths = 0;
        int allyDeathsBefore = 0;
        JsonArray events = array(fight, "events");
        if (events != null) {
            for (JsonElement element : events) {
                if (!element.isJsonObject()) continue;
                JsonObject event = element.getAsJsonObject();
                if (!"hero_death".equals(stringValue(event, "kind", ""))) continue;
                int targetSlot = intValue(event, "target_slot", -1);
                if (targetSlot < 0) continue;
                int time = intValue(event, "time", Integer.MAX_VALUE);
                if ((targetSlot < 5) == (slot < 5)) {
                    teamDeaths++;
                    if (time <= firstActionTime) allyDeathsBefore++;
                } else {
                    enemyDeaths++;
                }
            }
        }
        return new FightOutcome(teamDeaths, enemyDeaths, allyDeathsBefore);
    }

    private static String formatTime(int seconds) {
        int safe = Math.max(0, seconds);
        return String.format("%02d:%02d", safe / 60, safe % 60);
    }

    private static String regionLabel(String region) {
        return switch (region) {
            case "mid_lane" -> "中路";
            case "top_lane" -> "上路";
            case "bottom_lane" -> "下路";
            case "river" -> "河道";
            case "roshan_pit" -> "肉山区域";
            case "radiant_jungle" -> "天辉野区";
            case "dire_jungle" -> "夜魇野区";
            case "radiant_base" -> "天辉基地";
            case "dire_base" -> "夜魇基地";
            default -> "目标区域";
        };
    }

    private static Point fightCenter(JsonObject fight) {
        JsonArray phases = array(fight, "phases");
        if (phases != null) {
            for (String wanted : List.of("initiation", "clash")) {
                for (JsonElement element : phases) {
                    if (!element.isJsonObject()) continue;
                    JsonObject phase = element.getAsJsonObject();
                    if (!wanted.equals(stringValue(phase, "kind", ""))) continue;
                    Point point = point(phase);
                    if (point != null) return point;
                }
            }
        }
        return point(fight);
    }

    private static Point point(JsonObject source) {
        if (source == null || !booleanValue(source, "coordinate_valid", false)) return null;
        double x = number(source, "x", Double.NaN);
        double y = number(source, "y", Double.NaN);
        if (!Double.isFinite(x) || !Double.isFinite(y)
                || x < 0 || x > 100 || y < 0 || y > 100) {
            return null;
        }
        return new Point(x, y);
    }

    private static Integer spatialArrival(List<SnapshotRow> rows, int start, int end,
            Point center, double radius) {
        for (int index = 0; index < rows.size(); index++) {
            SnapshotRow row = rows.get(index);
            if (row.second < start || row.second > end || !row.alive()) continue;
            if (distance(row.point(), center) > radius) continue;

            int insideSamples = 0;
            int windowEnd = row.second + 2;
            for (int next = index; next < rows.size(); next++) {
                SnapshotRow candidate = rows.get(next);
                if (candidate.second > windowEnd) break;
                if (candidate.second >= row.second && candidate.alive()
                        && distance(candidate.point(), center) <= radius) {
                    insideSamples++;
                }
            }
            if (insideSamples >= 2) return row.second;
        }
        return null;
    }

    private static Integer firstCombatAction(JsonObject fight, int slot) {
        return firstCombatActionAtOrAfter(fight, slot, Integer.MIN_VALUE);
    }

    private static Integer firstCombatActionAtOrAfter(JsonObject fight, int slot, int notBefore) {
        JsonArray events = array(fight, "events");
        if (events == null) return null;
        Integer earliest = null;
        for (JsonElement element : events) {
            if (!element.isJsonObject()) continue;
            JsonObject event = element.getAsJsonObject();
            if (intValue(event, "actor_slot", -1) != slot) continue;
            if (!MEANINGFUL_ACTION_KINDS.contains(stringValue(event, "kind", ""))) continue;
            int time = intValue(event, "time", Integer.MAX_VALUE);
            if (time == Integer.MAX_VALUE || time < notBefore) continue;
            if (earliest == null || time < earliest) earliest = time;
        }
        return earliest;
    }

    private static Integer firstLocalAction(JsonObject fight, int slot, SnapshotTable snapshots,
            Point center, double radius, int notBefore) {
        JsonArray events = array(fight, "events");
        if (events == null) return null;
        Integer earliest = null;
        for (JsonElement element : events) {
            if (!element.isJsonObject()) continue;
            JsonObject event = element.getAsJsonObject();
            if (intValue(event, "actor_slot", -1) != slot) continue;
            if (!MEANINGFUL_ACTION_KINDS.contains(stringValue(event, "kind", ""))) continue;
            int time = intValue(event, "time", Integer.MAX_VALUE);
            if (time == Integer.MAX_VALUE || time < notBefore) continue;
            SnapshotRow snapshot = snapshots.atOrBefore(slot, time);
            if (snapshot == null || !snapshot.alive()
                    || distance(snapshot.point(), center) > radius) {
                continue;
            }
            if (earliest == null || time < earliest) earliest = time;
        }
        return earliest;
    }

    private static int alliesInRange(SnapshotTable snapshots, int slot, int time,
            Point center, double radius) {
        int allies = 0;
        for (int candidate : snapshots.slots()) {
            if (candidate == slot || (candidate < 5) != (slot < 5)) continue;
            SnapshotRow snapshot = snapshots.atOrBefore(candidate, time);
            if (snapshot == null || !snapshot.alive()) continue;
            if (distance(snapshot.point(), center) <= radius) allies++;
        }
        return allies;
    }

    private static int firstRotationEnd(JsonObject fight, int engageTime) {
        JsonArray phases = array(fight, "phases");
        if (phases != null) {
            for (JsonElement element : phases) {
                if (!element.isJsonObject()) continue;
                JsonObject phase = element.getAsJsonObject();
                if (!"initiation".equals(stringValue(phase, "kind", ""))) continue;
                int end = intValue(phase, "end", engageTime + 8);
                return Math.max(engageTime, end);
            }
        }
        return engageTime + 8;
    }

    private static int alliedFirstRotationActionCount(JsonObject fight, int slot,
            int engageTime, int beforeTime) {
        JsonArray events = array(fight, "events");
        if (events == null) return 0;
        Set<String> actions = new java.util.LinkedHashSet<>();
        for (JsonElement element : events) {
            if (!element.isJsonObject()) continue;
            JsonObject event = element.getAsJsonObject();
            int actorSlot = intValue(event, "actor_slot", -1);
            if (actorSlot < 0 || (actorSlot < 5) != (slot < 5)) continue;
            int time = intValue(event, "time", Integer.MAX_VALUE);
            if (time < engageTime || time >= beforeTime) continue;
            String kind = stringValue(event, "kind", "");
            if (!"ability_use".equals(kind) && !"control".equals(kind)) continue;
            String key = stringValue(event, "key", "");
            if (!key.isBlank()) actions.add(kind + ":" + key);
        }
        return actions.size();
    }

    private static Integer expectedArrivalSeconds(SnapshotRow origin, Point center) {
        if (origin == null || origin.moveSpeed == null || origin.moveSpeed <= 0) return null;
        double worldDistance = distance(origin.point(), center) * 160.0;
        return (int) Math.ceil(worldDistance / origin.moveSpeed);
    }

    private static int lateThreshold(int position) {
        return switch (position) {
            case 1 -> 8;
            case 2, 3 -> 5;
            default -> 4;
        };
    }

    private static String roleExpectation(int position) {
        return switch (position) {
            case 1 -> "selective_core_join";
            case 2 -> "tempo_follow_up";
            case 3 -> "initiation_or_frontline";
            case 4 -> "follow_initiation";
            default -> "defensive_follow_up";
        };
    }

    private static double distance(Point left, Point right) {
        return Math.hypot(left.x - right.x, left.y - right.y);
    }

    private static JsonObject object(JsonObject source, String key) {
        if (source == null || !source.has(key) || !source.get(key).isJsonObject()) return null;
        return source.getAsJsonObject(key);
    }

    private static JsonArray array(JsonObject source, String key) {
        if (source == null || !source.has(key) || !source.get(key).isJsonArray()) return null;
        return source.getAsJsonArray(key);
    }

    private static void copy(JsonObject target, JsonObject source, String key) {
        if (source == null || !source.has(key) || source.get(key).isJsonNull()) return;
        target.add(key, source.get(key).deepCopy());
    }

    private static String stringValue(JsonObject source, String key, String fallback) {
        if (source == null || !source.has(key) || source.get(key).isJsonNull()) return fallback;
        try {
            return source.get(key).getAsString();
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static int intValue(JsonObject source, String key, int fallback) {
        if (source == null || !source.has(key) || source.get(key).isJsonNull()) return fallback;
        try {
            return source.get(key).getAsInt();
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static double number(JsonObject source, String key, double fallback) {
        if (source == null || !source.has(key) || source.get(key).isJsonNull()) return fallback;
        try {
            double value = source.get(key).getAsDouble();
            return Double.isFinite(value) ? value : fallback;
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static boolean booleanValue(JsonObject source, String key, boolean fallback) {
        if (source == null || !source.has(key) || source.get(key).isJsonNull()) return fallback;
        try {
            return source.get(key).getAsBoolean();
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private static int clampInt(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private record Point(double x, double y) {
    }

    private record FightOutcome(int teamDeaths, int enemyDeaths, int allyDeathsBeforeFirstAction) {
        boolean adverse() {
            return teamDeaths > enemyDeaths || allyDeathsBeforeFirstAction > 0;
        }

        boolean positive() {
            return enemyDeaths > teamDeaths;
        }
    }

    private record SnapshotRow(int second, Double x, Double y, Integer lifeState, Double moveSpeed) {
        boolean alive() {
            return lifeState == null || lifeState == 0;
        }

        Point point() {
            return new Point(x, y);
        }
    }

    private static final class SnapshotTable {
        private final Map<Integer, List<SnapshotRow>> rowsBySlot;

        private SnapshotTable(Map<Integer, List<SnapshotRow>> rowsBySlot) {
            this.rowsBySlot = rowsBySlot;
        }

        static SnapshotTable from(JsonObject source) {
            Map<Integer, List<SnapshotRow>> rowsBySlot = new HashMap<>();
            JsonArray fields = array(source, "fields");
            JsonObject bySlot = object(source, "by_slot");
            if (fields == null || bySlot == null) return new SnapshotTable(rowsBySlot);

            Map<String, Integer> indexes = new HashMap<>();
            for (int index = 0; index < fields.size(); index++) {
                try {
                    indexes.put(fields.get(index).getAsString(), index);
                } catch (RuntimeException ignored) {
                    // Ignore malformed field descriptors.
                }
            }
            Integer secondIndex = indexes.get("second");
            Integer xIndex = indexes.get("x");
            Integer yIndex = indexes.get("y");
            if (secondIndex == null || xIndex == null || yIndex == null) {
                return new SnapshotTable(rowsBySlot);
            }

            for (Map.Entry<String, JsonElement> entry : bySlot.entrySet()) {
                if (!entry.getValue().isJsonArray()) continue;
                int slot;
                try {
                    slot = Integer.parseInt(entry.getKey());
                } catch (NumberFormatException ignored) {
                    continue;
                }
                List<SnapshotRow> rows = new ArrayList<>();
                for (JsonElement element : entry.getValue().getAsJsonArray()) {
                    if (!element.isJsonArray()) continue;
                    JsonArray row = element.getAsJsonArray();
                    Integer second = integerAt(row, secondIndex);
                    Double x = doubleAt(row, xIndex);
                    Double y = doubleAt(row, yIndex);
                    if (second == null || x == null || y == null) continue;
                    rows.add(new SnapshotRow(
                            second,
                            x,
                            y,
                            integerAt(row, indexes.get("life_state")),
                            doubleAt(row, indexes.get("move_speed"))));
                }
                rows.sort(Comparator.comparingInt(SnapshotRow::second));
                rowsBySlot.put(slot, rows);
            }
            return new SnapshotTable(rowsBySlot);
        }

        List<SnapshotRow> rows(int slot) {
            return rowsBySlot.getOrDefault(slot, List.of());
        }

        int rowCount(int slot) {
            return rows(slot).size();
        }

        Set<Integer> slots() {
            return rowsBySlot.keySet();
        }

        SnapshotRow atOrBefore(int slot, int second) {
            SnapshotRow result = null;
            for (SnapshotRow row : rows(slot)) {
                if (row.second > second) break;
                result = row;
            }
            return result;
        }

        int coveragePct(int slot, int start, int end) {
            int expected = Math.max(1, end - start + 1);
            int observed = 0;
            for (SnapshotRow row : rows(slot)) {
                if (row.second < start) continue;
                if (row.second > end) break;
                observed++;
            }
            return clampInt((int) Math.round(observed * 100.0 / expected), 0, 100);
        }

        private static Integer integerAt(JsonArray row, Integer index) {
            if (index == null || index < 0 || index >= row.size() || row.get(index).isJsonNull()) return null;
            try {
                return row.get(index).getAsInt();
            } catch (RuntimeException ignored) {
                return null;
            }
        }

        private static Double doubleAt(JsonArray row, Integer index) {
            if (index == null || index < 0 || index >= row.size() || row.get(index).isJsonNull()) return null;
            try {
                double value = row.get(index).getAsDouble();
                return Double.isFinite(value) ? value : null;
            } catch (RuntimeException ignored) {
                return null;
            }
        }
    }
}
