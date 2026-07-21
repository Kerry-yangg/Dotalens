# OpenDota raw replay parser POC

The measured result and production constraints are documented in
[`POC-REPLAY-PARSER.md`](../../POC-REPLAY-PARSER.md).

This POC deliberately posts a `.dem` replay to the parser root endpoint. It does
not call `/blob` or append `?blob`, so the parser returns newline-delimited raw
events, including one-second `interval` snapshots.

## Requirements

- PowerShell 7
- Java 21
- Python 3
- The Dota Lens parser source in `tools/replay-parser`

Build the pinned parser branch with the bundled-tool bootstrap script:

```powershell
.\tools\Build-DotaLensParser.ps1
```

Start the parser in one PowerShell 7 terminal:

```powershell
.\tools\replay-poc\Start-OpenDotaParser.ps1 `
  -JarPath .\tools\replay-parser\target\stats-0.1.0.jar `
  -JavaPath .\tools\runtime\jdk-21\bin\java.exe `
  -SchemaProbe
```

POST and validate a replay in another terminal:

```powershell
.\tools\replay-poc\Invoke-ReplayParserPoc.ps1 `
  -ReplayPath 'D:\steam\steamapps\common\dota 2 beta\game\dota\replays\match.dem'
```

For Valve CDN downloads, decompress the `.dem.bz2` first. Reading the stream to
completion also validates the bzip2 CRC:

```powershell
python .\tools\replay-poc\decompress_replay.py `
  .\tools\runtime\replays\match.dem.bz2
```

The output directory contains:

- `<match>.raw.jsonl`: every raw event emitted by the parser
- `<match>.summary.json`: per-event field presence/non-null coverage, millisecond
  clock checks, interval field coverage, and per-slot continuity diagnostics

## Important distinction

The one-second `interval` rows are state snapshots. Combat log, item, ward,
kill, objective, and other events remain separate event rows at their native
timestamps. Farm-location and missed-lane-creep analysis must be derived from
both sources plus patch-specific map, camp, creep-wave, and bounty metadata.
