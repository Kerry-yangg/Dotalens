# Player Report Replay Regression

`manifest.json` freezes the player-report Replay matrix. It contains 16 unique
Replay candidates with repository-relative paths: 15 enabled matches and one
reserve. Every enabled match binds one reviewed Golden subject, with positions
1 through 5 represented exactly three times each.

Generate the deterministic 160-player candidate inventory without changing
Replay analyses:

```powershell
node '.\tools\player-report-regression.mjs' candidates `
  '.\tests\player-report-regression\manifest.json'
```

The report is written to
`tools/runtime/player-report-regression/reports/candidates.md`.

Generate candidate Golden projections in ignored runtime storage:

```powershell
node '.\tools\player-report-regression.mjs' propose-golden `
  '.\tests\player-report-regression\manifest.json'
```

This writes exactly one projection per enabled match beneath
`tools/runtime/player-report-regression/candidate-golden/` and never writes
`expected/`. After manual source review, explicit approval is required:

```powershell
node '.\tools\player-report-regression.mjs' approve-golden `
  '.\tests\player-report-regression\manifest.json' `
  --reviewed
```

Approval without `--reviewed`, incomplete candidate sets, integrity failures,
or source drift are rejected without replacing approved expectations.

Validate the frozen protocol and Golden layers without changing Replay
analyses:

```powershell
pwsh -NoProfile -File '.\tools\Invoke-PlayerReportRegression.ps1' `
  -Mode ValidateExisting
```

Validate all 16 candidates, including the reserve:

```powershell
pwsh -NoProfile -File '.\tools\Invoke-PlayerReportRegression.ps1' `
  -Mode ValidateExisting -IncludeCandidates
```

`ValidateExisting` only validates analyses already in
`tools/runtime/dota-lens-data/analyses`. `ReparseChanged` reparses only when the
Replay hash, parser version, base component model, analysis package, or previous
checkpoint completion changed. `ReparseAll` reparses every selected match serially.

The runner writes checkpoints and aggregate JSON/Markdown reports beneath
`tools/runtime/player-report-regression/`. Reparse modes must remain serial. The
runner never writes Golden expectations.
