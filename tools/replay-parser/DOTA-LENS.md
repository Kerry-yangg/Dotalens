# Dota Lens replay parser branch

This directory is pinned from OpenDota parser commit
`a03b9e5f228cecb3f2e3ddfd378683bbb1d467fa` and extended for Dota Lens raw
replay analysis. Keep upstream blob compatibility isolated from the raw JSONL
path: the desktop product consumes the ordinary `POST /` response.

## Added raw fields

- Clock: `demo_tick`, `raw_game_time_ms`, normalized `game_time_ms`, `event_seq`
- Orders: issuer, selected units, target, ability/item, position, queue, sequence,
  flags, latency and ping
- Combat log: every non-invalid raw event type and every field currently
  exposed by Clarity `CombatLogEntry`; blob mode keeps the upstream legacy filter
- Hero snapshots: position, HP, mana, movement speed, inventory, charges, item
  cooldowns, ability levels, ability cooldowns and nullable visibility candidates
- Unit lifecycle: enter, leave, death/life state, ownership and visibility fields
  when the current Replay patch transmits them, for heroes, wards, creeps,
  neutrals, couriers and buildings
- Vision-source facts: day/night range, FoW team, reveal radius, ward owner,
  exact ward lifetime and killed/expired end reason

All of these are facts decoded from Replay messages or send-table entities.
Farm opportunities, safe lanes, ward scores and coaching suggestions remain
derived analysis and must carry confidence and evidence references.

## Runtime flags

| Variable | Default | Purpose |
| --- | --- | --- |
| `DOTA_LENS_SCHEMA_PROBE` | `0` | Emit one `schema_probe` row per supported entity DT class. |
| `DOTA_LENS_UNIT_EVENTS` | `1` | Emit tracked unit enter/leave/state/visibility rows. |

The schema probe is intentionally sparse. Use it on the first replay from each
supported Dota patch, then inspect `event_schemas.schema_probe` and the probe
rows before claiming a field is available.

## Build and verify

From PowerShell 7 at the repository root:

```powershell
.\tools\Build-DotaLensParser.ps1
python -m unittest discover -s .\tools\replay-poc\tests -v
```

Start the parser with the schema probe enabled:

```powershell
.\tools\replay-poc\Start-OpenDotaParser.ps1 `
  -JarPath .\tools\replay-parser\target\stats-0.1.0.jar `
  -JavaPath .\tools\runtime\jdk-21\bin\java.exe `
  -SchemaProbe
```

Post a local `.dem` with `Invoke-ReplayParserPoc.ps1`. The generated summary
reports per-event field presence/non-null ratios and clock continuity, so schema
coverage is an explicit acceptance artifact rather than an assumption.

The validated internal replay sample does not expose
`m_iTaggedAsVisibleByTeam` on any of its ten hero DT classes. Combat-log
visibility remains an event-level fact; continuous team vision must therefore
be reconstructed from vision sources and patch map rules and labeled as an
estimate until checked against team-perspective playback.

Raw JSONL emits all non-invalid combat event types. This replay added 63
critical-damage and 2,727 modifier-stack events after removing the upstream
legacy filter; it contained zero `REVEALED_INVISIBLE` events.

Ward expiry needs a versioned rule. The combat log reports the placing hero as
the attacker when an observer expires at 360 seconds or a sentry expires at 420
seconds, so attacker presence alone cannot distinguish a kill from expiry. The
parser applies these current-patch natural lifetimes with a one-second tick
tolerance and emits an end-reason confidence value.
