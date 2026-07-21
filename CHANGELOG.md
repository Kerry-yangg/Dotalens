# Changelog

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
