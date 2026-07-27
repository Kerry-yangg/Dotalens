import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { HERO_META } from "../../hero-meta.js";
import { renderPlayerScoreAtomicAudit } from "../../player-score-atomic-audit.js";
import {
  activeTaskFromHistory,
  buildSimplePlayerReport,
  combatVisionStatus,
  countPlayerLaneWaves,
  createMatchCache,
  coverageImpactFor,
  formatCountdownSeconds,
  matchHistoryGuidance,
  normalizeMatchCache,
  normalizeMatchSubject,
  normalizePlayerReportInsightOccurrences,
  normalizePlayerReportJumpTarget,
  normalizePlayerStoryVerdict,
  normalizeTaskHistory,
  ordinaryPlayerReportInsightEligible,
  patchCoverageImpact,
  patchResolutionLabel,
  playerReportUpgradeState,
  recomputePlayerReportBaseComponents,
  recomputePlayerReportScoreAudit,
  resolvePlayerReportReviewNavigation,
  resolveMatchListFailure,
  resourceClockPatchLabel,
  selectOrdinaryPlayerReportContent,
  selectedPlayerIndex,
  simplifyPlayerReportText,
  upsertTaskHistory,
} from "../../app-core.js";

function atomicReportFixture() {
  const baseComponents = [
    {
      key: "lane_model_score",
      label: "对线模型结果",
      available: true,
      normalized_score: 80,
      local_weight: 75,
      effective_local_weight: 75,
      weighted_contribution: 60,
      confidence: 90,
      comparison: {},
      raw_metrics: {},
      evidence_refs: ["laning.slot.0"],
    },
    {
      key: "core_lane_opportunity_conversion",
      label: "核心对线资源转化",
      available: true,
      normalized_score: 40,
      local_weight: 25,
      effective_local_weight: 25,
      weighted_contribution: 10,
      confidence: 90,
      comparison: {},
      raw_metrics: {},
      evidence_refs: ["players.slot.0.lane_opportunity_summary"],
    },
  ];
  const dimension = {
    key: "lane_execution",
    available: true,
    weight: 100,
    effective_weight: 100,
    base_score: 70,
    behavior_modifier: 0,
    final_score: 70,
    score: 70,
    base_components: baseComponents,
    scoring_components: [],
  };
  return {
    model: "player-report/4.0",
    base_component_model: "player-report-base-components/1.0",
    root_causes: [],
    score_card: {
      model: "player-report/4.0",
      base_score: 70,
      behavior_modifier: 0,
      final_score: 70,
      dimensions: [dimension],
      audit: { recomputation_tolerance: 0.05 },
    },
  };
}

test("match subject never falls back to the first Replay player", () => {
  const match = {
    players: [
      { player_slot: 0, account_id: 111 },
      { player_slot: 128, account_id: 222 },
    ],
  };

  const unresolved = normalizeMatchSubject(match, 999);
  assert.equal(unresolved.status, "manual_required");
  assert.equal(selectedPlayerIndex(match.players, unresolved), -1);

  const matched = normalizeMatchSubject(match, 222);
  assert.equal(matched.status, "matched");
  assert.equal(matched.selected_player_slot, 128);
  assert.equal(selectedPlayerIndex(match.players, matched), 1);
});

test("null persisted subject slot stays unresolved instead of selecting slot zero", () => {
  const match = {
    subject: {
      schema: "match-subject/1.0",
      status: "matched",
      selected_player_slot: null,
    },
    players: [
      { player_slot: 0, account_id: 111 },
      { player_slot: 128, account_id: 222 },
    ],
  };

  const subject = normalizeMatchSubject(match, 999);
  assert.equal(subject.status, "manual_required");
  assert.equal(subject.selected_player_slot, null);
  assert.equal(selectedPlayerIndex(match.players, match.subject), -1);
});

test("persisted manual subject selection is authoritative", () => {
  const match = {
    subject: {
      schema: "match-subject/1.0",
      status: "manual_selected",
      source: "manual",
      selected_player_slot: 128,
      selected_account_id: 222,
    },
    players: [
      { player_slot: 0, account_id: 111 },
      { player_slot: 128, account_id: 222 },
    ],
  };

  const subject = normalizeMatchSubject(match, 111);
  assert.equal(subject.status, "manual_selected");
  assert.equal(selectedPlayerIndex(match.players, subject), 1);
});

test("Patch provenance labels distinguish confirmed inferred and unknown values", () => {
  assert.equal(patchResolutionLabel({ status: "exact", patch_name: "7.41d" }), "7.41d · 已确认");
  assert.equal(patchResolutionLabel({ status: "inferred", patch_name: "7.41d" }), "7.41d · 按录像时间推断");
  assert.equal(patchResolutionLabel({ status: "ambiguous" }), "Patch 边界不确定");
  assert.equal(patchResolutionLabel({ status: "unknown" }), "Patch 未识别");
});

test("Patch coverage explains which conclusions are suppressed by unresolved provenance", () => {
  const unknown = patchCoverageImpact({
    patch_resolution: {
      status: "unknown",
      confidence: 0,
      gates: {
        map_profile: false,
        ability_metadata: false,
        negative_scoring: false,
      },
    },
  });

  assert.equal(unknown.status, "missing");
  assert.match(unknown.suppressed, /负面职责评分/);
  assert.match(unknown.limited, /地图|技能/);

  assert.equal(patchCoverageImpact({
    patch_resolution: {
      status: "exact",
      patch_name: "7.41d",
      confidence: 1,
      gates: {
        map_profile: true,
        ability_metadata: true,
        negative_scoring: true,
      },
    },
  }), null);
});

test("private Immortal Draft history points participants to local Replay import", () => {
  const guidance = matchHistoryGuidance({
    code: "private_match_history",
    likely_immortal_draft: true,
    leaderboard_rank: 3646,
  });

  assert.equal(guidance.kind, "private");
  assert.match(guidance.title, /公开 API/);
  assert.match(guidance.detail, /8500\+/);
  assert.match(guidance.detail, /参赛者/);
  assert.equal(guidance.canImportReplay, true);
});

test("Replay import is wired to the local parser instead of a simulated queue", () => {
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");

  assert.match(app, /\/replays\/\$\{matchId\}\/import/);
  assert.match(app, /Content-Type": "application\/octet-stream"/);
  assert.doesNotMatch(app, /Replay 已加入队列/);
  assert.doesNotMatch(app, /没有发现新的本地 Replay", "scan-search"\);\s*\}, 800/);
});

test("resource countdown never exposes floating point residue", () => {
  assert.equal(formatCountdownSeconds(10.835000000000036), "11 秒");
  assert.equal(formatCountdownSeconds(0.001), "1 秒");
  assert.equal(formatCountdownSeconds(-2), "0 秒");
  assert.equal(formatCountdownSeconds("invalid"), "0 秒");
});

test("resource clock distinguishes replay patch from rules baseline", () => {
  assert.equal(resourceClockPatchLabel("7.41", "7.41d"), "Replay 7.41 · 规则基线 7.41d");
  assert.equal(resourceClockPatchLabel("7.41d", "7.41d"), "7.41d 资源时钟");
  assert.equal(resourceClockPatchLabel("", ""), "资源时钟");
});

test("combat vision wording separates nearby wards from battlefield coverage", () => {
  assert.equal(combatVisionStatus({
    observer_coverage: false,
    sentry_coverage: true,
    nearby_observers: 2,
    nearby_sentries: 2,
  }), "附近有眼，主战场未覆盖 · 有反隐");
  assert.equal(combatVisionStatus({
    observer_coverage: false,
    sentry_coverage: false,
    nearby_observers: 0,
    nearby_sentries: 2,
  }), "仅有反隐，没有观察视野");
  assert.equal(combatVisionStatus({
    observer_coverage: true,
    sentry_coverage: false,
  }), "主战场有观察视野");
});

test("lane wave count only includes waves linked to the selected player", () => {
  const waves = [
    { last_hits_by_slot: { 0: 3 }, denies_by_slot: {}, observed_gold_by_slot: { 0: 120 } },
    { last_hits_by_slot: { 1: 2 }, denies_by_slot: { 0: 1 }, observed_gold_by_slot: {} },
    { last_hits_by_slot: { 1: 3 }, denies_by_slot: {}, observed_gold_by_slot: { 1: 120 } },
  ];
  assert.equal(countPlayerLaneWaves(waves, 0), 2);
  assert.equal(countPlayerLaneWaves(waves, 2), 0);
});

test("task history survives JSON round trips and restores active work", () => {
  const running = { id: "job-1", match_id: "100", status: "running", stage: "parsing" };
  const completed = { id: "job-2", match_id: "101", status: "completed", stage: "completed" };
  let history = upsertTaskHistory([], completed);
  history = upsertTaskHistory(history, running);
  const restored = normalizeTaskHistory(JSON.parse(JSON.stringify(history)));

  assert.equal(restored.length, 2);
  assert.equal(activeTaskFromHistory(restored).id, "job-1");
  history = upsertTaskHistory(restored, { ...running, status: "failed", stage: "failed" });
  assert.equal(activeTaskFromHistory(history), null);
});

test("offline match cache is account scoped", () => {
  const fixtureAccountId = "123456789";
  const cache = createMatchCache(fixtureAccountId, [{ match_id: 8909845275 }], "2026-07-24T00:00:00Z");
  assert.equal(normalizeMatchCache(cache, fixtureAccountId).matches.length, 1);
  assert.equal(normalizeMatchCache(cache, "999"), null);
  assert.equal(normalizeMatchCache({ ...cache, matches: [] }, fixtureAccountId), null);
});

test("OpenDota failures fall back to a valid account cache", () => {
  const fixtureAccountId = "123456789";
  const cache = createMatchCache(fixtureAccountId, [{ match_id: 8909845275 }], "2026-07-24T00:00:00Z");
  const fallback = resolveMatchListFailure(cache, fixtureAccountId, "OpenDota returned HTTP 521");
  const unavailable = resolveMatchListFailure(cache, "999", "OpenDota returned HTTP 521");

  assert.equal(fallback.status, "ready");
  assert.equal(fallback.offline, true);
  assert.equal(fallback.matches[0].match_id, 8909845275);
  assert.equal(fallback.error, "OpenDota returned HTTP 521");
  assert.equal(unavailable.status, "error");
  assert.equal(unavailable.offline, false);
});

test("coverage impact explains reliable, limited and suppressed conclusions", () => {
  const impact = coverageImpactFor("vision", {
    status: "available",
    confidence: 82,
    missing: ["exact_fog_of_war_mask"],
  });
  assert.equal(impact.label, "视野分析");
  assert.equal(impact.missing.length, 1);
  assert.match(impact.reliable, /眼位位置/);
  assert.match(impact.limited, /战争迷雾/);
  assert.match(impact.suppressed, /不会/);
});

test("ordinary player report keeps one clear action path", () => {
  const localized = (id) => ({
    id,
    ordinary_eligible: true,
    jump_target: {
      module: "combat",
      entity_type: "fight",
      entity_id: `fight-${id}`,
      player_slot: 0,
      time: 902,
      range_start: 892,
      range_end: 923,
      location_level: "L2",
      map_focus: { region: "roshan_pit" },
    },
  });
  const brief = {
    stories: [{ id: "s1" }, { id: "s2" }, { id: "s3" }, { id: "s4" }],
    strengths: [localized("good-1"), localized("good-2")],
    priorities: [localized("issue-1"), localized("issue-2")],
    training: [
      { id: "fallback", action: "通用训练", sourceInsights: [] },
      { id: "matched", action: "问题对应训练", sourceInsights: ["issue-1"] },
    ],
  };
  const selected = selectOrdinaryPlayerReportContent(brief);

  assert.deepEqual(selected.stories.map((story) => story.id), ["s1", "s2", "s3"]);
  assert.equal(selected.strength.id, "good-1");
  assert.equal(selected.priority.id, "issue-1");
  assert.equal(selected.training.id, "matched");
  assert.equal(brief.stories.length, 4);
});

test("simple report weights available dimensions and preserves domain thresholds", () => {
  const report = buildSimplePlayerReport({
    dimensions: [
      { key: "lane_execution", finalScore: 68, roleWeight: 2 },
      { key: "farm_efficiency", finalScore: 50, roleWeight: 1 },
      { key: "resource_decision", finalScore: 53, roleWeight: 1 },
      { key: "map_tempo", score: 52 },
      { key: "combat_output", finalScore: 51 },
      { key: "combat_duty", finalScore: 53 },
      { key: "survival_risk", available: false, finalScore: 100 },
    ],
  });

  assert.deepEqual(
    report.domains.map(({ key, score, status }) => ({ key, score, status })),
    [
      { key: "lane", score: 68, status: "good" },
      { key: "farm", score: 51.5, status: "improve" },
      { key: "tempo", score: 52, status: "stable" },
      { key: "combat", score: 52, status: "stable" },
      { key: "vision", score: null, status: "insufficient" },
      { key: "execution", score: null, status: "insufficient" },
    ],
  );
});

test("player report localization normalizes a bounded map review target", () => {
  const target = normalizePlayerReportJumpTarget({
    module: "combat",
    entity_type: "fight",
    entity_id: "fight-42",
    player_slot: 0,
    time: 902,
    range_start: 892,
    range_end: 923,
    location_level: "L3",
    map_focus: {
      coordinate_valid: true,
      x: 56.5,
      y: 45,
      region: "roshan_pit",
      coordinate_space: "map_percent",
    },
  });

  assert.equal(target.module, "combat");
  assert.equal(target.entityType, "fight");
  assert.equal(target.entityId, "fight-42");
  assert.equal(target.time, 902);
  assert.equal(target.rangeStart, 892);
  assert.equal(target.rangeEnd, 923);
  assert.equal(target.locationLevel, "L3");
  assert.equal(target.mapFocus.x, 56.5);
  assert.equal(target.mapFocus.coordinateSpace, "map_percent");
  assert.equal(target.reviewable, true);
});

test("player report localization rejects null coordinates instead of coercing them to zero", () => {
  const target = normalizePlayerReportJumpTarget({
    module: "combat",
    entity_type: "fight",
    entity_id: "fight-null-coordinate",
    time: 902,
    range_start: 892,
    range_end: 923,
    map_focus: {
      coordinate_valid: true,
      x: null,
      y: null,
      region: "",
    },
  });

  assert.equal(target.mapFocus.coordinateValid, false);
  assert.equal(target.locationLevel, "L1");
  assert.equal(target.reviewable, false);
});

test("ordinary report skips aggregate and malformed conclusions", () => {
  const aggregate = {
    id: "aggregate",
    ordinary_eligible: false,
    jump_target: {
      module: "players",
      time: 0,
      range_start: 0,
      range_end: 0,
      location_level: "L0",
    },
  };
  const malformed = {
    id: "malformed",
    ordinary_eligible: true,
    jump_target: {
      module: "combat",
      entity_type: "fight",
      entity_id: "fight-bad",
      time: 400,
      range_start: 390,
      range_end: 410,
      location_level: "L3",
      map_focus: { coordinate_valid: true, x: 180, y: 45 },
    },
  };
  const reviewable = {
    id: "reviewable",
    ordinary_eligible: true,
    jump_target: {
      module: "farm",
      entity_type: "farm_diagnostic",
      entity_id: "farm-12",
      time: 1200,
      range_start: 1190,
      range_end: 1235,
      location_level: "L2",
      map_focus: { region: "bottom_lane" },
    },
  };

  assert.equal(ordinaryPlayerReportInsightEligible(aggregate), false);
  assert.equal(ordinaryPlayerReportInsightEligible(malformed), false);
  assert.equal(ordinaryPlayerReportInsightEligible(reviewable), true);

  const selected = selectOrdinaryPlayerReportContent({
    strengths: [aggregate, reviewable],
    priorities: [malformed, reviewable],
    training: [],
  });
  assert.equal(selected.strength.id, "reviewable");
  assert.equal(selected.priority.id, "reviewable");
});

test("ordinary report normalizes every reviewable combat timing occurrence", () => {
  const occurrences = normalizePlayerReportInsightOccurrences([
    {
      id: "fight-fact-1",
      fight_id: "fight-1",
      time: 940,
      region: "mid_lane",
      label: "15:40 中路 +9秒",
      arrival_delta_seconds: 9,
      missed_first_rotation: true,
      join_feasibility: "reachable",
      jump_target: {
        module: "combat",
        entity_type: "fight",
        entity_id: "fight-1",
        time: 940,
        range_start: 930,
        range_end: 964,
        map_focus: {
          coordinate_valid: true,
          x: 51.5,
          y: 49.2,
          region: "mid_lane",
          coordinate_space: "map_percent",
        },
      },
    },
    {
      id: "fight-fact-2",
      fight_id: "fight-2",
      time: 1018,
      region: "radiant_jungle",
      label: "16:58 天辉野区 +11秒",
      arrival_delta_seconds: 11,
      missed_first_rotation: true,
      join_feasibility: "reachable",
      jump_target: {
        module: "combat",
        entity_type: "fight",
        entity_id: "fight-2",
        time: 1018,
        range_start: 1008,
        range_end: 1042,
        map_focus: { region: "radiant_jungle" },
      },
    },
    {
      id: "malformed",
      time: 1200,
      jump_target: {
        module: "combat",
        entity_type: "fight",
        entity_id: "fight-bad",
        time: 1200,
        range_start: 1210,
        range_end: 1200,
      },
    },
  ]);

  assert.equal(occurrences.length, 2);
  assert.deepEqual(
    occurrences.map((occurrence) => occurrence.fightId),
    ["fight-1", "fight-2"],
  );
  assert.equal(occurrences[0].arrivalDeltaSeconds, 9);
  assert.equal(occurrences[0].missedFirstRotation, true);
  assert.equal(occurrences[0].joinFeasibility, "reachable");
  assert.equal(occurrences[0].jumpTarget.locationLevel, "L3");
  assert.equal(occurrences[1].jumpTarget.locationLevel, "L2");
  assert.equal(occurrences.every((occurrence) => occurrence.jumpTarget.reviewable), true);
});

test("ordinary player report cards expose concrete Replay review actions", () => {
  const appSource = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const start = appSource.indexOf("function renderSimplePlayerReport(model)");
  const end = appSource.indexOf("function renderPlayerScoreLane", start);
  const briefRenderer = appSource.slice(start, end);

  assert.match(briefRenderer, /查看这一波/);
  assert.match(briefRenderer, /data-player-score-review=/);
  assert.match(briefRenderer, /data-player-score-review-occurrence=/);
  assert.match(briefRenderer, /presentSimpleInsight/);
  assert.doesNotMatch(briefRenderer, />查看片段</);
  assert.doesNotMatch(briefRenderer, /查看评分依据/);
  assert.match(appSource, /function reviewPlayerScoreInsight\(/);
  assert.match(appSource, /reviewPlayerScoreInsight\(review\.dataset\.playerScoreReview\)/);
});

test("deep player report exposes occurrence-level combat timing evidence", () => {
  const appSource = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const start = appSource.indexOf("function renderPlayerScoreCombat(model)");
  const end = appSource.indexOf("function renderPlayerScoreVision", start);
  const combatRenderer = appSource.slice(start, end);

  assert.match(combatRenderer, /战斗时机/);
  assert.match(combatRenderer, /队伍接触/);
  assert.match(combatRenderer, /你的到场/);
  assert.match(combatRenderer, /首次行动/);
  assert.match(combatRenderer, /首轮交战/);
  assert.match(combatRenderer, /到场条件/);
  assert.match(combatRenderer, /suppressed_reasons/);
});

test("player report v4 exposes recomputable overall and dimension score drilldowns", () => {
  const appSource = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const headerStart = appSource.indexOf("function renderPlayerScoreHeader(model)");
  const headerEnd = appSource.indexOf("function renderPlayerScoreRoster", headerStart);
  const evidenceStart = appSource.indexOf("function renderPlayerScoreEvidence(model)");
  const evidenceEnd = appSource.indexOf("function renderPlayerScoreContent(model)", evidenceStart);
  const header = appSource.slice(headerStart, headerEnd);
  const evidence = appSource.slice(evidenceStart, evidenceEnd);

  assert.match(appSource, /recomputePlayerReportScoreAudit/);
  assert.match(header, /data-player-score-evidence-type="score-audit"/);
  assert.match(header, /综合分/);
  assert.match(evidence, /type === "score-audit"/);
  assert.match(evidence, /基础综合分/);
  assert.match(evidence, /行为修正/);
  assert.match(evidence, /最终综合分/);
  assert.match(evidence, /本地重算/);
  assert.match(evidence, /基础分/);
  assert.match(evidence, /实际应用/);
  assert.match(evidence, /已计入基础分/);
  assert.match(evidence, /仅作上下文/);
  assert.match(evidence, /同结果已去重/);
});

test("player score evidence uses the atomic presentation boundary and responsive grid", () => {
  const appSource = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const stylesSource = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  const evidenceStart = appSource.indexOf("function renderPlayerScoreEvidence(model)");
  const evidenceEnd = appSource.indexOf("function renderPlayerScoreContent(model)", evidenceStart);
  const evidence = appSource.slice(evidenceStart, evidenceEnd);

  assert.match(appSource, /from "\.\/player-score-atomic-audit\.js"/);
  assert.match(evidence, /renderPlayerScoreAtomicAudit/);
  assert.match(
    stylesSource,
    /\.player-score-base-component\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(72px,\s*1fr\)\)/s,
  );
  assert.match(stylesSource, /\.player-score-base-component\s+\.identity\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(stylesSource, /\.player-score-base-component-reason\s*\{[^}]*white-space:\s*normal/s);
  assert.match(
    stylesSource,
    /@supports\s*\(container-type:\s*inline-size\)[\s\S]*@container\s*\(min-width:\s*430px\)[\s\S]*grid-template-columns:\s*minmax\(180px,\s*1fr\)\s+repeat\(3,\s*minmax\(72px,\s*92px\)\)/,
  );
  assert.match(
    stylesSource,
    /@media\s*\(min-width:\s*1440px\)[\s\S]*\.player-score-workspace\s*\{[^}]*minmax\(440px,\s*460px\)[^}]*\}[\s\S]*\.player-score-workspace\.brief-reading\s+\.player-score-evidence-panel\s*\{[^}]*width:\s*460px/s,
  );
});

test("player report review navigation selects the target entity and preroll", () => {
  assert.deepEqual(resolvePlayerReportReviewNavigation({
    module: "combat",
    entityType: "fight",
    entityId: "fight-4",
    time: 605,
    rangeStart: 595,
    rangeEnd: 630,
    locationLevel: "L2",
    mapFocus: { region: "roshan_pit" },
  }), {
    view: "combat",
    selectedStateKey: "selectedCombatId",
    selectedId: "fight-4",
    developmentSideView: null,
    seekTime: 595,
    rangeStart: 595,
    rangeEnd: 630,
    mapFocus: {
      coordinateValid: false,
      x: null,
      y: null,
      region: "roshan_pit",
      coordinateSpace: "",
      coordinateSource: "",
      coordinateVersion: "",
      locationConfidence: 0,
    },
    returnContext: {},
  });

  const farm = resolvePlayerReportReviewNavigation({
    module: "farm",
    entity_type: "route_window",
    entity_id: "farm-9",
    time: 1200,
    range_start: 1190,
    range_end: 1235,
    location_level: "L2",
    map_focus: { region: "bottom_lane" },
  });
  assert.equal(farm.view, "farm");
  assert.equal(farm.selectedStateKey, "selectedFarmDiagnosticId");
  assert.equal(farm.selectedId, "farm-9");

  const ward = resolvePlayerReportReviewNavigation({
    module: "vision",
    entityType: "ward",
    entityId: "ward-7",
    time: 840,
    rangeStart: 830,
    rangeEnd: 900,
    locationLevel: "L2",
    mapFocus: { region: "radiant_jungle" },
  });
  assert.equal(ward.view, "vision");
  assert.equal(ward.selectedStateKey, "selectedWardId");

  const lane = resolvePlayerReportReviewNavigation({
    module: "development",
    entityType: "lane_checkpoint",
    entityId: "lane:0:600",
    time: 600,
    rangeStart: 580,
    rangeEnd: 620,
    locationLevel: "L2",
    mapFocus: { region: "bottom_lane" },
  });
  assert.equal(lane.view, "development");
  assert.equal(lane.developmentSideView, "lane");
  assert.equal(lane.selectedStateKey, null);

  assert.equal(resolvePlayerReportReviewNavigation({
    entityType: "death",
    time: 820,
  }).view, "combat");

  assert.equal(resolvePlayerReportReviewNavigation({
    entityType: "teleport",
    time: 600,
  }).view, "map");
});

test("player report Replay review bar owns a bounded playback window", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../../app.js", import.meta.url), "utf8");

  assert.match(html, /id="player-report-review-bar"/);
  assert.match(html, /data-player-report-review-play/);
  assert.match(html, /data-player-report-review-return/);
  assert.match(appSource, /playerReportReviewWindow/);
  assert.match(appSource, /rangeEnd/);
  assert.match(appSource, /renderPlayerReportReviewBar/);
});

test("ordinary player report copy hides internal model language", () => {
  const text = simplifyPlayerReportText(
    "V3 结构化报告通过职责硬门禁 3 场，已归属伤害来自聚合事实；高置信度路线复核 0 个，对线模型与对线置信度可用。",
  );

  assert.doesNotMatch(text, /V3|结构化|硬门禁|归属伤害|聚合事实|高置信度|路线门禁|对线模型|对线置信度/);
  assert.match(text, /比赛简报/);
  assert.match(text, /3 场具备完整的职责判断条件/);
  assert.match(text, /记录伤害/);
  assert.match(text, /没有发现需要优先复盘的路线窗口/);
  assert.match(text, /对线评分与数据可信度/);
});

test("major lane verdict stays consistent while player report modules load", () => {
  assert.equal(normalizePlayerStoryVerdict("major_advantage", "even"), "major_advantage");
  assert.equal(normalizePlayerStoryVerdict("major_disadvantage", "even"), "major_disadvantage");
  assert.equal(normalizePlayerStoryVerdict("unknown", "even"), "even");
});

test("a current player report is not marked stale by unrelated analysis metadata", () => {
  assert.deepEqual(playerReportUpgradeState(null), {
    hasReport: false,
    legacy: false,
    missingCombatTiming: false,
    missingScoringAudit: false,
    needsUpgrade: true,
  });
  assert.deepEqual(playerReportUpgradeState({
    model: "player-report/4.0",
    combat_timing: { model: "player-combat-timing/1.0" },
    score_card: { audit: { model: "player-report-score-audit/1.0" } },
  }), {
    hasReport: true,
    legacy: false,
    missingCombatTiming: false,
    missingScoringAudit: false,
    needsUpgrade: false,
  });
  assert.deepEqual(playerReportUpgradeState({ model: "player-report/4.0" }), {
    hasReport: true,
    legacy: false,
    missingCombatTiming: true,
    missingScoringAudit: true,
    needsUpgrade: true,
  });
  assert.equal(playerReportUpgradeState({ model: "player-report/3.0" }).legacy, true);
  assert.equal(playerReportUpgradeState({ model: "player-report/1.1" }).needsUpgrade, true);
});

test("player report v4 score audit recomputes dimensions and both overall scores", () => {
  const report = {
    model: "player-report/4.0",
    score_card: {
      model: "player-report/4.0",
      base_score: 64,
      behavior_modifier: -3.2,
      final_score: 60.8,
      overall_score: 60.8,
      audit: {
        model: "player-report-score-audit/1.0",
        recomputation_tolerance: 0.05,
      },
      dimensions: [
        {
          key: "lane_execution",
          available: true,
          effective_weight: 60,
          base_score: 60,
          behavior_modifier: 0,
          final_score: 60,
          scoring_components: [
            { score_path: "embedded", applied_delta: 0, dedupe_status: "not_applicable" },
            { score_path: "context_only", applied_delta: 0, dedupe_status: "not_applicable" },
          ],
        },
        {
          key: "combat_duty",
          available: true,
          effective_weight: 40,
          base_score: 70,
          behavior_modifier: -8,
          final_score: 62,
          scoring_components: [{
            score_path: "modifier",
            applied_delta: -8,
            dedupe_key: "combat_duty|evidence:combat:fight-7:0",
            dedupe_status: "applied_unique",
          }],
        },
        {
          key: "vision_team",
          available: false,
          effective_weight: 0,
        },
      ],
    },
  };

  const audit = recomputePlayerReportScoreAudit(report);

  assert.equal(audit.supported, true);
  assert.equal(audit.valid, true);
  assert.equal(audit.recomputedBaseScore, 64);
  assert.equal(audit.recomputedFinalScore, 60.8);
  assert.equal(audit.recomputedBehaviorModifier, -3.2);
  assert.equal(audit.rows.find((row) => row.key === "combat_duty").componentModifier, -8);
  assert.equal(audit.rows.find((row) => row.key === "combat_duty").valid, true);
  assert.deepEqual(audit.pathCounts, {
    embedded: 1,
    modifier: 1,
    context_only: 1,
  });
  assert.equal(audit.appliedDedupeKeys.length, 1);
});

test("player report v4 score audit rejects a stored value that cannot be recomputed", () => {
  const report = {
    model: "player-report/4.0",
    score_card: {
      base_score: 70,
      behavior_modifier: -4,
      final_score: 66,
      dimensions: [{
        key: "combat_duty",
        available: true,
        effective_weight: 100,
        base_score: 70,
        behavior_modifier: -4,
        final_score: 68,
        scoring_components: [{
          score_path: "modifier",
          applied_delta: -4,
          dedupe_key: "fight-one",
          dedupe_status: "applied_unique",
        }],
      }],
    },
  };

  const audit = recomputePlayerReportScoreAudit(report);

  assert.equal(audit.valid, false);
  assert.equal(audit.recomputedFinalScore, 66);
  assert.equal(audit.recomputedBehaviorModifier, -4);
  assert.equal(audit.rows[0].valid, false);
  assert.ok(audit.rows[0].issues.includes("dimension_final_mismatch"));
  assert.ok(audit.issues.includes("dimension_recomputation_failed"));
});

test("player report v4 score audit rejects non-modifier applied deltas", () => {
  const report = {
    model: "player-report/4.0",
    score_card: {
      base_score: 70,
      behavior_modifier: -5,
      final_score: 65,
      dimensions: [{
        key: "combat_duty",
        available: true,
        effective_weight: 100,
        base_score: 70,
        behavior_modifier: -5,
        final_score: 65,
        scoring_components: [{
          score_path: "embedded",
          applied_delta: -5,
          dedupe_key: "already-in-base",
          dedupe_status: "not_applicable",
        }],
      }],
    },
  };

  const audit = recomputePlayerReportScoreAudit(report);

  assert.equal(audit.valid, false);
  assert.equal(audit.rows[0].componentModifier, 0);
  assert.equal(audit.rows[0].recomputedFinalScore, 70);
  assert.ok(audit.issues.includes("non_modifier_applied_delta"));
});

test("player report v4 score audit caps server-provided recomputation tolerance", () => {
  const report = {
    model: "player-report/4.0",
    score_card: {
      base_score: 70,
      behavior_modifier: -2,
      final_score: 68,
      audit: {
        recomputation_tolerance: 100,
      },
      dimensions: [{
        key: "combat_duty",
        available: true,
        effective_weight: 100,
        base_score: 70,
        behavior_modifier: -4,
        final_score: 68,
        scoring_components: [{
          score_path: "modifier",
          applied_delta: -4,
          dedupe_key: "fight-one",
          dedupe_status: "applied_unique",
        }],
      }],
    },
  };

  const audit = recomputePlayerReportScoreAudit(report);

  assert.equal(audit.tolerance, 0.05);
  assert.equal(audit.valid, false);
  assert.equal(audit.recomputedFinalScore, 66);
});

test("recomputePlayerReportBaseComponents renormalizes available weights", () => {
  const audit = recomputePlayerReportBaseComponents([
    {
      key: "relative_gpm",
      available: true,
      normalized_score: 80,
      local_weight: 60,
      effective_local_weight: 100,
      weighted_contribution: 80,
      confidence: 90,
    },
    {
      key: "relative_xpm",
      available: false,
      normalized_score: null,
      local_weight: 40,
      effective_local_weight: 0,
      weighted_contribution: null,
      confidence: 0,
      missing_reason: "counterpart_or_subject_xpm_missing",
    },
  ]);

  assert.equal(audit.valid, true);
  assert.equal(audit.recomputedScore, 80);
  assert.equal(audit.rows[0].recomputedEffectiveWeight, 100);
});

test("recomputePlayerReportBaseComponents reports stable atomic component audit keys", () => {
  const audit = recomputePlayerReportBaseComponents([
    {
      key: "duplicate",
      available: true,
      normalized_score: 80,
      local_weight: 50,
      effective_local_weight: 60,
      weighted_contribution: 99,
      confidence: 90,
    },
    {
      key: "duplicate",
      available: true,
      normalized_score: "not-a-number",
      local_weight: Number.POSITIVE_INFINITY,
      effective_local_weight: 40,
      weighted_contribution: 1,
      confidence: 90,
    },
  ]);

  assert.equal(audit.valid, false);
  assert.ok(audit.issues.includes("base_component_duplicate_key"));
  assert.ok(audit.issues.includes("base_component_malformed"));
  assert.ok(audit.rows[0].issues.includes("base_component_weight_mismatch"));
  assert.ok(audit.rows[0].issues.includes("base_component_contribution_mismatch"));
});

test("recomputePlayerReportBaseComponents rejects non-finite persisted atomic values", () => {
  const audit = recomputePlayerReportBaseComponents([{
    key: "relative_gpm",
    available: true,
    normalized_score: 80,
    local_weight: 100,
    effective_local_weight: Number.POSITIVE_INFINITY,
    weighted_contribution: 80,
    confidence: 90,
  }]);

  assert.equal(audit.valid, false);
  assert.ok(audit.issues.includes("base_component_malformed"));
});

test("recomputePlayerReportBaseComponents rejects non-number atomic fields", () => {
  const validComponent = () => ({
    key: "relative_gpm",
    available: true,
    normalized_score: 80,
    local_weight: 100,
    effective_local_weight: 100,
    weighted_contribution: 80,
    confidence: 90,
  });
  for (const field of [
    "normalized_score",
    "confidence",
    "local_weight",
    "effective_local_weight",
    "weighted_contribution",
  ]) {
    for (const value of [true, {}]) {
      const audit = recomputePlayerReportBaseComponents([{
        ...validComponent(),
        [field]: value,
      }]);

      assert.equal(audit.valid, false, `${field}=${String(value)} must be rejected`);
      assert.ok(audit.issues.includes("base_component_malformed"));
    }
  }
});

test("recomputePlayerReportBaseComponents rejects out-of-range atomic semantics", () => {
  const validComponent = () => ({
    key: "relative_gpm",
    available: true,
    normalized_score: 80,
    local_weight: 100,
    effective_local_weight: 100,
    weighted_contribution: 80,
    confidence: 90,
  });
  const cases = [
    ["normalized_score", 1000],
    ["normalized_score", -1],
    ["confidence", 999],
    ["confidence", -1],
    ["effective_local_weight", 101],
    ["effective_local_weight", -1],
    ["weighted_contribution", 101],
    ["weighted_contribution", -1],
  ];

  for (const [field, value] of cases) {
    const audit = recomputePlayerReportBaseComponents([{
      ...validComponent(),
      [field]: value,
    }]);

    assert.equal(audit.valid, false, `${field}=${value} must be rejected`);
    assert.ok(audit.issues.includes("base_component_malformed"));
    assert.equal(audit.rows[0].valid, false);
  }
});

test("recomputePlayerReportBaseComponents rejects unavailable persisted score data", () => {
  const unavailable = {
    key: "relative_xpm",
    available: false,
    normalized_score: null,
    local_weight: 100,
    effective_local_weight: 0,
    weighted_contribution: null,
    confidence: 0,
    missing_reason: "counterpart_or_subject_xpm_missing",
  };
  const cases = [
    ["effective_local_weight", 1],
    ["effective_local_weight", -1],
    ["weighted_contribution", 0],
    ["weighted_contribution", 1],
  ];

  for (const [field, value] of cases) {
    const audit = recomputePlayerReportBaseComponents([{
      ...unavailable,
      [field]: value,
    }]);

    assert.equal(audit.valid, false, `${field}=${value} must be rejected`);
    assert.ok(audit.issues.includes("base_component_malformed"));
    assert.equal(audit.rows[0].valid, false);
  }
});

test("player score atomic audit exposes an importable presentation boundary", () => {
  assert.equal(typeof renderPlayerScoreAtomicAudit, "function");
});

test("player score atomic presentation pairs audit rows by key and escapes report text", () => {
  const components = [
    {
      key: "zero",
      label: "<img src=x onerror=alert(1)>",
      available: true,
      normalized_score: 0,
      local_weight: 100,
      effective_local_weight: 100,
      weighted_contribution: 0,
      confidence: 0,
      comparison: { subject: 0, reference: 0, unit: "<script>unit</script>" },
      missing_reason: null,
      suppression_reason: null,
    },
    {
      key: "suppressed",
      label: "职责门禁组件",
      available: false,
      normalized_score: null,
      local_weight: 20,
      effective_local_weight: 0,
      weighted_contribution: null,
      confidence: 50,
      comparison: {},
      missing_reason: null,
      suppression_reason: "gate<script>alert(2)</script>",
    },
    {
      key: "missing",
      label: "数据缺失组件",
      available: false,
      normalized_score: null,
      local_weight: 20,
      effective_local_weight: 0,
      weighted_contribution: null,
      confidence: 25,
      comparison: {},
      missing_reason: "missing<script>alert(4)</script>",
      suppression_reason: null,
    },
  ];
  const scoreAudit = {
    available: true,
    valid: false,
    baseScore: 0,
    storedModifier: 2,
    componentModifier: 0,
    storedFinalScore: 2,
    recomputedFinalScore: 0,
    issues: ["dimension_modifier_mismatch", "unknown<script>alert(3)</script>"],
    baseComponentAudit: {
      supported: true,
      valid: true,
      recomputedScore: 0,
      issues: [],
      rows: [
        {
          key: "missing",
          available: false,
          storedEffectiveWeight: 0,
          storedContribution: null,
          issues: [],
          valid: true,
        },
        {
          key: "suppressed",
          available: false,
          storedEffectiveWeight: 0,
          storedContribution: null,
          issues: [],
          valid: true,
        },
        {
          key: "zero",
          available: true,
          storedEffectiveWeight: 100,
          storedContribution: 0,
          issues: [],
          valid: true,
        },
      ],
    },
  };

  const presentation = renderPlayerScoreAtomicAudit({ components, scoreAudit });

  assert.deepEqual(
    presentation.rows.map((row) => row.key),
    ["zero", "suppressed", "missing"],
  );
  assert.equal(presentation.rows[0].tone, "valid");
  assert.equal(presentation.rows[0].scoreText, "0.00");
  assert.equal(presentation.rows[0].effectiveWeightText, "100.00%");
  assert.equal(presentation.rows[0].contributionText, "0.00");
  assert.equal(presentation.rows[0].confidenceText, "0%");
  assert.equal(presentation.rows[1].tone, "unavailable");
  assert.equal(presentation.rows[1].scoreText, "未计分");
  assert.equal(presentation.rows[1].effectiveWeightText, "--");
  assert.equal(presentation.rows[1].contributionText, "--");
  assert.equal(presentation.rows[2].tone, "unavailable");
  assert.equal(presentation.rows[2].scoreText, "未计分");
  assert.match(presentation.componentsHtml, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(presentation.componentsHtml, /&lt;script&gt;unit&lt;\/script&gt;/);
  assert.match(presentation.componentsHtml, /gate&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
  assert.match(presentation.componentsHtml, /missing&lt;script&gt;alert\(4\)&lt;\/script&gt;/);
  assert.doesNotMatch(presentation.componentsHtml, /<img|<script>/);
  assert.match(presentation.chainHtml, /unknown&lt;script&gt;alert\(3\)&lt;\/script&gt;/);
  assert.doesNotMatch(presentation.chainHtml, /<script>/);
});

test("player score atomic presentation separates base-score and dimension-chain state", () => {
  const component = {
    key: "base",
    label: "基础组件",
    available: true,
    normalized_score: 70,
    local_weight: 100,
    effective_local_weight: 100,
    weighted_contribution: 70,
    confidence: 90,
    comparison: {},
    missing_reason: null,
    suppression_reason: null,
  };
  const baseComponentAudit = {
    supported: true,
    valid: true,
    recomputedScore: 70,
    issues: [],
    rows: [{
      key: "base",
      available: true,
      storedEffectiveWeight: 100,
      storedContribution: 70,
      issues: [],
      valid: true,
    }],
  };
  const scoreAudit = {
    available: true,
    valid: false,
    baseScore: 70.04,
    storedModifier: 3,
    componentModifier: 1,
    storedFinalScore: 73.04,
    recomputedFinalScore: 71.04,
    issues: [
      "dimension_modifier_mismatch",
      "dimension_final_mismatch",
      "dimension_score_alias_mismatch",
    ],
    baseComponentAudit,
  };

  const inTolerance = renderPlayerScoreAtomicAudit({
    components: [component],
    scoreAudit,
  });
  const outsideTolerance = renderPlayerScoreAtomicAudit({
    components: [component],
    scoreAudit: { ...scoreAudit, baseScore: 70.06 },
  });

  assert.equal(inTolerance.base.state, "一致");
  assert.equal(inTolerance.base.tone, "valid");
  assert.equal(inTolerance.chain.state, "不同");
  assert.equal(inTolerance.chain.tone, "invalid");
  assert.match(inTolerance.chainHtml, /行为修正与计分路径合计不同/);
  assert.match(inTolerance.chainHtml, /最终分与本地重算不同/);
  assert.equal(outsideTolerance.base.state, "不同");
  assert.equal(outsideTolerance.base.tone, "invalid");
  assert.equal(outsideTolerance.base.toleranceText, "±0.05");
});

test("player score atomic presentation hides semantically invalid finite metrics", () => {
  const component = {
    key: "tampered",
    label: "篡改组件",
    available: true,
    normalized_score: 1000,
    local_weight: 100,
    effective_local_weight: 100,
    weighted_contribution: 100,
    confidence: 999,
    comparison: { subject: 1, reference: 1, unit: "score" },
    missing_reason: null,
    suppression_reason: null,
  };
  const baseComponentAudit = recomputePlayerReportBaseComponents([component]);
  const presentation = renderPlayerScoreAtomicAudit({
    components: [component],
    scoreAudit: {
      available: true,
      valid: false,
      baseScore: 100,
      storedModifier: 0,
      componentModifier: 0,
      storedFinalScore: 100,
      recomputedFinalScore: 100,
      issues: ["base_component_malformed"],
      baseComponentAudit,
    },
  });

  assert.equal(baseComponentAudit.valid, false);
  assert.equal(presentation.rows[0].tone, "invalid");
  assert.equal(presentation.rows[0].scoreText, "未计分");
  assert.equal(presentation.rows[0].effectiveWeightText, "--");
  assert.equal(presentation.rows[0].contributionText, "--");
  assert.equal(presentation.rows[0].confidenceText, "--");
  assert.match(presentation.componentsHtml, /原子组件字段缺失或格式错误/);
  assert.doesNotMatch(presentation.componentsHtml, /1000\.00|999%/);
});

test("recomputePlayerReportBaseComponents matches Java 206-row weight reconciliation", () => {
  const components = [
    ...Array.from({ length: 206 }, (_, index) => ({
      key: `small_${index}`,
      available: true,
      normalized_score: 50,
      local_weight: 0.480051,
      effective_local_weight: 0.4801,
      weighted_contribution: 0.24,
      confidence: 90,
    })),
    {
      key: "large",
      available: true,
      normalized_score: 50,
      local_weight: 1.109494,
      effective_local_weight: 1.0994,
      weighted_contribution: 0.56,
      confidence: 90,
    },
  ];

  const audit = recomputePlayerReportBaseComponents(components);

  assert.equal(audit.valid, true);
  assert.equal(audit.recomputedScore, 50);
  assert.equal(audit.weightSum, 100);
  assert.equal(audit.rows[0].recomputedEffectiveWeight, 0.4801);
  assert.equal(audit.rows[0].recomputedContribution, 0.24);
  assert.equal(audit.rows.at(-1).recomputedEffectiveWeight, 1.0994);
  assert.equal(audit.rows.at(-1).recomputedContribution, 0.56);
});

test("recomputePlayerReportBaseComponents matches Java 3001-row contribution reconciliation", () => {
  const components = [
    ...Array.from({ length: 3000 }, (_, index) => ({
      key: `tiny_${index}`,
      available: true,
      normalized_score: 50,
      local_weight: 0.033251,
      effective_local_weight: 0.0333,
      weighted_contribution: 0.0166,
      confidence: 90,
    })),
    {
      key: "remainder",
      available: true,
      normalized_score: 50,
      local_weight: 0.247,
      effective_local_weight: 0.1,
      weighted_contribution: 0.2,
      confidence: 90,
    },
  ];

  const audit = recomputePlayerReportBaseComponents(components);

  assert.equal(audit.valid, true);
  assert.equal(audit.recomputedScore, 50);
  assert.equal(audit.weightSum, 100);
  assert.equal(audit.rows[0].recomputedEffectiveWeight, 0.0333);
  assert.equal(audit.rows[0].recomputedContribution, 0.0166);
  assert.equal(audit.rows.at(-1).recomputedEffectiveWeight, 0.1);
  assert.equal(audit.rows.at(-1).recomputedContribution, 0.2);
});

test("recomputePlayerReportBaseComponents normalizes Number.MAX_VALUE weights", () => {
  const audit = recomputePlayerReportBaseComponents([
    {
      key: "max_a",
      available: true,
      normalized_score: 50,
      local_weight: Number.MAX_VALUE,
      effective_local_weight: 50,
      weighted_contribution: 25,
      confidence: 90,
    },
    {
      key: "max_b",
      available: true,
      normalized_score: 50,
      local_weight: Number.MAX_VALUE,
      effective_local_weight: 50,
      weighted_contribution: 25,
      confidence: 90,
    },
  ]);

  assert.equal(audit.valid, true);
  assert.equal(audit.recomputedScore, 50);
  assert.equal(audit.weightSum, 100);
  assert.equal(audit.rows[0].recomputedEffectiveWeight, 50);
  assert.equal(audit.rows[0].recomputedContribution, 25);
  assert.equal(audit.rows[1].recomputedEffectiveWeight, 50);
  assert.equal(audit.rows[1].recomputedContribution, 25);
});

test("recomputePlayerReportBaseComponents matches Java half-boundary reconciliation", () => {
  const components = Array.from({ length: 1000 }, (_, index) => ({
    key: `half_${index}`,
    available: true,
    normalized_score: 0.04999999999999999,
    local_weight: 1,
    effective_local_weight: 0.1,
    weighted_contribution: index === 999 ? 0.05 : 0,
    confidence: 90,
  }));

  const audit = recomputePlayerReportBaseComponents(components);

  assert.equal(audit.valid, true);
  assert.equal(audit.recomputedScore, 0.05);
  assert.equal(audit.weightSum, 100);
  assert.equal(audit.rows[0].recomputedEffectiveWeight, 0.1);
  assert.equal(audit.rows[0].recomputedContribution, 0);
  assert.equal(audit.rows.at(-1).recomputedEffectiveWeight, 0.1);
  assert.equal(audit.rows.at(-1).recomputedContribution, 0.05);
});

test("atomic base-score validation retains its fixed tolerance", () => {
  const report = atomicReportFixture();
  report.score_card.audit.recomputation_tolerance = 0.001;
  report.score_card.dimensions[0].base_score = 70.04;
  report.score_card.dimensions[0].final_score = 70.04;
  report.score_card.dimensions[0].score = 70.04;
  report.score_card.base_score = 70.04;
  report.score_card.final_score = 70.04;

  const audit = recomputePlayerReportScoreAudit(report);

  assert.equal(audit.valid, true);
  assert.ok(!audit.rows[0].issues.includes("base_component_score_mismatch"));
});

test("atomic base-score validation rejects values beyond its fixed tolerance", () => {
  const report = atomicReportFixture();
  report.score_card.audit.recomputation_tolerance = 0.001;
  report.score_card.dimensions[0].base_score = 70.06;
  report.score_card.dimensions[0].final_score = 70.06;
  report.score_card.dimensions[0].score = 70.06;
  report.score_card.base_score = 70.06;
  report.score_card.final_score = 70.06;

  const audit = recomputePlayerReportScoreAudit(report);

  assert.equal(audit.valid, false);
  assert.ok(audit.rows[0].issues.includes("base_component_score_mismatch"));
});

test("player report audit rejects tampered atomic contributions", () => {
  const report = atomicReportFixture();
  report.score_card.dimensions[0].base_components[0].weighted_contribution = 99;

  const audit = recomputePlayerReportScoreAudit(report);

  assert.equal(audit.valid, false);
  assert.ok(audit.rows[0].issues.includes("base_component_contribution_mismatch"));
});

test("current atomic reports reject existing_dimension_model", () => {
  const report = atomicReportFixture();
  report.score_card.dimensions[0].base_components[0].key =
    "existing_dimension_model";

  const audit = recomputePlayerReportScoreAudit(report);

  assert.ok(audit.issues.includes("aggregate_component_in_current_report"));
});

test("current atomic reports reject malformed components in unavailable dimensions", () => {
  const report = atomicReportFixture();
  report.score_card.dimensions.push({
    key: "vision_team",
    available: false,
    effective_weight: 0,
    base_components: [],
    scoring_components: [],
  });

  const audit = recomputePlayerReportScoreAudit(report);

  assert.equal(audit.valid, false);
  assert.equal(audit.rows[1].valid, false);
  assert.ok(audit.rows[1].issues.includes("base_component_malformed"));
});

test("every known hero has a bundled local portrait and a non-missing fallback", () => {
  for (const [heroId, [token]] of Object.entries(HERO_META)) {
    assert.equal(
      existsSync(new URL(`../../public/assets/heroes/${token}.png`, import.meta.url)),
      true,
      `missing portrait for hero ${heroId}: ${token}`,
    );
  }
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  assert.match(app, /HERO_FALLBACK_IMAGE/);
  assert.doesNotMatch(app, /heroImage\("unknown"\).*\/assets\/heroes\/unknown/s);
});

test("settings markup contains only implemented controls", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");

  assert.doesNotMatch(html, /data-settings-content="data"/);
  assert.match(html, /data-settings-content="display"/);
  assert.doesNotMatch(html, /默认分析英雄/);
  assert.doesNotMatch(html, /自动扫描 Replay/);
  assert.doesNotMatch(app, /设置已保存/);
  assert.match(html, /id="settings-export-diagnostics"/);
});

test("visible copy does not restore hardcoded patch or misleading ward and wave labels", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");

  assert.doesNotMatch(html, />\s*7\.41d 资源时钟\s*</);
  assert.doesNotMatch(app, /无眼覆盖/);
  assert.doesNotMatch(app, /378 波/);
  assert.match(app, /本人关联/);
});

test("first screen uses selective libraries and defers hidden analysis views", () => {
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const applyStart = app.indexOf("function applyAnalysisToProduct");
  const applyEnd = app.indexOf("async function loadAnalysis", applyStart);
  const applyBody = app.slice(applyStart, applyEnd);
  const initStart = app.indexOf("async function init");
  const initPreviewStart = app.indexOf("if (PREVIEW_VIEW)", initStart);
  const initialBootBody = app.slice(initStart, initPreviewStart);

  assert.doesNotMatch(app, /import \* as echarts/);
  assert.doesNotMatch(app, /createIcons,\s*icons/);
  assert.match(app, /import\("\.\/chart-runtime\.js"\)/);
  assert.match(app, /development:\s*\["snapshots"\]/);
  assert.doesNotMatch(applyBody, /renderWardAnalysis|renderFarmAnalysis|renderCombat|renderPlayerScore/);
  assert.doesNotMatch(initialBootBody, /renderWardAnalysis|renderFarmAnalysis|renderCombat|renderPlayerScore/);
});

test("player report lazy loading uses a loading state and isolates optional module failures", () => {
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const renderStart = app.indexOf("function renderPlayerScore()");
  const renderEnd = app.indexOf("function syncPlayerScoreTime", renderStart);
  const ensureStart = app.indexOf("async function ensureAnalysisModulesForView");
  const ensureEnd = app.indexOf("function setDetailView", ensureStart);

  assert.match(app.slice(renderStart, renderEnd), /playerScoreReportIsPending\(\)[\s\S]*renderPlayerScoreLoading\(\)/);
  assert.match(app, /Promise\.allSettled/);
  assert.match(app.slice(ensureStart, ensureEnd), /\[\["players"\], missing\.filter/);
  assert.match(app.slice(ensureStart, ensureEnd), /failures\.push\(\.\.\.result\.failures\)/);
  assert.doesNotMatch(app, /model\.legacy \|\| state\.currentAnalysis\?\.upgrade_required/);
});

test("missing combat timing capability offers an explicit analysis upgrade", () => {
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");

  assert.match(app, /model\.missingCombatTiming/);
  assert.match(app, /当前报告尚无战斗时机分析/);
  assert.match(app, /data-player-score-reparse/);
});

test("responsive expanded sidebar keeps the app workspace in the second grid track", () => {
  const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

  assert.match(styles, /\.app-main\s*\{[^}]*grid-column:\s*2;/s);
});
