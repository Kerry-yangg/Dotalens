# Combat Timing Behavior Diagnostics Design

**Status:** Decision B approved; design pending final review  
**Scope:** Player report combat-timing diagnostics  
**Target:** Dota Lens 0.5.0

## 1. Problem

The current player report can locate a generic combat-duty conclusion, but it cannot explain a repeated behavior such as:

> 15:40 后你连续两次晚于队友到达中路冲突，第一轮关键技能已经结束才进场。  
> 下一局在跳刀完成后的五分钟内，优先跟随先手队友活动。

This is not a rendering problem. The Parser currently:

- scores one fight at a time;
- treats the first damage, heal, control, death involvement, or item/ability event as arrival;
- measures `arrivalDelay` against the combat segment start rather than allied engagement;
- does not distinguish local arrival from long-range or global actions;
- does not aggregate repeated behavior across fights;
- does not connect fights to a key-item activation window;
- produces role-level generic copy instead of an evidence-backed behavior diagnosis.

Real Replay `8894766243` confirms the gap. `fight-25` reports `presencePct=0` and `arrivalDelay=0` because an early remote damage event masks the player's spatial absence.

## 2. Approaches Considered

### 2.1 Enrich the current template

Use existing `arrivalDelay`, fight score, and purchase time to generate more detailed sentences.

**Advantage:** Small implementation.  
**Rejected:** It would turn unreliable fields into confident criticism and could fabricate the causal chain.

### 2.2 Deterministic evidence engine

Build per-fight timing facts from snapshots, combat phases, local actions, roles, TP state, and purchases. Aggregate those facts into repeated patterns or single critical-event findings.

**Advantage:** Explainable, testable, Replay-local, and compatible with current jump targets.  
**Decision:** Use this approach for 0.5.0.

### 2.3 Sequence machine-learning model

Train a temporal model over player positions, actions, items, and fight outcomes.

**Advantage:** May capture hero-specific patterns after enough labeled data exists.  
**Deferred:** The project does not yet have a reliable labeled corpus, and model output would be harder to audit.

## 3. Product Decision

Use rule **B**:

- repeated behavior patterns have the highest priority;
- a single severe event may enter the ordinary report only when it concerns a critical fight or objective and passes stricter evidence gates;
- ordinary routine fights cannot create a definite criticism from one occurrence;
- deep mode may show lower-priority factual observations without turning them into criticism.

No new top-level Tab is added. The feature appears in:

- ordinary player report: one concrete primary problem or strength;
- deep analysis: a new `战斗时机` subsection with occurrence-level evidence;
- combat page: the existing selected-fight view and bounded Replay playback.

## 4. Architecture

### 4.1 `PlayerCombatTimingAnalysis`

Add a focused Parser component that consumes:

- `modules.combat.fights`;
- `modules.snapshots.by_slot`;
- `modules.build.by_slot`;
- `modules.timeline`;
- player role and role confidence;
- fight classification, phases, events, location, importance, and outcome.

It produces:

```json
{
  "model": "player-combat-timing/1.0",
  "coverage": {},
  "fight_facts": [],
  "patterns": []
}
```

`PlayerReportAnalysis` invokes it before `PlayerReportNarrativeV3`. The narrative layer may only describe facts emitted by this component.

### 4.2 Fact layer

Each eligible fight produces one player timing fact:

```json
{
  "id": "combat-timing:fight-25:5",
  "fight_id": "fight-25",
  "player_slot": 5,
  "kind": "teamfight",
  "time": 947,
  "location": "mid_lane",
  "team_engage_time": 947,
  "player_spatial_arrival_time": 956,
  "first_meaningful_action_time": 960,
  "arrival_delta_seconds": 9,
  "first_rotation_end": 954,
  "missed_first_rotation": true,
  "join_feasibility": "reachable",
  "expected_arrival_seconds": 7,
  "actual_arrival_seconds": 9,
  "role_expectation": "follow_initiation",
  "outcome": "lost_exchange",
  "confidence": 87,
  "evidence_refs": [],
  "jump_target": {}
}
```

Facts remain available to deep mode even when they fail ordinary-report gates.

### 4.3 Pattern layer

The first implementation supports:

1. `late_arrival_sequence`
2. `premature_initiation_sequence`
3. `missed_first_rotation_sequence`
4. `key_item_activation_gap`
5. `on_time_follow_up_sequence`

A pattern contains:

```json
{
  "id": "pattern:late-arrival:5:947",
  "kind": "improvement",
  "pattern_type": "late_arrival_sequence",
  "title": "连续两次晚于队友进入冲突",
  "what_happened": "15:47 和 18:04 的两次中路冲突中，你分别晚于队伍接触 9 秒和 11 秒到场。",
  "why_it_matters": "两次到场都晚于第一轮交战窗口，队伍的先手和第一轮控制无法得到及时衔接。",
  "result": "两次冲突均在你完成首次有效行动前出现队友减员或关键技能进入冷却。",
  "next_action": "跳刀完成后的五分钟内，优先保持在先手队友一次移动或一次 TP 可跟进的范围。",
  "confidence": 87,
  "occurrence_ids": [
    "combat-timing:fight-25:5",
    "combat-timing:fight-29:5"
  ],
  "item_context": {
    "key": "blink",
    "purchase_time": 1431,
    "window_start": 1431,
    "window_end": 1731
  },
  "dimension_impacts": [],
  "evidence_refs": [],
  "jump_target": {}
}
```

The sentence must be assembled from structured facts. It must never be generated by guessing missing values.

## 5. Timing Definitions

### 5.1 Eligible fights

Timing judgments use:

- `pickoff`, `skirmish`, and `teamfight`;
- classification confidence at least 75;
- reliable contact and phase boundaries;
- reliable player and fight coordinates;
- role confidence at least 65.

`harass` and `lane_trade` cannot create a combat-timing criticism.

### 5.2 Team engagement time

`team_engage_time` is the earliest second where either:

- two allied heroes are locally involved and an opponent interaction occurs; or
- one assigned initiator creates a confirmed disable or high-commitment initiation and another ally can follow within three seconds.

It is not the review-window start and not the first unrelated item-use event.

### 5.3 Spatial arrival

`player_spatial_arrival_time` is the first second where the player:

- is alive;
- is inside the dynamic local battle radius;
- remains inside for at least two of the next three samples, or performs a local meaningful action while inside.

The radius is based on the fight's calibrated scatter radius and phase center, with bounded minimum and maximum values.

Long-range or global damage, healing, and spells do not establish spatial arrival by themselves.

### 5.4 First meaningful action

Meaningful actions include:

- hero damage from a local ability or attack;
- control;
- save, dispel, or meaningful heal;
- role-relevant item use;
- initiation or counter-initiation.

Tread switching, ward-dispenser toggles, self-only recovery, and unrelated inventory events do not count.

### 5.5 First rotation

Use the observed `initiation` phase end when phase confidence is sufficient.

The stronger wording `第一轮关键技能已经结束` requires all of:

- at least two allied role-relevant ability or control events before player arrival;
- player arrival after `first_rotation_end`;
- evidence that those actions entered cooldown or their control/effect window ended.

When cooldown evidence is incomplete, use the conservative wording `第一轮交战窗口已经结束`.

## 6. Join-Feasibility Gate

No negative judgment is allowed unless the player had a reasonable opportunity to join.

Suppress or downgrade when:

- the player was dead or respawning;
- snapshots are missing for more than 20% of the review window;
- coordinates or Patch transformation are unresolved;
- the fight began too quickly for the player to arrive by movement or an available TP;
- the player's role was not expected to join that routine fight;
- the player was already committed to a higher-value confirmed objective;
- the fight classification or main battlefield is uncertain.

Role thresholds:

| Position | Repeated-pattern late threshold | Routine-fight expectation |
| --- | ---: | --- |
| 1 | 8 seconds | Only after join feasibility, item readiness, and fight value pass |
| 2 | 5 seconds | Expected for nearby tempo and objective fights |
| 3 | 5 seconds | Expected when initiation or frontline responsibility applies |
| 4 | 4 seconds | Expected for reachable skirmishes and teamfights |
| 5 | 4 seconds | Expected for reachable defensive and objective fights |

These thresholds are starting rules and must be regression-tested before release.

## 7. Pattern Admission

### 7.1 Repeated behavior

A repeated problem enters ordinary mode when:

- at least two comparable eligible fights contain the same issue;
- the occurrences are consecutive in the filtered comparable-fight sequence, or occur within ten minutes with no confirmed on-time occurrence between them;
- each occurrence passes join feasibility;
- aggregate confidence is at least 78;
- at least one occurrence has a meaningful adverse consequence.

The wording `连续两次` is allowed only when the occurrences are consecutive under this definition.

### 7.2 Single critical event

Under decision B, one occurrence may enter ordinary mode when:

- fight importance is `critical`, or it is a Roshan, high-ground, base-defense, or decisive tower fight;
- the player misses the first rotation or initiates without reachable follow-up;
- join feasibility is confirmed;
- an adverse consequence is observed;
- confidence is at least 85.

The report explicitly calls it `本场最关键的一次时机问题`, not a repeated habit.

## 8. Key-Item Context

Detect role-relevant activation items from actual purchase events:

- initiation/mobility: Blink and upgrades;
- survival commitment: BKB;
- save/positioning: Force Staff, Glimmer Cape, Lotus Orb;
- hero-specific items only when metadata supports their tactical role.

For Blink, evaluate the first five minutes and first three eligible fights after purchase.

Advice may name an item only when:

- the item was actually completed;
- the diagnosed occurrences fall inside its activation window, or the item should materially change join feasibility;
- the role template recognizes the item.

Otherwise use a role/state trigger instead of forcing `跳刀` into the sentence.

## 9. Report Output

### 9.1 Ordinary mode

The primary problem card shows:

- one pattern-level sentence;
- one consequence sentence;
- one next-match action;
- occurrence buttons such as `15:47 中路 +9秒` and `18:04 河道 +11秒`;
- `查看这一波` for the primary occurrence.

Each occurrence button opens its own fight and bounded playback window.

### 9.2 Deep mode

Add a `战斗时机` subsection:

| Fight | Team engage | Player arrival | Delta | First action | First rotation | Feasibility | Result |
| --- | --- | --- | ---: | --- | --- | --- | --- |

Technical evidence and suppressed judgments remain available here.

### 9.3 Copy rules

Allowed:

> 15:47 和 18:04 两次冲突中，你分别晚于队伍接触 9 秒和 11 秒到场；两次都错过第一轮交战窗口。

Not allowed:

> 你的地图意识不足，需要及时参团。

The report must state time, comparison, observed action window, consequence, and executable trigger.

## 10. Scoring and Root Causes

- The pattern is one root cause, even if it affects combat duty, map tempo, survival, or objectives.
- Cross-dimension deductions continue to use the existing cap.
- Repeated facts increase confidence and priority, not linearly multiply deductions.
- A single critical occurrence may carry higher severity but cannot be described as a habit.
- The generic `4号位职责完成不足` insight is replaced when a more specific timing pattern explains it.

## 11. Coverage and Error Handling

Add coverage fields:

```json
{
  "spatial_samples_pct": 96,
  "fight_phase_coverage_pct": 88,
  "local_action_coverage_pct": 91,
  "item_context_status": "available",
  "suppressed_reasons": []
}
```

The data-coverage page explains which conclusions were disabled:

- exact arrival unavailable;
- first-rotation conclusion unavailable;
- key-item activation conclusion unavailable;
- only aggregate combat facts remain.

## 12. Tests

### 12.1 Parser unit tests

1. Long-range damage does not mark spatial arrival.
2. A player entering the battle radius nine seconds after team engagement records `arrival_delta_seconds=9`.
3. Two consecutive late eligible fights create one repeated pattern.
4. One routine late fight does not enter ordinary mode.
5. One critical Roshan or high-ground late fight can enter under rule B.
6. A dead or unreachable player is not criticized.
7. A position 1 routine-fight absence is gated differently from a position 4 absence.
8. Arrival after initiation phase produces `missed_first_rotation`.
9. Strong key-skill wording requires action and cooldown evidence.
10. Blink advice appears only after a real Blink purchase and inside the activation window.
11. Every occurrence contains a valid fight jump target.
12. A more specific timing pattern replaces the generic combat-duty problem.

### 12.2 Frontend tests

1. Ordinary card renders pattern sentence and occurrence buttons.
2. Each occurrence selects its own fight and range.
3. Return restores the original report and selected pattern.
4. Deep mode renders the timing comparison table.
5. Suppressed findings cannot appear as definite criticism.

### 12.3 Real Replay regression

Use at least:

- one support with repeated late arrivals;
- one core correctly skipping routine fights;
- one initiator entering before teammates;
- one critical Roshan or high-ground single occurrence;
- one post-Blink activation window;
- one Replay with incomplete snapshots to verify suppression.

## 13. Acceptance Criteria

- Ordinary combat problems no longer default to generic role-duty wording when a specific timing cause exists.
- Every timing criticism includes an exact occurrence, team comparison, first-rotation result, consequence, and action.
- `连续两次` is never emitted without two qualifying consecutive occurrences.
- Single critical-event wording follows rule B and never calls one event a habit.
- Long-range actions cannot hide spatial lateness.
- All ordinary findings can jump to the exact fight and bounded Replay range.
- Missing evidence suppresses criticism rather than producing invented precision.

## 14. Deferred Work

- Learned temporal sequence models.
- Cross-match personal baselines and rank percentiles.
- Hero-specific tactical models without reliable Patch metadata.
- Voice-generated coaching summaries.
- Extending the same pattern engine to farm routing, ward timing, deaths, and objective conversion.
