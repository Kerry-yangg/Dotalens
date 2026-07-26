# Task 2 Report

## Status

Complete.

## Implementation Summary

- Added deterministic replay-module fixture coverage for core and support positions.
- Added atomic base components for lane execution, farm efficiency, and resource decision.
- Emitted `player-report-base-components/1.0` at report and players-module level.
- Preserved non-empty analysis-stage `base_components` in `PlayerReportScoringV4` without adding recomputation, audit, or legacy fallback behavior.
- Kept report model `player-report/4.0`; the overall calculation and ranking now retain fractional dimension scores until their existing integer boundaries.

## Modified Files

- `tools/replay-parser/src/main/java/opendota/PlayerReportAnalysis.java`
- `tools/replay-parser/src/main/java/opendota/PlayerReportScoringV4.java`
- `tools/replay-parser/src/test/java/opendota/PlayerReportAtomicTestFixture.java`
- `tools/replay-parser/src/test/java/opendota/PlayerReportAnalysisAtomicComponentsTest.java`
- `.superpowers/sdd/2026-07-26-player-report-atomic-components-and-replay-matrix/task-2-report.md`

## RED Evidence

Before implementation, the required atomic test command ran 3 tests with 2 failures and 1 error:

- `base_component_model` was absent from the report.
- Support dimensions exposed only `existing_dimension_model` instead of real atomic keys.
- Missing XPM had no `relative_xpm` component to mark unavailable.

## Passing Tests

```powershell
$env:JAVA_HOME = (Resolve-Path '.\tools\runtime\jdk-21').Path
& '.\tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' -q `
  -f '.\tools\replay-parser\pom.xml' `
  '-Dtest=PlayerReportAnalysisAtomicComponentsTest,PlayerReportNarrativeV3Test' test
```

Passed: `PlayerReportAnalysisAtomicComponentsTest` 3/3 and
`PlayerReportNarrativeV3Test` 9/9, 12/12 total.

## Diff Check

`git diff --check` and `git diff --cached --check` completed without whitespace errors.

## Self Review

- Core lane uses 75/25 and support lane uses 65/35.
- Farm uses 33.3333/33.3333/33.3334 and renormalizes only available metrics.
- Core resource uses 35/50/15; support resource uses 65/35 without core claims.
- Component comparison and raw metric payloads are structured; program keys are stable.
- Non-atomic dimensions retain their existing scoring behavior.

## Commit Hash

Implementation commit: `eccb0edaadaee395726bc189730751844199a207`.

## Concerns

None.
