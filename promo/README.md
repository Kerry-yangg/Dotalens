# Dota Lens 0.4.2 Douyin Promo

This folder builds a vertical `1080x1920` product video from real Dota Lens QA captures.

## Build

```powershell
python .\promo\generate_neural_voice.py
python .\promo\render_promo.py --audio-dir neural_audio
```

The default voice is the youthful Mandarin neural voice `zh-CN-XiaoyiNeural`.
The PowerShell SAPI generator remains available as an offline fallback.

Outputs are written to `promo/output`:

- `Dota-Lens-0.4.2-Douyin.mp4`
- `Dota-Lens-0.4.2-Douyin-Cover.png`
- `Dota-Lens-0.4.2-Douyin-Subtitles.srt`
- `Dota-Lens-0.4.2-Douyin-Voiceover.wav`
- `Dota-Lens-0.4.2-Douyin-Contact-Sheet.jpg`

Edit `storyboard.json` to change narration, captions, source captures, focus points, or callouts.
