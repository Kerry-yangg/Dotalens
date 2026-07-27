# Dota Lens 0.4.5 Trusted Local Replay Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make every locally imported Replay verify its internal match identity, resolve Patch provenance, and require an explicit per-match player subject before showing personal analysis.

**Architecture:** The local Parser owns a small `subject.json` sidecar and overlays it onto analysis responses; selecting another player never rebuilds Replay data. Replay metadata is resolved before `ProductAnalysis` construction so one Patch decision governs maps, abilities, coverage, and scoring. The frontend consumes that contract, blocks personal views while identity is unresolved, and removes all first-player fallbacks.

**Tech Stack:** Java 21, Gson, JUnit 5, `com.sun.net.httpserver`, Electron, vanilla ES modules, Node test runner, Vite.

## Global Constraints

- Preserve all unrelated and pre-existing dirty-worktree changes.
- Do not create task-level implementation commits because modified files already contain uncommitted user work.
- Use PowerShell 7 for every local script.
- Write a failing test and observe the expected failure before each production behavior change.
- `selected_player_slot` uses external Replay slots: Radiant `0-4`, Dire `128-132`.
- Account lookup identity and per-match analysis subject remain independent.
- A missing subject must never fall back to the first player.
- OpenDota failure must not block local Replay parsing.
- Patch-dependent negative conclusions are suppressed for `ambiguous` and `unknown` Patch states.
- User source Replay files are never renamed or deleted.
- No new analysis Tab is added.

---

## File Map

**Create**

- `tools/replay-parser/src/main/java/opendota/MatchSubjectStore.java`: reconcile, validate, atomically persist, and overlay match subjects.
- `tools/replay-parser/src/main/java/opendota/DotaPatchResolver.java`: resolve Patch provenance and gates from authoritative fields or Replay end time.
- `tools/replay-parser/src/main/java/opendota/ReplayIdentityException.java`: structured internal/declared match ID mismatch.
- `tools/replay-parser/src/main/resources/dota-patch-timeline.json`: versioned supported Patch release windows.
- `tools/replay-parser/src/test/java/opendota/MatchSubjectStoreTest.java`: subject persistence and invalidation tests.
- `tools/replay-parser/src/test/java/opendota/DotaPatchResolverTest.java`: exact, inferred, ambiguous, and unknown Patch tests.
- `tests/frontend/replay-subject.test.js`: frontend subject selection and static integration tests.

**Modify**

- `tools/replay-parser/src/main/java/opendota/ReplayMatchMetadata.java`: expose internal match ID and Replay end time.
- `tools/replay-parser/src/main/java/opendota/AnalysisSummary.java`: pre-resolve Replay metadata/Patch and add subject/patch contracts.
- `tools/replay-parser/src/main/java/opendota/ReplayJobManager.java`: subject API, mismatch cleanup, result metadata, read overlays.
- `tools/replay-parser/src/main/java/opendota/DotaLensApi.java`: `PUT /api/matches/{id}/subject` and API version.
- `tools/replay-parser/src/test/java/opendota/ReplayMatchMetadataTest.java`: internal identity fields.
- `tools/replay-parser/src/test/java/opendota/ReplayJobManagerTest.java`: legacy overlay, selection, and mismatch cleanup.
- `app-core.js`: pure subject and Patch presentation helpers.
- `app.js`: identity gate, subject save, subject-aware hero selection, and Patch copy.
- `index.html`: subject selection dialog and switch-player command.
- `styles.css`: responsive two-team player chooser.
- `tests/frontend/app-core.test.js`: pure helper regression tests.
- `package.json`, `package-lock.json`, `README.md`, `CHANGELOG.md`: 0.4.5 versions and release notes.
- `desktop/main.cjs`, `tools/Start-DotaLens.ps1`, `tools/Invoke-DotaLensExeSmoke.ps1`: Parser API version alignment.

---

### Task 1: Match Subject Store

**Files:**
- Create: `tools/replay-parser/src/main/java/opendota/MatchSubjectStore.java`
- Create: `tools/replay-parser/src/test/java/opendota/MatchSubjectStoreTest.java`

**Interfaces:**
- Produces: `MatchSubjectStore(Path dataDirectory)`
- Produces: `JsonObject reconcile(long matchId, JsonObject match, long requestedAccountId)`
- Produces: `JsonObject select(long matchId, JsonObject match, int playerSlot)`
- Produces: `JsonObject overlay(long matchId, JsonObject analysis)`

- [x] **Step 1: Write failing automatic-match and no-match tests**

Create fixtures with external slots `0` and `128`. Assert:

```java
assertEquals("matched", subject.get("status").getAsString());
assertEquals(128, subject.get("selected_player_slot").getAsInt());
assertEquals("account_id", subject.get("source").getAsString());
```

For an absent account:

```java
assertEquals("manual_required", subject.get("status").getAsString());
assertFalse(subject.has("selected_player_slot"));
assertEquals("requested_account_not_in_replay", subject.get("reason").getAsString());
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
$env:JAVA_HOME = (Resolve-Path 'tools\runtime\jdk-21').Path
& 'tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' -f 'tools\replay-parser\pom.xml' '-Dtest=MatchSubjectStoreTest' test
```

Expected: compilation failure because `MatchSubjectStore` does not exist.

- [x] **Step 3: Implement reconciliation and atomic persistence**

Implement schema `match-subject/1.0` with statuses `matched`, `manual_required`, `manual_selected`, and `invalidated`. Save via `subject.json.part` followed by atomic replace, with a non-atomic replace fallback.

- [x] **Step 4: Add failing manual-selection persistence tests**

Assert that:

```java
JsonObject selected = store.select(42L, match, 128);
assertEquals("manual_selected", selected.get("status").getAsString());
assertEquals(128, selected.get("selected_player_slot").getAsInt());
```

Create a second store instance over the same temporary directory and verify `overlay` restores the selection.

- [x] **Step 5: Add invalid slot and changed-roster tests**

Assert an unavailable external slot throws `IllegalArgumentException`. Replace the selected player's account in the fixture and assert `reconcile` returns `invalidated`.

- [x] **Step 6: Run focused tests and verify GREEN**

Run the Task 1 command. Expected: all `MatchSubjectStoreTest` tests pass.

- [x] **Step 7: Check task diff**

Run:

```powershell
git diff --check -- tools/replay-parser/src/main/java/opendota/MatchSubjectStore.java tools/replay-parser/src/test/java/opendota/MatchSubjectStoreTest.java
```

---

### Task 2: Parser Subject API and Analysis Overlay

**Files:**
- Modify: `tools/replay-parser/src/main/java/opendota/AnalysisSummary.java`
- Modify: `tools/replay-parser/src/main/java/opendota/ReplayJobManager.java`
- Modify: `tools/replay-parser/src/main/java/opendota/DotaLensApi.java`
- Modify: `tools/replay-parser/src/test/java/opendota/ReplayJobManagerTest.java`

**Interfaces:**
- Consumes: Task 1 `MatchSubjectStore`.
- Produces: `ReplayJobManager.selectSubject(long matchId, int playerSlot)`.
- Produces: `PUT /api/matches/{match_id}/subject` with body `{"player_slot":128}`.

- [x] **Step 1: Write failing manager overlay tests**

Write a current compact `summary.json` containing two players but no subject. Assert `readAnalysis` returns:

```java
assertEquals("manual_required",
        analysis.getAsJsonObject("match").getAsJsonObject("subject").get("status").getAsString());
assertFalse(analysis.getAsJsonObject("match").has("selected_player_slot"));
```

- [x] **Step 2: Verify RED**

Run:

```powershell
$env:JAVA_HOME = (Resolve-Path 'tools\runtime\jdk-21').Path
& 'tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' -f 'tools\replay-parser\pom.xml' '-Dtest=ReplayJobManagerTest' test
```

Expected: subject is missing.

- [x] **Step 3: Integrate `MatchSubjectStore`**

Construct one store in `ReplayJobManager`. Reconcile after summary generation, add `match.subject`, and project a non-null selected slot to `match.selected_player_slot`. Overlay legacy analyses during reads.

- [x] **Step 4: Write failing selection API behavior tests**

At manager level assert:

```java
JsonObject selected = manager.selectSubject(456L, 128);
assertEquals("manual_selected", selected.get("status").getAsString());
assertEquals(128, manager.readAnalysis(456L)
        .getAsJsonObject("match").get("selected_player_slot").getAsInt());
```

Assert missing analysis returns `null` and invalid slot throws `IllegalArgumentException`.

- [x] **Step 5: Implement the HTTP route**

In `handleMatches`, accept `PUT /api/matches/{id}/subject`, validate numeric `player_slot`, and map:

- no analysis -> HTTP 404 `analysis_not_found`
- invalid slot -> HTTP 400 `invalid_player_slot`
- I/O failure -> HTTP 500 `subject_write_failed`
- success -> HTTP 200 subject JSON

- [x] **Step 6: Update API version to `1.6.0`**

Change only Parser's advertised version in this task. Desktop/script alignment happens in Task 5 after integration tests.

- [x] **Step 7: Run focused tests and verify GREEN**

Run `ReplayJobManagerTest` and `MatchSubjectStoreTest`; both must pass.

---

### Task 3: Replay Internal Identity and Patch Provenance

**Files:**
- Create: `tools/replay-parser/src/main/java/opendota/ReplayIdentityException.java`
- Create: `tools/replay-parser/src/main/java/opendota/DotaPatchResolver.java`
- Create: `tools/replay-parser/src/main/resources/dota-patch-timeline.json`
- Create: `tools/replay-parser/src/test/java/opendota/DotaPatchResolverTest.java`
- Modify: `tools/replay-parser/src/main/java/opendota/ReplayMatchMetadata.java`
- Modify: `tools/replay-parser/src/main/java/opendota/AnalysisSummary.java`
- Modify: `tools/replay-parser/src/main/java/opendota/ReplayJobManager.java`
- Modify: `tools/replay-parser/src/test/java/opendota/ReplayMatchMetadataTest.java`
- Modify: `tools/replay-parser/src/test/java/opendota/ReplayJobManagerTest.java`

**Interfaces:**
- Produces: `DotaPatchResolver.resolve(JsonObject match)` returning `patch-resolution/1.0`.
- Produces: `ReplayIdentityException.declaredMatchId()` and `.internalMatchId()`.
- Adds: `match.replay_match_id`, `match.replay_end_time`, and `match.patch_resolution`.

- [x] **Step 1: Add failing Replay metadata identity assertions**

Extend `ReplayMatchMetadataTest`:

```java
assertEquals(9973575401L, reconstructed.get("replay_match_id").getAsLong());
assertEquals(1785001000L, reconstructed.get("replay_end_time").getAsLong());
```

Run the focused test and verify both fields are missing.

- [x] **Step 2: Implement Replay identity fields**

Keep the external `match_id` unchanged for mismatch detection. Always expose the internal values under `replay_match_id` and `replay_end_time`.

- [x] **Step 3: Write failing Patch resolver tests**

Cover:

- authoritative `patch_name=7.41d` -> `exact`, source `opendota_match`
- July 2026 Replay end time -> `inferred`, `7.41d`
- within 12 hours of a timeline boundary -> `ambiguous`
- no Patch and no end time -> `unknown`

Assert `negative_scoring` is disabled for ambiguous and unknown states.

- [x] **Step 4: Add the versioned Patch timeline and resolver**

Load `dota-patch-timeline.json` from classpath. The resource contains schema, 12-hour uncertainty, ordered release epochs, and supported metadata profile names. Reject malformed or unsorted resources during tests.

Use these supported boundaries:

| Patch | Official release date | UTC midpoint proxy | Epoch |
|---|---|---:|---:|
| `7.41` | `2026-03-24` | `2026-03-24T12:00:00Z` | `1774353600` |
| `7.41d` | `2026-06-05` | `2026-06-05T12:00:00Z` | `1780660800` |

Valve's public Patch pages provide a calendar date rather than an exact release timestamp. Record
`time_basis=official_date_midpoint_proxy` and classify the full UTC release day (midpoint plus or
minus 12 hours) as `ambiguous`. Outside that window an inferred supported profile uses confidence
`0.92`; before the first supported boundary, or when no supported profile exists, return `unknown`
instead of guessing.

- [x] **Step 5: Pre-resolve metadata before `ProductAnalysis`**

In `AnalysisSummary.build`:

1. call `ReplayMatchMetadata.enrich`
2. compare supplied `match_id` with `replay_match_id`
3. resolve Patch and attach `patch_resolution`
4. construct `ProductAnalysis` with the resolved Patch name
5. perform the normal event pass and build modules

Remove the duplicate in-loop metadata accumulator.

- [x] **Step 6: Write and verify the mismatch failure test**

Use a synthetic raw JSONL whose epilogue internal ID differs from the declared ID. Assert `ReplayIdentityException` exposes both values.

- [x] **Step 7: Add job error context and cache cleanup**

On `ReplayIdentityException`:

- set `error_code=replay_match_id_mismatch`
- add `error_context.declared_match_id`
- add `error_context.internal_match_id`
- delete only Parser cache copies named for the declared ID
- preserve existing completed summary files
- never touch the user source path

- [x] **Step 8: Run Task 3 focused tests**

Run:

```powershell
$env:JAVA_HOME = (Resolve-Path 'tools\runtime\jdk-21').Path
& 'tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' -f 'tools\replay-parser\pom.xml' '-Dtest=ReplayMatchMetadataTest,DotaPatchResolverTest,ReplayJobManagerTest' test
```

Expected: all focused tests pass.

---

### Task 4: Frontend Identity Gate and Player Chooser

**Files:**
- Create: `tests/frontend/replay-subject.test.js`
- Modify: `app-core.js`
- Modify: `tests/frontend/app-core.test.js`
- Modify: `app.js`
- Modify: `index.html`
- Modify: `styles.css`

**Interfaces:**
- Produces: `normalizeMatchSubject(match, requestedAccountId)`.
- Produces: `selectedPlayerIndex(players, subject)` returning `-1` when unresolved.
- Produces: `patchResolutionLabel(resolution, fallbackName)`.
- Consumes: `PUT /api/matches/{id}/subject`.

- [x] **Step 1: Write failing pure-helper tests**

Assert:

```js
assert.equal(selectedPlayerIndex(players, { status: "manual_required" }), -1);
assert.equal(selectedPlayerIndex(players, {
  status: "manual_selected",
  selected_player_slot: 128,
}), 1);
```

Assert an old analysis with absent requested account normalizes to `manual_required`, never index `0`.

- [x] **Step 2: Verify RED**

Run:

```powershell
node --test tests/frontend/app-core.test.js tests/frontend/replay-subject.test.js
```

Expected: import/export failure for the new helpers.

- [x] **Step 3: Implement pure helpers**

Keep external Replay slots separate from array indexes. `patchResolutionLabel` must return the four approved Chinese states from the design spec.

- [x] **Step 4: Add static failing integration assertions**

In `replay-subject.test.js`, read `app.js` and assert:

- no `Math.max(0, HEROES.findIndex((hero) => hero.me))`
- no selected-player `|| players[0]` fallback
- the subject PUT route exists
- `manual_required` opens the chooser
- `hero.me` is derived from selected external slot

Run and verify RED on existing source.

- [x] **Step 5: Add the player chooser dialog**

Add one dialog with:

- two fixed team columns
- five player buttons per team
- hero portrait, nickname, account ID, and position label
- disabled confirm until a player is chosen
- cancel returns to matches without opening personal analysis

Add a “切换玩家” command in the match detail header.

- [x] **Step 6: Gate `loadAnalysis`**

Before `applyAnalysisToProduct`:

1. normalize the subject
2. if unresolved, retain pending analysis and show the dialog
3. if resolved, map external slot to internal hero index
4. derive every `hero.me` flag from the subject

After successful PUT, update the in-memory analysis contract and continue without refetching large modules or resetting time.

- [x] **Step 7: Remove all identity fallbacks**

`hydrateMatchFromAnalysis` may use an empty object for unresolved team facts, but may not use the requested account or first player after Parser returns an explicit subject.

- [x] **Step 8: Add Patch source copy and coverage impact**

Render exact, inferred, ambiguous, and unknown labels. Add affected conclusions to the data-coverage presentation without introducing a new Tab.

- [x] **Step 9: Run frontend tests and production build**

Run:

```powershell
npm test
npm run build
```

Expected: all tests pass and Vite build exits 0.

---

### Task 5: Version Alignment and Fixed Replay Verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `app.js`
- Modify: `desktop/main.cjs`
- Modify: `tools/Start-DotaLens.ps1`
- Modify: `tools/Invoke-DotaLensExeSmoke.ps1`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Application version: `0.4.5`.
- Parser API version: `1.6.0`.

- [x] **Step 1: Add failing version-alignment assertions**

Extend frontend/static tests to assert `package.json`, `app.js`, desktop Parser expectation, PowerShell expectation, and smoke expectation use the approved versions.

- [x] **Step 2: Verify RED**

Run `npm test`; expected failure because source still says 0.4.4 / 1.5.3.

- [x] **Step 3: Update versions and release notes**

Document trusted subject selection, internal ID validation, Patch provenance, and offline behavior. Keep unrelated roadmap content unchanged.

- [x] **Step 4: Run the complete Parser suite**

Run:

```powershell
& 'tools\Build-DotaLensParser.ps1'
```

Expected: Maven package succeeds with zero failures.

- [x] **Step 5: Restart the local Parser**

Stop only an idle Parser through `/api/shutdown`, start the rebuilt JAR with `tools/Start-DotaLens.ps1`, and verify `/api/status` reports `1.6.0`.

- [x] **Step 6: Verify normal automatic selection**

Force reparse fixed Replay `8909845275` with a locally supplied account ID. Assert:

- completed job
- `match.subject.status=matched`
- selected player account matches the locally supplied account ID
- no chooser required

- [x] **Step 7: Verify manual selection**

Force reparse fixed Replay `8894766243` with account `99735754`. Assert:

- parse completes
- `match.subject.status=manual_required`
- `selected_player_slot` is absent
- PUT a valid participant slot
- reload returns `manual_selected`
- Parser restart preserves the same selected slot

- [x] **Step 8: Verify Patch provenance**

For `8894766243`, assert `patch_resolution` is present and the detail/coverage UI uses its status instead of displaying a bare unknown Patch.

- [x] **Step 9: Run final verification**

Run:

```powershell
npm test
npm run build
git diff --check
```

Also run the full Maven package command once more if any Java file changed after Step 4.

- [x] **Step 10: Review the final diff**

Confirm:

- no user file deletion path
- no first-player fallback
- no identity-dependent report before subject resolution
- no Patch-dependent negative gate enabled for ambiguous/unknown
- no unrelated file was reverted

