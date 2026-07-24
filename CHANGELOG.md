# Changelog

## 0.4.2 - 2026-07-24

### Added

- Per-unit lane-creep and neutral-camp lifecycles with one-to-one death and gold attribution.
- Patch-exact Valve ability metadata for 7.41 and 7.41d, including reconstruction provenance.
- Evidence-gated missed-lane, stack-value, resource-route, and position-specific responsibility analysis.
- Smoke, invisibility, sentry true sight, height guards, and bounded last-seen states in continuous visibility.
- Match-long, phase-aware post-20-minute farm-route review for positions 1 through 3.
- Player-report root-cause chains that merge deaths, estimated item delays, objective losses, and vision gaps.
- Per-root cross-dimension penalty attribution with a six-point weighted overall cap.
- Player Report V3 with concise conclusions, expandable evidence, phase summaries, and role-aware scoring.
- Interactive ward-map zoom with coordinate-stable markers and a larger vision-analysis workspace.

### Changed

- Resource routes now pass role, visibility, team-claim, travel-deadline, and pre-10-minute clear-capability gates before score ranking.
- Snapshot summaries use columnar encoding and omit repeated per-second ability and inventory arrays; the full runtime state remains in the compressed raw archive.
- Post-20 core routes use five-minute income baselines, a 75-second evidence horizon, and strategic exemptions for fights and map objectives.
- Player-score evidence now presents one root cause with its gated consequences and raw-to-capped impact calculation.
- Replay jobs expose phase timings, retain the two most recent decompressed Replays, and reclaim transient heap between jobs.
- Large JSONL passes use field projection for events that do not require full product analysis.
- Raw archives and split analysis modules use latency-oriented gzip compression.
- Typography, sidebar behavior, combat layout, vision summaries, and compact match headers were rebalanced for larger text.

### Fixed

- Unattributed confirmed creep deaths can use explicitly labeled same-match value estimates instead of silently becoming zero-value units.
- Higher raw-value but blocked routes no longer suppress a lower-value executable route.
- Stale resident parser processes are detected and restarted gracefully by both desktop and PowerShell launchers.
- Cached Patch names no longer trigger a blocking OpenDota constants request.
- Consecutive parses no longer retain hundreds of megabytes of transient Replay objects.
- Removed the complete golden-sample annotation workflow and its unused classifier runtime.

## 0.4.1 - 2026-07-21

### Added

- Windows x64 NSIS installer with selectable installation directory and bundled Java runtime.
- Steam account to recent matches to confirmed local Replay parsing workflow.
- Development, farm, vision, build, combat, timeline, map, coverage, and player-report views.
- Cancelable parsing jobs, retry states, compact gzip-backed analysis storage, and stale-schema detection.
- Patch-aware coordinate calibration, continuous visibility evidence, lane-wave and camp-state evidence,
  and role-specific combat responsibility gates.

### Fixed

- Replaced the slow-extracting 0.4.0 portable executable with a normal installer flow.
- Corrected minimap coordinate scaling and reduced tower-marker occlusion.
- Fixed missing or delayed tower and hero markers in combat views.
- Centered the selected combat entry in the left event list.
- Removed private account and machine-path defaults from public builds.

### Known limitations

- The installer is not code-signed.
- The Windows executable still uses Electron's default application icon.
- Full analysis requires a downloadable Replay and fields supported by the Replay's Dota 2 patch.
- Some continuous vision, lane-wave, and neutral-camp conclusions remain confidence-scored estimates.
