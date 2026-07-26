# Player Report Replay Regression

`manifest.json` is the unfrozen candidate pool for the player-report Replay matrix.
It lists 16 replay IDs and repository-relative paths only. Task 10 owns selecting
the final 15-match matrix, reserve, and Golden subjects after a fresh reparse.

Run all candidates without changing Replay analyses:

```powershell
pwsh -NoProfile -File '.\tools\Invoke-PlayerReportRegression.ps1' `
  -Mode ValidateExisting -IncludeCandidates
```

`ValidateExisting` only validates analyses already in
`tools/runtime/dota-lens-data/analyses`. `ReparseChanged` reparses only when the
Replay hash, parser version, base component model, analysis package, or previous
checkpoint completion changed. `ReparseAll` reparses every selected match serially.

The runner writes checkpoints and aggregate JSON/Markdown reports beneath
`tools/runtime/player-report-regression/`. It never writes Golden expectations.
