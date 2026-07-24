from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import sys
from pathlib import Path


DEFAULT_VOICE = "zh-CN-XiaoyiNeural"
DEFAULT_RATE = "+15%"
DEFAULT_PITCH = "+4Hz"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate the Dota Lens neural voiceover")
    parser.add_argument("--storyboard", default="storyboard.json")
    parser.add_argument("--output-dir", default="neural_audio")
    parser.add_argument("--voice", default=DEFAULT_VOICE)
    parser.add_argument("--rate", default=DEFAULT_RATE)
    parser.add_argument("--pitch", default=DEFAULT_PITCH)
    return parser.parse_args()


def speech_text(text: str) -> str:
    replacements = {
        "Dota Lens": "刀塔 Lens",
        "OpenDota": "Open Dota",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return text


async def generate() -> None:
    args = parse_args()
    promo_dir = Path(__file__).resolve().parent
    sys.path.insert(0, str(promo_dir / "voice_vendor"))
    import edge_tts  # type: ignore

    storyboard = (promo_dir / args.storyboard).resolve()
    output_dir = (promo_dir / args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    data = json.loads(storyboard.read_text(encoding="utf-8"))
    ffmpeg = promo_dir / "vendor" / "imageio_ffmpeg" / "binaries" / "ffmpeg-win-x86_64-v7.1.exe"
    if not ffmpeg.exists():
        raise FileNotFoundError(ffmpeg)

    for scene in data["scenes"]:
        mp3_path = output_dir / f"{scene['id']}.mp3"
        wav_path = output_dir / f"{scene['id']}.wav"
        communicate = edge_tts.Communicate(
            speech_text(str(scene["narration"])),
            voice=args.voice,
            rate=args.rate,
            pitch=args.pitch,
        )
        await communicate.save(str(mp3_path))
        subprocess.run(
            [
                str(ffmpeg), "-y", "-loglevel", "error", "-i", str(mp3_path),
                "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", str(wav_path),
            ],
            check=True,
        )
        mp3_path.unlink(missing_ok=True)
        print(f"Generated neural voice: {wav_path}", flush=True)


if __name__ == "__main__":
    asyncio.run(generate())
