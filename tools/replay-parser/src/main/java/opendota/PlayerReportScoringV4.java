package opendota;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;

final class PlayerReportScoringV4 {
    static final String SCHEMA = "player-report/4.0";
    static final String AUDIT_MODEL = "player-report-score-audit/1.0";
    static final double ROOT_NEGATIVE_OVERALL_CAP = 6.0;
    static final double DIMENSION_NEGATIVE_CAP = 15.0;
    static final double DIMENSION_POSITIVE_CAP = 10.0;
    static final double OVERALL_NEGATIVE_CAP = 12.0;
    static final double OVERALL_POSITIVE_CAP = 8.0;
    static final double RECOMPUTE_TOLERANCE = 0.05;
    static final int MIN_MODIFIER_CONFIDENCE = 70;

    private static final Set<String> EMBEDDED_CATEGORIES = Set.of(
            "lane_execution",
            "lane_support_route",
            "farm_route",
            "resource_decision",
            "farm_efficiency",
            "combat_duty",
            "combat_output",
            "survival_risk",
            "objective_conversion",
            "vision_team",
            "map_tempo",
            "observable_execution");
    private static final Set<String> MODIFIER_CATEGORIES = Set.of("combat_timing");

    private PlayerReportScoringV4() {
    }

    static void apply(JsonObject report) {
        if (report == null) return;

        JsonArray dimensionRows = array(report, "dimensions");
        if (dimensionRows == null) {
            dimensionRows = new JsonArray();
            report.add("dimensions", dimensionRows);
        }
        boolean currentAtomicModel = PlayerReportBaseComponents.MODEL.equals(
                stringValue(report, "base_component_model", ""));
        LinkedHashMap<String, DimensionState> dimensions = dimensions(
                dimensionRows, currentAtomicModel);
        double availableWeight = dimensions.values().stream()
                .filter(item -> item.available)
                .mapToDouble(item -> item.roleWeight)
                .sum();
        for (DimensionState dimension : dimensions.values()) {
            dimension.effectiveWeight = dimension.available && availableWeight > 0
                    ? dimension.roleWeight * 100.0 / availableWeight
                    : 0;
            prepareDimension(dimension);
        }

        JsonArray rootRows = array(report, "root_causes");
        if (rootRows == null) {
            rootRows = new JsonArray();
            report.add("root_causes", rootRows);
        }
        List<ImpactState> impacts = collectImpacts(rootRows, dimensions);
        deduplicate(impacts);
        capRoots(impacts, dimensions);
        capDimensions(impacts, dimensions);

        double baseOverall = weightedOverall(dimensions, false);
        double beforeOverallCap = adjustmentWithFactors(dimensions, impacts, 1.0, 1.0);
        double negativeOverallFactor = 1.0;
        double positiveOverallFactor = 1.0;
        if (beforeOverallCap < -OVERALL_NEGATIVE_CAP) {
            negativeOverallFactor = findOverallFactor(
                    dimensions, impacts, true, -OVERALL_NEGATIVE_CAP);
        } else if (beforeOverallCap > OVERALL_POSITIVE_CAP) {
            positiveOverallFactor = findOverallFactor(
                    dimensions, impacts, false, OVERALL_POSITIVE_CAP);
        }
        for (ImpactState impact : impacts) {
            impact.overallCapFactor = impact.dimensionCappedDelta < 0
                    ? negativeOverallFactor
                    : impact.dimensionCappedDelta > 0 ? positiveOverallFactor : 1.0;
            impact.appliedDelta = round2(impact.dimensionCappedDelta * impact.overallCapFactor);
        }

        finalizeDimensions(dimensions, impacts);
        double finalOverall = weightedOverall(dimensions, true);
        double behaviorModifier = round2(finalOverall - baseOverall);
        baseOverall = round2(baseOverall);
        finalOverall = round2(finalOverall);

        JsonObject pathCounts = pathCounts(impacts);
        JsonObject overallCap = new JsonObject();
        overallCap.addProperty("before_cap", round2(beforeOverallCap));
        overallCap.addProperty("after_cap", behaviorModifier);
        overallCap.addProperty("negative_limit", -OVERALL_NEGATIVE_CAP);
        overallCap.addProperty("positive_limit", OVERALL_POSITIVE_CAP);
        overallCap.addProperty("negative_factor", round4(negativeOverallFactor));
        overallCap.addProperty("positive_factor", round4(positiveOverallFactor));
        overallCap.addProperty("applied",
                negativeOverallFactor < 0.99995 || positiveOverallFactor < 0.99995);

        JsonObject audit = new JsonObject();
        audit.addProperty("model", AUDIT_MODEL);
        audit.addProperty("formula_version", SCHEMA);
        audit.addProperty("dimension_formula", "clamp(base_score + sum(applied_delta), 0, 100)");
        audit.addProperty("overall_formula",
                "sum(dimension_score * effective_weight) / sum(effective_weight)");
        audit.addProperty("weight_denominator", round4(effectiveWeightTotal(dimensions)));
        audit.addProperty("recomputed_base_score", baseOverall);
        audit.addProperty("recomputed_final_score", finalOverall);
        audit.addProperty("recomputed_behavior_modifier", behaviorModifier);
        audit.addProperty("recomputation_tolerance", RECOMPUTE_TOLERANCE);
        audit.addProperty("recomputation_valid", dimensions.values().stream()
                .allMatch(item -> !item.currentAtomicModel || item.baseComponentValid));
        audit.addProperty("base_component_model", currentAtomicModel
                ? PlayerReportBaseComponents.MODEL : "existing_dimension_model");
        audit.addProperty("atomic_dimension_count", dimensions.values().stream()
                .filter(item -> item.currentAtomicModel && item.atomicComponentsPresent).count());
        audit.addProperty("aggregate_fallback_count", dimensions.values().stream()
                .filter(item -> item.aggregateFallback).count());
        audit.add("score_path_counts", pathCounts.deepCopy());
        audit.addProperty("duplicate_suppressed_count", impacts.stream()
                .filter(item -> "suppressed_duplicate".equals(item.dedupeStatus)).count());
        JsonObject limits = new JsonObject();
        limits.addProperty("root_negative_overall", ROOT_NEGATIVE_OVERALL_CAP);
        limits.addProperty("dimension_negative", -DIMENSION_NEGATIVE_CAP);
        limits.addProperty("dimension_positive", DIMENSION_POSITIVE_CAP);
        limits.addProperty("overall_negative", -OVERALL_NEGATIVE_CAP);
        limits.addProperty("overall_positive", OVERALL_POSITIVE_CAP);
        audit.add("limits", limits);
        audit.add("overall_cap", overallCap);

        JsonObject scoreCard = object(report, "score_card");
        if (scoreCard == null) {
            scoreCard = new JsonObject();
            report.add("score_card", scoreCard);
        }
        scoreCard.addProperty("model", SCHEMA);
        scoreCard.addProperty("base_score", baseOverall);
        scoreCard.addProperty("behavior_modifier", behaviorModifier);
        scoreCard.addProperty("final_score", finalOverall);
        scoreCard.addProperty("overall_score", finalOverall);
        scoreCard.addProperty("grade", grade(report, finalOverall, availableWeight));
        scoreCard.addProperty("available_weight", round2(availableWeight));
        scoreCard.addProperty("dimension_coverage", dimensions.values().stream()
                .filter(item -> item.available).count());
        scoreCard.addProperty("dimension_target", dimensions.size());
        scoreCard.add("dimensions", dimensionRows.deepCopy());
        scoreCard.add("audit", audit);
        scoreCard.add("root_cause_summary",
                rootCauseSummary(scoreCard, impacts, pathCounts, behaviorModifier));
        scoreCard.add("attribution_summary",
                attributionSummary(impacts, finalOverall));

        report.addProperty("model", SCHEMA);
        report.addProperty("base_score", baseOverall);
        report.addProperty("behavior_modifier", behaviorModifier);
        report.addProperty("final_score", finalOverall);
        report.addProperty("overall_score", finalOverall);
        report.addProperty("grade", scoreCard.get("grade").getAsString());
        report.addProperty("available_weight", round2(availableWeight));
        report.addProperty("dimension_coverage", dimensions.values().stream()
                .filter(item -> item.available).count());
    }

    private static LinkedHashMap<String, DimensionState> dimensions(JsonArray rows,
            boolean currentAtomicModel) {
        LinkedHashMap<String, DimensionState> result = new LinkedHashMap<>();
        for (JsonElement element : rows) {
            if (!element.isJsonObject()) continue;
            JsonObject row = element.getAsJsonObject();
            String key = stringValue(row, "key", "");
            if (key.isBlank() || result.containsKey(key)) continue;
            boolean declaredAvailable = booleanValue(row, "available", row.has("score"));
            boolean sourceScoreValid = finiteNumber(row, "base_score")
                    || finiteNumber(row, "score");
            boolean available = declaredAvailable
                    && (currentAtomicModel || sourceScoreValid);
            double base = available
                    ? clamp(number(row, "base_score", number(row, "score", 0)), 0, 100)
                    : 0;
            double roleWeight = Math.max(0, number(row, "weight", 0));
            result.put(key, new DimensionState(row, key, available, roleWeight, base,
                    currentAtomicModel, sourceScoreValid));
        }
        return result;
    }

    private static void prepareDimension(DimensionState dimension) {
        JsonObject row = dimension.row;
        row.addProperty("effective_weight", round4(dimension.effectiveWeight));
        row.add("comparison", comparison(dimension.key));
        row.add("scoring_components", new JsonArray());
        JsonArray baseComponents = array(row, "base_components");
        if (dimension.currentAtomicModel) {
            prepareAtomicBaseComponents(dimension, baseComponents);
        } else if (baseComponents == null || baseComponents.isEmpty()) {
            baseComponents = new JsonArray();
            row.add("base_components", baseComponents);
        }
        if (!dimension.available) {
            row.add("base_score", JsonNull.INSTANCE);
            row.add("behavior_modifier", JsonNull.INSTANCE);
            row.add("final_score", JsonNull.INSTANCE);
            row.add("score", JsonNull.INSTANCE);
            row.remove("score_impact");
            row.addProperty("status", "missing");
            JsonObject recomputation = new JsonObject();
            recomputation.addProperty("status", "excluded_missing_dimension");
            recomputation.addProperty("included_in_overall", false);
            addBaseComponentRecomputation(recomputation, dimension);
            row.add("recomputation", recomputation);
            return;
        }

        row.addProperty("base_score", round2(dimension.baseScore));
        if (dimension.currentAtomicModel || !baseComponents.isEmpty()) return;
        JsonObject component = new JsonObject();
        component.addProperty("key", "existing_dimension_model");
        component.addProperty("label", "现有维度基础模型");
        component.addProperty("normalized_score", round2(dimension.baseScore));
        component.addProperty("local_weight", 100);
        component.addProperty("weighted_contribution", round2(dimension.baseScore));
        component.addProperty("confidence", number(row, "confidence", 0));
        JsonArray refs = array(row, "metric_refs");
        component.add("evidence_refs", refs == null ? new JsonArray() : refs.deepCopy());
        baseComponents.add(component);
        dimension.aggregateFallback = true;
    }

    private static void prepareAtomicBaseComponents(DimensionState dimension,
            JsonArray baseComponents) {
        if (baseComponents == null || baseComponents.isEmpty()) {
            dimension.baseComponentValid = false;
            return;
        }
        boolean unavailableComponentsValid = dimension.available
                || unavailableAtomicComponentsValid(baseComponents);
        try {
            PlayerReportBaseComponents.Calculation calculation =
                    PlayerReportBaseComponents.fromJson(baseComponents);
            dimension.atomicComponentsPresent = true;
            dimension.baseComponentRecomputedScore = calculation.score();
            dimension.baseComponentWeightSum = calculation.components().stream()
                    .filter(component -> component.input().available())
                    .mapToDouble(PlayerReportBaseComponents.ComponentResult::effectiveLocalWeight)
                    .sum();
            dimension.row.add("base_components", PlayerReportBaseComponents.toJson(calculation));

            if (!dimension.available) {
                dimension.baseComponentValid = unavailableComponentsValid
                        && !calculation.available()
                        && calculation.score() == null
                        && Math.abs(dimension.baseComponentWeightSum)
                                <= PlayerReportBaseComponents.WEIGHT_TOLERANCE;
                return;
            }
            double storedBaseScore = number(dimension.row, "base_score",
                    number(dimension.row, "score", 0));
            dimension.baseComponentValid = dimension.sourceScoreValid
                    && calculation.available()
                    && calculation.score() != null
                    && Math.abs(calculation.score() - storedBaseScore)
                            <= PlayerReportBaseComponents.SCORE_TOLERANCE
                    && Math.abs(dimension.baseComponentWeightSum - 100.0)
                            <= PlayerReportBaseComponents.WEIGHT_TOLERANCE;
        } catch (RuntimeException ignored) {
            dimension.baseComponentValid = false;
        }
    }

    private static boolean unavailableAtomicComponentsValid(JsonArray components) {
        for (JsonElement element : components) {
            if (!element.isJsonObject()) return false;
            JsonObject component = element.getAsJsonObject();
            JsonElement available = component.get("available");
            if (available == null || available.isJsonNull()
                    || !available.isJsonPrimitive()
                    || !available.getAsJsonPrimitive().isBoolean()
                    || available.getAsBoolean()
                    || !explicitNull(component, "normalized_score")
                    || !finiteNumber(component, "effective_local_weight")
                    || Math.abs(component.get("effective_local_weight").getAsDouble())
                            > PlayerReportBaseComponents.WEIGHT_TOLERANCE
                    || !explicitNull(component, "weighted_contribution")) {
                return false;
            }
        }
        return true;
    }

    private static void addBaseComponentRecomputation(JsonObject recomputation,
            DimensionState dimension) {
        if (!dimension.currentAtomicModel) return;
        recomputation.addProperty("base_component_model", PlayerReportBaseComponents.MODEL);
        recomputation.addProperty("base_component_valid", dimension.baseComponentValid);
        recomputation.add("base_component_recomputed_score",
                dimension.baseComponentRecomputedScore == null ? JsonNull.INSTANCE
                        : new com.google.gson.JsonPrimitive(
                                round2(dimension.baseComponentRecomputedScore)));
        recomputation.addProperty("base_component_weight_sum",
                round4(dimension.baseComponentWeightSum));
    }

    private static List<ImpactState> collectImpacts(JsonArray roots,
            Map<String, DimensionState> dimensions) {
        List<ImpactState> result = new ArrayList<>();
        for (JsonElement element : roots) {
            if (!element.isJsonObject()) continue;
            JsonObject root = element.getAsJsonObject();
            root.add("scoring_impacts", new JsonArray());
            JsonObject source = object(root, "dimension_impacts");
            if (source == null) continue;
            for (Map.Entry<String, JsonElement> entry : source.entrySet()) {
                String dimensionKey = entry.getKey();
                double rawDelta = clamp(number(entry.getValue()), -25, 25);
                DimensionState dimension = dimensions.get(dimensionKey);
                ImpactState impact = new ImpactState(root, dimension, dimensionKey, rawDelta);
                impact.confidenceFactor = clamp(number(root, "confidence", 0) / 100.0, 0, 1);
                Responsibility responsibility = responsibility(root);
                impact.responsibility = responsibility.name;
                impact.responsibilityFactor = responsibility.factor;
                impact.scorePath = scorePath(root, dimension, impact.confidenceFactor,
                        impact.responsibilityFactor);
                impact.overlapFactor = "modifier".equals(impact.scorePath) ? 1.0 : 0.0;
                impact.overlapReason = overlapReason(root, dimension, impact);
                impact.candidateDelta = round4(rawDelta * impact.confidenceFactor
                        * impact.responsibilityFactor * impact.overlapFactor);
                impact.dedupeKey = dedupeKey(root, dimensionKey);
                impact.dedupeStatus = "modifier".equals(impact.scorePath)
                        ? Math.abs(impact.candidateDelta) < 0.0001 ? "no_effect" : "candidate"
                        : "not_applicable";
                impact.suppressionReason = suppressionReason(impact);
                result.add(impact);
            }
        }
        return result;
    }

    private static void deduplicate(List<ImpactState> impacts) {
        Map<String, List<ImpactState>> groups = new LinkedHashMap<>();
        for (ImpactState impact : impacts) {
            if (!"modifier".equals(impact.scorePath)
                    || Math.abs(impact.candidateDelta) < 0.0001) continue;
            groups.computeIfAbsent(impact.dedupeKey, ignored -> new ArrayList<>()).add(impact);
        }
        Comparator<ImpactState> winnerOrder = Comparator
                .comparingDouble((ImpactState item) -> Math.abs(item.candidateDelta)).reversed()
                .thenComparing(Comparator
                        .comparingDouble((ImpactState item) -> item.confidenceFactor).reversed())
                .thenComparing(item -> stringValue(item.root, "id", ""));
        for (List<ImpactState> group : groups.values()) {
            group.sort(winnerOrder);
            group.get(0).dedupeStatus = "applied_unique";
            for (int index = 1; index < group.size(); index++) {
                ImpactState duplicate = group.get(index);
                duplicate.dedupeStatus = "suppressed_duplicate";
                duplicate.suppressionReason = "duplicate_effect";
            }
        }
    }

    private static void capRoots(List<ImpactState> impacts,
            Map<String, DimensionState> dimensions) {
        Map<JsonObject, List<ImpactState>> byRoot = new LinkedHashMap<>();
        for (ImpactState impact : impacts) {
            byRoot.computeIfAbsent(impact.root, ignored -> new ArrayList<>()).add(impact);
        }
        for (Map.Entry<JsonObject, List<ImpactState>> entry : byRoot.entrySet()) {
            List<ImpactState> rootImpacts = entry.getValue();
            double candidatePenalty = negativeOverall(rootImpacts, dimensions, false);
            double rootFactor = candidatePenalty > ROOT_NEGATIVE_OVERALL_CAP
                    ? ROOT_NEGATIVE_OVERALL_CAP / candidatePenalty
                    : 1.0;
            for (ImpactState impact : rootImpacts) {
                impact.rootCapFactor = impact.candidateDelta < 0 ? rootFactor : 1.0;
                impact.rootCappedDelta = "applied_unique".equals(impact.dedupeStatus)
                        ? impact.candidateDelta * impact.rootCapFactor
                        : 0;
            }
            JsonObject summary = new JsonObject();
            summary.addProperty("candidate_negative_overall", round2(candidatePenalty));
            summary.addProperty("root_cap", ROOT_NEGATIVE_OVERALL_CAP);
            summary.addProperty("root_cap_factor", round4(rootFactor));
            summary.addProperty("root_cap_applied", rootFactor < 0.99995);
            summary.addProperty("duplicate_suppressed_count", rootImpacts.stream()
                    .filter(item -> "suppressed_duplicate".equals(item.dedupeStatus)).count());
            entry.getKey().add("scoring_summary", summary);
        }
    }

    private static void capDimensions(List<ImpactState> impacts,
            Map<String, DimensionState> dimensions) {
        for (DimensionState dimension : dimensions.values()) {
            List<ImpactState> rows = impacts.stream()
                    .filter(item -> item.dimension == dimension)
                    .toList();
            double before = rows.stream().mapToDouble(item -> item.rootCappedDelta).sum();
            double negativeSum = rows.stream().mapToDouble(item -> Math.min(0, item.rootCappedDelta)).sum();
            double positiveSum = rows.stream().mapToDouble(item -> Math.max(0, item.rootCappedDelta)).sum();
            double negativeFactor = 1.0;
            double positiveFactor = 1.0;
            if (before < -DIMENSION_NEGATIVE_CAP && negativeSum < 0) {
                negativeFactor = clamp((-DIMENSION_NEGATIVE_CAP - positiveSum) / negativeSum, 0, 1);
            } else if (before > DIMENSION_POSITIVE_CAP && positiveSum > 0) {
                positiveFactor = clamp((DIMENSION_POSITIVE_CAP - negativeSum) / positiveSum, 0, 1);
            }
            for (ImpactState impact : rows) {
                impact.dimensionCapFactor = impact.rootCappedDelta < 0
                        ? negativeFactor
                        : impact.rootCappedDelta > 0 ? positiveFactor : 1.0;
                impact.dimensionCappedDelta = impact.rootCappedDelta * impact.dimensionCapFactor;
            }
            double after = rows.stream().mapToDouble(item -> item.dimensionCappedDelta).sum();
            dimension.beforeDimensionCap = before;
            dimension.afterDimensionCap = after;
            dimension.negativeDimensionFactor = negativeFactor;
            dimension.positiveDimensionFactor = positiveFactor;
        }
        for (ImpactState impact : impacts) {
            if (impact.dimension != null) continue;
            impact.dimensionCapFactor = 1.0;
            impact.dimensionCappedDelta = 0;
        }
    }

    private static double findOverallFactor(Map<String, DimensionState> dimensions,
            List<ImpactState> impacts, boolean negative, double target) {
        double low = 0;
        double high = 1;
        for (int index = 0; index < 64; index++) {
            double middle = (low + high) / 2.0;
            double adjustment = negative
                    ? adjustmentWithFactors(dimensions, impacts, middle, 1.0)
                    : adjustmentWithFactors(dimensions, impacts, 1.0, middle);
            if (negative) {
                if (adjustment < target) high = middle;
                else low = middle;
            } else {
                if (adjustment > target) high = middle;
                else low = middle;
            }
        }
        return (low + high) / 2.0;
    }

    private static double adjustmentWithFactors(Map<String, DimensionState> dimensions,
            List<ImpactState> impacts, double negativeFactor, double positiveFactor) {
        double weighted = 0;
        double weight = 0;
        for (DimensionState dimension : dimensions.values()) {
            if (!dimension.available) continue;
            double modifier = impacts.stream()
                    .filter(item -> item.dimension == dimension)
                    .mapToDouble(item -> item.dimensionCappedDelta
                            * (item.dimensionCappedDelta < 0 ? negativeFactor : positiveFactor))
                    .sum();
            double result = clamp(dimension.baseScore + modifier, 0, 100);
            weighted += (result - dimension.baseScore) * dimension.effectiveWeight;
            weight += dimension.effectiveWeight;
        }
        return weight > 0 ? weighted / weight : 0;
    }

    private static void finalizeDimensions(Map<String, DimensionState> dimensions,
            List<ImpactState> impacts) {
        Map<ImpactState, JsonObject> auditRows = new java.util.IdentityHashMap<>();
        for (ImpactState impact : impacts) {
            JsonObject row = impact.json();
            auditRows.put(impact, row);
            impact.root.getAsJsonArray("scoring_impacts").add(row);
        }
        for (DimensionState dimension : dimensions.values()) {
            JsonArray components = new JsonArray();
            for (ImpactState impact : impacts) {
                if (impact.dimension != dimension) continue;
                components.add(auditRows.get(impact).deepCopy());
            }
            dimension.row.add("scoring_components", components);
            if (!dimension.available) continue;

            double modifier = round2(impacts.stream()
                    .filter(item -> item.dimension == dimension)
                    .mapToDouble(item -> item.appliedDelta)
                    .sum());
            double finalScore = round2(clamp(dimension.baseScore + modifier, 0, 100));
            dimension.behaviorModifier = modifier;
            dimension.finalScore = finalScore;
            dimension.row.addProperty("behavior_modifier", modifier);
            dimension.row.addProperty("final_score", finalScore);
            dimension.row.addProperty("score", finalScore);
            dimension.row.addProperty("score_impact",
                    round2((finalScore - 50) * dimension.effectiveWeight / 100.0));
            dimension.row.addProperty("status", finalScore >= 75 ? "strength"
                    : finalScore >= 55 ? "stable" : "improve");

            JsonObject cap = new JsonObject();
            cap.addProperty("before_dimension_cap", round2(dimension.beforeDimensionCap));
            cap.addProperty("after_dimension_cap", round2(dimension.afterDimensionCap));
            cap.addProperty("negative_limit", -DIMENSION_NEGATIVE_CAP);
            cap.addProperty("positive_limit", DIMENSION_POSITIVE_CAP);
            cap.addProperty("negative_factor", round4(dimension.negativeDimensionFactor));
            cap.addProperty("positive_factor", round4(dimension.positiveDimensionFactor));
            cap.addProperty("applied", dimension.negativeDimensionFactor < 0.99995
                    || dimension.positiveDimensionFactor < 0.99995);
            dimension.row.add("modifier_cap", cap);

            JsonObject recomputation = new JsonObject();
            recomputation.addProperty("status", "included");
            recomputation.addProperty("included_in_overall", true);
            recomputation.addProperty("base_score", round2(dimension.baseScore));
            recomputation.addProperty("applied_modifier_sum", modifier);
            recomputation.addProperty("recomputed_final_score", finalScore);
            recomputation.addProperty("stored_final_score", finalScore);
            recomputation.addProperty("difference", 0);
            recomputation.addProperty("valid", true);
            addBaseComponentRecomputation(recomputation, dimension);
            dimension.row.add("recomputation", recomputation);
        }

        for (JsonElement rootElement : rootsOf(impacts)) {
            JsonObject root = rootElement.getAsJsonObject();
            JsonObject summary = object(root, "scoring_summary");
            List<ImpactState> rootImpacts = impacts.stream()
                    .filter(item -> item.root == root).toList();
            double appliedPenalty = 0;
            for (ImpactState impact : rootImpacts) {
                if (impact.appliedDelta >= 0 || impact.dimension == null) continue;
                appliedPenalty += -impact.appliedDelta * impact.dimension.effectiveWeight / 100.0;
            }
            summary.addProperty("applied_negative_overall", round2(appliedPenalty));
            summary.addProperty("applied_modifier_total", round2(rootImpacts.stream()
                    .mapToDouble(item -> item.appliedDelta).sum()));
        }
    }

    private static JsonArray rootsOf(List<ImpactState> impacts) {
        JsonArray result = new JsonArray();
        Set<JsonObject> seen = java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>());
        for (ImpactState impact : impacts) {
            if (seen.add(impact.root)) result.add(impact.root);
        }
        return result;
    }

    private static double weightedOverall(Map<String, DimensionState> dimensions, boolean finalScore) {
        double weighted = 0;
        double weight = 0;
        for (DimensionState dimension : dimensions.values()) {
            if (!dimension.available) continue;
            weighted += (finalScore ? dimension.finalScore : dimension.baseScore)
                    * dimension.effectiveWeight;
            weight += dimension.effectiveWeight;
        }
        return weight > 0 ? weighted / weight : 0;
    }

    private static double effectiveWeightTotal(Map<String, DimensionState> dimensions) {
        return dimensions.values().stream().filter(item -> item.available)
                .mapToDouble(item -> item.effectiveWeight).sum();
    }

    private static double negativeOverall(List<ImpactState> impacts,
            Map<String, DimensionState> dimensions, boolean applied) {
        double result = 0;
        for (ImpactState impact : impacts) {
            if (impact.dimension == null || !impact.dimension.available) continue;
            double value = applied ? impact.appliedDelta
                    : "applied_unique".equals(impact.dedupeStatus) ? impact.candidateDelta : 0;
            if (value >= 0) continue;
            result += -value * impact.dimension.effectiveWeight / 100.0;
        }
        return result;
    }

    private static String scorePath(JsonObject root, DimensionState dimension,
            double confidenceFactor, double responsibilityFactor) {
        String explicit = stringValue(root, "score_path", "");
        if (Set.of("embedded", "modifier", "context_only").contains(explicit)) {
            if ("modifier".equals(explicit)
                    && (dimension == null || !dimension.available
                    || confidenceFactor * 100 < MIN_MODIFIER_CONFIDENCE
                    || responsibilityFactor <= 0)) {
                return "context_only";
            }
            return explicit;
        }
        String category = stringValue(root, "category", "");
        if (EMBEDDED_CATEGORIES.contains(category)) return "embedded";
        if (dimension == null || !dimension.available) return "context_only";
        if (MODIFIER_CATEGORIES.contains(category)
                && confidenceFactor * 100 >= MIN_MODIFIER_CONFIDENCE
                && responsibilityFactor > 0) {
            return "modifier";
        }
        return "context_only";
    }

    private static String overlapReason(JsonObject root, DimensionState dimension,
            ImpactState impact) {
        if ("embedded".equals(impact.scorePath)) return "result_already_in_base_metric";
        if (dimension == null || !dimension.available) return "target_dimension_unavailable";
        if (impact.confidenceFactor * 100 < MIN_MODIFIER_CONFIDENCE) return "confidence_below_70";
        if (impact.responsibilityFactor <= 0) return "team_context_not_personal";
        if ("modifier".equals(impact.scorePath)) return "independent_behavior_context";
        return "behavior_not_enabled_for_modifier";
    }

    private static String suppressionReason(ImpactState impact) {
        if ("embedded".equals(impact.scorePath)) return "already_counted_in_base_score";
        if ("context_only".equals(impact.scorePath)) return impact.overlapReason;
        if (Math.abs(impact.candidateDelta) < 0.0001) return "zero_candidate_delta";
        return "";
    }

    private static Responsibility responsibility(JsonObject root) {
        String explicit = stringValue(root, "responsibility", "");
        if ("shared".equals(explicit)) return new Responsibility("shared", 0.5);
        if ("team_context".equals(explicit) || "unknown".equals(explicit)) {
            return new Responsibility(explicit, 0);
        }
        if ("personal".equals(explicit)) return new Responsibility("personal", 1);

        boolean shared = false;
        boolean teamOnly = false;
        JsonArray consequences = array(root, "consequences");
        if (consequences != null) {
            for (JsonElement element : consequences) {
                if (!element.isJsonObject()) continue;
                JsonObject consequence = element.getAsJsonObject();
                String attribution = stringValue(consequence, "attribution", "");
                if ("support_shared_responsibility".equals(attribution)) shared = true;
                if ("team_context_only".equals(attribution)
                        || consequence.has("personal_penalty_applied")
                        && !booleanValue(consequence, "personal_penalty_applied", true)) {
                    teamOnly = true;
                }
            }
        }
        if (teamOnly && !shared) return new Responsibility("team_context", 0);
        if (shared) return new Responsibility("shared", 0.5);
        return new Responsibility("personal", 1);
    }

    private static String dedupeKey(JsonObject root, String dimension) {
        String explicit = stringValue(root, "dedupe_key", "");
        if (!explicit.isBlank()) return dimension + "|" + explicit;

        List<String> consequenceIds = new ArrayList<>();
        JsonArray consequences = array(root, "consequences");
        if (consequences != null) {
            for (JsonElement element : consequences) {
                if (!element.isJsonObject()) continue;
                String id = stringValue(element.getAsJsonObject(), "id", "");
                if (!id.isBlank()) consequenceIds.add(id);
            }
        }
        if (!consequenceIds.isEmpty()) {
            consequenceIds.sort(String::compareTo);
            return dimension + "|consequence:" + String.join(",", consequenceIds);
        }

        List<String> refs = strings(array(root, "evidence_refs"));
        if (!refs.isEmpty()) {
            refs.sort(String::compareTo);
            return dimension + "|evidence:" + String.join(",", refs);
        }
        return dimension + "|root:" + stringValue(root, "id", "unknown");
    }

    private static JsonObject pathCounts(List<ImpactState> impacts) {
        JsonObject result = new JsonObject();
        for (String path : List.of("embedded", "modifier", "context_only")) {
            result.addProperty(path, impacts.stream()
                    .filter(item -> path.equals(item.scorePath)).count());
        }
        return result;
    }

    private static JsonObject rootCauseSummary(JsonObject scoreCard,
            List<ImpactState> impacts, JsonObject pathCounts, double behaviorModifier) {
        JsonObject existing = object(scoreCard, "root_cause_summary");
        JsonObject result = existing == null ? new JsonObject() : existing.deepCopy();
        result.addProperty("scoring_model", AUDIT_MODEL);
        result.addProperty("attribution_only", false);
        result.add("score_path_counts", pathCounts.deepCopy());
        result.addProperty("duplicate_suppressed_count", impacts.stream()
                .filter(item -> "suppressed_duplicate".equals(item.dedupeStatus)).count());
        result.addProperty("applied_modifier_count", impacts.stream()
                .filter(item -> Math.abs(item.appliedDelta) >= 0.005).count());
        result.addProperty("behavior_modifier", behaviorModifier);
        result.addProperty("per_root_overall_cap", ROOT_NEGATIVE_OVERALL_CAP);
        return result;
    }

    private static JsonObject attributionSummary(List<ImpactState> impacts, double finalOverall) {
        long negativeRoots = impacts.stream()
                .filter(item -> item.appliedDelta < -0.005)
                .map(item -> stringValue(item.root, "id", ""))
                .distinct().count();
        boolean lowScoreWithoutCriticism = finalOverall < 58 && negativeRoots == 0;
        JsonObject result = new JsonObject();
        result.addProperty("applied_negative_root_count", negativeRoots);
        result.addProperty("low_score_without_determinate_criticism", lowScoreWithoutCriticism);
        result.addProperty("explanation", lowScoreWithoutCriticism
                ? "综合分偏低来自基础比赛结果，但当前没有通过个人归责门槛的确定性批评。"
                : negativeRoots > 0
                        ? "行为修正只包含通过归责、去重和封顶的独立上下文。"
                        : "当前没有进入最终分的确定性负面行为修正。");
        return result;
    }

    private static String grade(JsonObject report, double finalScore, double availableWeight) {
        if (number(report, "role_confidence", 0) < 65 || availableWeight < 60) return "-";
        if (finalScore >= 88) return "S";
        if (finalScore >= 78) return "A";
        if (finalScore >= 68) return "B";
        if (finalScore >= 58) return "C";
        if (finalScore >= 45) return "D";
        return "E";
    }

    private static JsonObject comparison(String key) {
        JsonObject result = new JsonObject();
        switch (key) {
            case "lane_execution" -> {
                result.addProperty("type", "actual_lane_matchup");
                result.addProperty("label", "实际主要对位");
                result.addProperty("basis", "first_10_minutes_lane_matchup");
            }
            case "farm_efficiency" -> {
                result.addProperty("type", "enemy_same_position");
                result.addProperty("label", "敌方同位置");
                result.addProperty("basis", "role_counterpart_and_match_economy");
            }
            case "resource_decision" -> {
                result.addProperty("type", "self_opportunity_windows");
                result.addProperty("label", "自身机会窗口");
                result.addProperty("basis", "reviewable_route_and_lane_opportunities");
            }
            case "map_tempo" -> {
                result.addProperty("type", "role_and_team_share");
                result.addProperty("label", "同位置与团队职责占比");
                result.addProperty("basis", "role_counterpart_and_team_activity_share");
            }
            case "combat_output" -> {
                result.addProperty("type", "role_target_and_counterpart");
                result.addProperty("label", "位置目标与敌方同位置");
                result.addProperty("basis", "team_role_share_and_role_counterpart");
            }
            case "combat_duty" -> {
                result.addProperty("type", "position_duty_target");
                result.addProperty("label", "位置职责目标");
                result.addProperty("basis", "hard_gated_fight_responsibility");
            }
            case "survival_risk" -> {
                result.addProperty("type", "role_risk_baseline");
                result.addProperty("label", "同位置风险与自身时长");
                result.addProperty("basis", "role_counterpart_death_and_downtime");
            }
            case "objective_conversion" -> {
                result.addProperty("type", "team_objective_windows");
                result.addProperty("label", "团队目标窗口");
                result.addProperty("basis", "objective_participation_and_conversion");
            }
            case "vision_team" -> {
                result.addProperty("type", "position_vision_target");
                result.addProperty("label", "位置视野职责");
                result.addProperty("basis", "role_specific_vision_and_team_value");
            }
            case "observable_execution" -> {
                result.addProperty("type", "self_observable_execution");
                result.addProperty("label", "自身可观察操作");
                result.addProperty("basis", "apm_control_and_observable_actions");
            }
            default -> {
                result.addProperty("type", "self_match_facts");
                result.addProperty("label", "本场自身事实");
                result.addProperty("basis", "available_match_metrics");
            }
        }
        return result;
    }

    private static List<String> strings(JsonArray values) {
        List<String> result = new ArrayList<>();
        if (values == null) return result;
        for (JsonElement value : values) {
            if (value == null || value.isJsonNull()) continue;
            try {
                String text = value.getAsString();
                if (!text.isBlank() && !result.contains(text)) result.add(text);
            } catch (RuntimeException ignored) {
                // Non-scalar evidence references are ignored.
            }
        }
        return result;
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

    private static double number(JsonObject object, String key, double fallback) {
        if (object == null) return fallback;
        return number(object.get(key), fallback);
    }

    private static boolean finiteNumber(JsonObject object, String key) {
        if (object == null) return false;
        JsonElement value = object.get(key);
        if (value == null || value.isJsonNull()) return false;
        try {
            return Double.isFinite(value.getAsDouble());
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private static boolean explicitNull(JsonObject object, String key) {
        return object != null && object.has(key) && object.get(key).isJsonNull();
    }

    private static double number(JsonElement value) {
        return number(value, 0);
    }

    private static double number(JsonElement value, double fallback) {
        if (value == null || value.isJsonNull()) return fallback;
        try {
            double result = value.getAsDouble();
            return Double.isFinite(result) ? result : fallback;
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static double clamp(double value, double minimum, double maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    private static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private static double round4(double value) {
        return Math.round(value * 10000.0) / 10000.0;
    }

    private static final class DimensionState {
        private final JsonObject row;
        private final String key;
        private final boolean available;
        private final double roleWeight;
        private final double baseScore;
        private final boolean currentAtomicModel;
        private final boolean sourceScoreValid;
        private double effectiveWeight;
        private double behaviorModifier;
        private double finalScore;
        private boolean atomicComponentsPresent;
        private boolean aggregateFallback;
        private boolean baseComponentValid;
        private Double baseComponentRecomputedScore;
        private double baseComponentWeightSum;
        private double beforeDimensionCap;
        private double afterDimensionCap;
        private double negativeDimensionFactor = 1;
        private double positiveDimensionFactor = 1;

        private DimensionState(JsonObject row, String key, boolean available,
                double roleWeight, double baseScore, boolean currentAtomicModel,
                boolean sourceScoreValid) {
            this.row = row;
            this.key = key;
            this.available = available;
            this.roleWeight = roleWeight;
            this.baseScore = baseScore;
            this.currentAtomicModel = currentAtomicModel;
            this.sourceScoreValid = sourceScoreValid;
            this.finalScore = baseScore;
        }
    }

    private static final class ImpactState {
        private final JsonObject root;
        private final DimensionState dimension;
        private final String dimensionKey;
        private final double rawDelta;
        private String scorePath;
        private String overlapReason;
        private String responsibility;
        private String dedupeKey;
        private String dedupeStatus;
        private String suppressionReason;
        private double confidenceFactor;
        private double responsibilityFactor;
        private double overlapFactor;
        private double candidateDelta;
        private double rootCapFactor = 1;
        private double rootCappedDelta;
        private double dimensionCapFactor = 1;
        private double dimensionCappedDelta;
        private double overallCapFactor = 1;
        private double appliedDelta;

        private ImpactState(JsonObject root, DimensionState dimension,
                String dimensionKey, double rawDelta) {
            this.root = root;
            this.dimension = dimension;
            this.dimensionKey = dimensionKey;
            this.rawDelta = rawDelta;
        }

        private JsonObject json() {
            JsonObject result = new JsonObject();
            result.addProperty("root_cause_id", stringValue(root, "id", ""));
            result.addProperty("dimension", dimensionKey);
            result.addProperty("raw_delta", round2(rawDelta));
            result.addProperty("score_path", scorePath);
            result.addProperty("overlap_reason", overlapReason);
            result.addProperty("confidence_factor", round4(confidenceFactor));
            result.addProperty("responsibility", responsibility);
            result.addProperty("responsibility_factor", round4(responsibilityFactor));
            result.addProperty("overlap_factor", round4(overlapFactor));
            result.addProperty("candidate_delta", round2(candidateDelta));
            result.addProperty("dedupe_key", dedupeKey);
            result.addProperty("dedupe_status", dedupeStatus);
            result.addProperty("root_cap_factor", round4(rootCapFactor));
            result.addProperty("root_capped_delta", round2(rootCappedDelta));
            result.addProperty("dimension_cap_factor", round4(dimensionCapFactor));
            result.addProperty("dimension_capped_delta", round2(dimensionCappedDelta));
            result.addProperty("overall_cap_factor", round4(overallCapFactor));
            result.addProperty("applied_delta", round2(appliedDelta));
            result.addProperty("suppression_reason", suppressionReason);
            result.addProperty("title", stringValue(root, "title", "行为根因"));
            result.addProperty("kind", stringValue(root, "kind", "improvement"));
            result.addProperty("category", stringValue(root, "category", ""));
            result.addProperty("confidence", number(root, "confidence", 0));
            result.addProperty("time_start", number(root, "time_start", 0));
            result.addProperty("time_end", number(root, "time_end", 0));
            result.addProperty("location", stringValue(root, "location", ""));
            JsonArray refs = array(root, "evidence_refs");
            result.add("evidence_refs", refs == null ? new JsonArray() : refs.deepCopy());
            JsonObject jump = object(root, "jump_target");
            if (jump != null) result.add("jump_target", jump.deepCopy());
            return result;
        }
    }

    private record Responsibility(String name, double factor) {
    }
}
