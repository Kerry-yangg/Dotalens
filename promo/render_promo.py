from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


WIDTH = 1080
HEIGHT = 1920
FPS = 30
VIEWPORT = (40, 410, 1040, 1080)
BACKGROUND = (7, 11, 14)
SURFACE = (15, 21, 25)
TEXT = (242, 246, 248)
MUTED = (151, 164, 173)
ACCENTS = {
    "blue": (89, 169, 229),
    "green": (72, 211, 151),
    "amber": (240, 181, 70),
    "red": (231, 92, 92),
}


@dataclass
class AudioInfo:
    channels: int
    sample_width: int
    frame_rate: int
    frames: bytes
    duration: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render the Dota Lens Douyin promo video")
    parser.add_argument("--storyboard", default="storyboard.json")
    parser.add_argument("--audio-dir", default="audio")
    parser.add_argument("--output-dir", default="output")
    return parser.parse_args()


def read_wav(path: Path) -> AudioInfo:
    with wave.open(str(path), "rb") as audio:
        channels = audio.getnchannels()
        sample_width = audio.getsampwidth()
        frame_rate = audio.getframerate()
        count = audio.getnframes()
        frames = audio.readframes(count)
    return AudioInfo(channels, sample_width, frame_rate, frames, count / frame_rate)


def write_voiceover(scenes: list[dict], audio_dir: Path, output: Path) -> list[dict]:
    infos = [read_wav(audio_dir / f"{scene['id']}.wav") for scene in scenes]
    base = infos[0]
    if any((info.channels, info.sample_width, info.frame_rate) !=
           (base.channels, base.sample_width, base.frame_rate) for info in infos):
        raise RuntimeError("All SAPI scene files must use the same WAV format")

    lead = 0.20
    tail = 0.35
    silence_frame = b"\x00" * (base.channels * base.sample_width)
    timeline: list[dict] = []
    cursor = 0.0
    with wave.open(str(output), "wb") as merged:
        merged.setnchannels(base.channels)
        merged.setsampwidth(base.sample_width)
        merged.setframerate(base.frame_rate)
        for scene, info in zip(scenes, infos):
            lead_frames = int(lead * base.frame_rate)
            tail_frames = int(tail * base.frame_rate)
            merged.writeframes(silence_frame * lead_frames)
            merged.writeframes(info.frames)
            merged.writeframes(silence_frame * tail_frames)
            duration = lead + info.duration + tail
            timeline.append({
                "scene": scene,
                "start": cursor,
                "end": cursor + duration,
                "audio_start": cursor + lead,
                "audio_end": cursor + lead + info.duration,
                "duration": duration,
            })
            cursor += duration
    return timeline


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size)


REGULAR = "C:/Windows/Fonts/msyh.ttc"
BOLD = "C:/Windows/Fonts/msyhbd.ttc"


def wrap_text(draw: ImageDraw.ImageDraw, text: str, text_font: ImageFont.FreeTypeFont,
              max_width: int, max_lines: int = 3) -> list[str]:
    explicit = text.split("\n")
    lines: list[str] = []
    for paragraph in explicit:
        current = ""
        for char in paragraph:
            candidate = current + char
            if draw.textbbox((0, 0), candidate, font=text_font)[2] <= max_width:
                current = candidate
            else:
                if current:
                    lines.append(current)
                current = char
        if current:
            lines.append(current)
    if len(lines) <= max_lines:
        return lines
    lines = lines[:max_lines]
    while lines[-1] and draw.textbbox((0, 0), lines[-1] + "…", font=text_font)[2] > max_width:
        lines[-1] = lines[-1][:-1]
    lines[-1] += "…"
    return lines


def ease(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def crop_for_scene(source: Image.Image, scene: dict, progress: float,
                   viewport_aspect: float) -> tuple[Image.Image, tuple[float, float, float, float]]:
    source_w, source_h = source.size
    start_zoom = 1.02
    target_zoom = float(scene.get("zoom", 1.2))
    zoom_progress = ease(min(1.0, progress / 0.48))
    zoom = start_zoom + (target_zoom - start_zoom) * zoom_progress
    focus = scene.get("focus") or [source_w / 2, source_h / 2]
    center_x = source_w / 2 + (float(focus[0]) - source_w / 2) * zoom_progress
    center_y = source_h / 2 + (float(focus[1]) - source_h / 2) * zoom_progress
    crop_w = source_w / zoom
    crop_h = crop_w / viewport_aspect
    if crop_h > source_h / zoom:
        crop_h = source_h / zoom
        crop_w = crop_h * viewport_aspect
    left = max(0.0, min(source_w - crop_w, center_x - crop_w / 2))
    top = max(0.0, min(source_h - crop_h, center_y - crop_h / 2))
    box = (left, top, left + crop_w, top + crop_h)
    cropped = source.crop(tuple(round(value) for value in box))
    return cropped, box


def draw_callout(frame: Image.Image, scene: dict, crop_box: tuple[float, float, float, float],
                 viewport: tuple[int, int, int, int], progress: float, accent: tuple[int, int, int]) -> None:
    callout = scene.get("callout")
    if not callout:
        return
    left, top, right, bottom = crop_box
    view_left, view_top, view_right, view_bottom = viewport
    scale_x = (view_right - view_left) / (right - left)
    scale_y = (view_bottom - view_top) / (bottom - top)
    x1 = view_left + (callout[0] - left) * scale_x
    y1 = view_top + (callout[1] - top) * scale_y
    x2 = view_left + (callout[2] - left) * scale_x
    y2 = view_top + (callout[3] - top) * scale_y
    if x2 < view_left or x1 > view_right or y2 < view_top or y1 > view_bottom:
        return
    x1, y1 = max(view_left + 4, x1), max(view_top + 4, y1)
    x2, y2 = min(view_right - 4, x2), min(view_bottom - 4, y2)
    overlay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    pulse = 0.55 + 0.35 * math.sin(progress * math.pi * 6) ** 2
    draw.rounded_rectangle((x1, y1, x2, y2), radius=14, outline=accent + (230,), width=5)
    draw.rounded_rectangle((x1 - 5, y1 - 5, x2 + 5, y2 + 5), radius=18,
                           outline=accent + (round(95 * pulse),), width=3)
    cursor_x, cursor_y = x2 - 8, y1 + 8
    ring = 18 + 12 * math.sin(min(1.0, progress * 5) * math.pi) ** 2
    draw.ellipse((cursor_x - ring, cursor_y - ring, cursor_x + ring, cursor_y + ring),
                 outline=(255, 255, 255, 190), width=3)
    draw.polygon([(cursor_x, cursor_y), (cursor_x + 8, cursor_y + 24),
                  (cursor_x + 14, cursor_y + 15), (cursor_x + 25, cursor_y + 12)],
                 fill=(255, 255, 255, 235))
    frame.alpha_composite(overlay)


def draw_background(frame: Image.Image, accent: tuple[int, int, int], scene_index: int) -> None:
    draw = ImageDraw.Draw(frame)
    draw.rectangle((0, 0, WIDTH, HEIGHT), fill=BACKGROUND + (255,))
    for x in range(0, WIDTH, 80):
        draw.line((x, 0, x, HEIGHT), fill=(20, 28, 33, 90), width=1)
    for y in range(0, HEIGHT, 80):
        draw.line((0, y, WIDTH, y), fill=(20, 28, 33, 90), width=1)
    draw.rectangle((0, 0, 12, HEIGHT), fill=accent + (255,))
    draw.text((50, 54), "DOTA LENS", font=font(BOLD, 28), fill=TEXT + (255,))
    draw.text((50, 94), "REPLAY WORKBENCH", font=font(REGULAR, 15), fill=MUTED + (255,))
    draw.text((950, 66), f"0{scene_index + 1}", font=font(BOLD, 24), fill=accent + (255,))


def draw_header(frame: Image.Image, scene: dict, accent: tuple[int, int, int]) -> None:
    draw = ImageDraw.Draw(frame)
    label_font = font(BOLD, 24)
    title_font = font(BOLD, 58 if len(scene["title"]) < 26 else 52)
    label = scene["label"]
    label_width = draw.textbbox((0, 0), label, font=label_font)[2]
    label_fill = tuple(round(BACKGROUND[index] * 0.68 + accent[index] * 0.32)
                       for index in range(3))
    draw.rounded_rectangle((50, 142, 78 + label_width, 188), radius=5,
                           fill=label_fill + (255,), outline=accent + (210,), width=2)
    draw.text((64, 150), label, font=label_font, fill=accent + (255,))
    lines = wrap_text(draw, scene["title"], title_font, 950, max_lines=2)
    y = 215
    for line in lines:
        draw.text((50, y), line, font=title_font, fill=TEXT + (255,))
        y += 76


def active_caption(entry: dict, current_time: float) -> str:
    captions = entry["scene"].get("captions", [])
    if not captions:
        return ""
    audio_start, audio_end = entry["audio_start"], entry["audio_end"]
    if current_time <= audio_start:
        return captions[0]
    if current_time >= audio_end:
        return captions[-1]
    ratio = (current_time - audio_start) / max(0.001, audio_end - audio_start)
    return captions[min(len(captions) - 1, int(ratio * len(captions)))]


def draw_caption(frame: Image.Image, entry: dict, current_time: float,
                 accent: tuple[int, int, int]) -> None:
    draw = ImageDraw.Draw(frame)
    panel = (40, 1160, 1040, 1700)
    draw.rounded_rectangle(panel, radius=8, fill=SURFACE + (246,),
                           outline=(44, 57, 65, 255), width=2)
    draw.rectangle((40, 1160, 48, 1700), fill=accent + (255,))
    caption = active_caption(entry, current_time)
    caption_font = font(BOLD, 56 if len(caption) < 24 else 48)
    lines = wrap_text(draw, caption, caption_font, 890, max_lines=3)
    total_height = len(lines) * 78
    y = 1260 + max(0, (230 - total_height) / 2)
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=caption_font)
        x = (WIDTH - (bbox[2] - bbox[0])) / 2
        draw.text((x + 2, y + 3), line, font=caption_font, fill=(0, 0, 0, 170))
        draw.text((x, y), line, font=caption_font, fill=TEXT + (255,))
        y += 78
    scene = entry["scene"]
    features = "  ·  ".join(scene.get("captions", []))
    feature_font = font(REGULAR, 23)
    feature_lines = wrap_text(draw, features, feature_font, 900, max_lines=2)
    y = 1580
    for line in feature_lines:
        bbox = draw.textbbox((0, 0), line, font=feature_font)
        x = (WIDTH - (bbox[2] - bbox[0])) / 2
        draw.text((x, y), line, font=feature_font, fill=MUTED + (255,))
        y += 34


def draw_progress(frame: Image.Image, scene_index: int, scene_progress: float,
                  scene_count: int, accent: tuple[int, int, int]) -> None:
    draw = ImageDraw.Draw(frame)
    y = 1780
    segment_width = 900 / scene_count
    for index in range(scene_count):
        x1 = 80 + index * segment_width
        x2 = x1 + segment_width - 8
        color = accent if index < scene_index else (48, 59, 66)
        if index == scene_index:
            draw.rounded_rectangle((x1, y, x1 + (x2 - x1) * scene_progress, y + 8),
                                   radius=4, fill=accent + (255,))
            draw.rounded_rectangle((x1 + (x2 - x1) * scene_progress, y, x2, y + 8),
                                   radius=4, fill=(48, 59, 66, 255))
        else:
            draw.rounded_rectangle((x1, y, x2, y + 8), radius=4, fill=color + (255,))
    draw.text((80, 1820), "基于本地 Replay 的逐秒事实", font=font(REGULAR, 22), fill=MUTED + (255,))
    draw.text((817, 1820), "桌面端应用", font=font(BOLD, 22), fill=accent + (255,))


def apply_fade(frame: Image.Image, progress: float, duration: float) -> Image.Image:
    fade = min(1.0, progress / 0.18, (1.0 - progress) * duration / 0.18)
    if fade >= 0.999:
        return frame
    black = Image.new("RGBA", frame.size, (0, 0, 0, 255))
    return Image.blend(black, frame, max(0.0, fade))


def render_frame(entry: dict, scene_index: int, scene_count: int, local_time: float,
                 source: Image.Image) -> Image.Image:
    scene = entry["scene"]
    duration = entry["duration"]
    progress = max(0.0, min(1.0, local_time / duration))
    accent = ACCENTS.get(scene.get("accent", "blue"), ACCENTS["blue"])
    frame = Image.new("RGBA", (WIDTH, HEIGHT), BACKGROUND + (255,))
    draw_background(frame, accent, scene_index)
    draw_header(frame, scene, accent)

    view_left, view_top, view_right, view_bottom = VIEWPORT
    viewport_aspect = (view_right - view_left) / (view_bottom - view_top)
    working = source
    if scene.get("cta"):
        working = source.filter(ImageFilter.GaussianBlur(radius=10))
    cropped, crop_box = crop_for_scene(working, scene, progress, viewport_aspect)
    fitted = cropped.resize((view_right - view_left, view_bottom - view_top), Image.Resampling.LANCZOS)
    if scene.get("cta"):
        dark = Image.new("RGBA", fitted.size, (2, 5, 7, 145))
        fitted = Image.alpha_composite(fitted.convert("RGBA"), dark)
    shadow = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle((view_left + 4, view_top + 14, view_right + 4, view_bottom + 14),
                                  radius=10, fill=(0, 0, 0, 130))
    frame.alpha_composite(shadow)
    mask = Image.new("L", fitted.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, fitted.width, fitted.height), radius=10, fill=255)
    frame.paste(fitted, (view_left, view_top), mask)
    ImageDraw.Draw(frame).rounded_rectangle(VIEWPORT, radius=10, outline=(57, 72, 81, 255), width=3)
    draw_callout(frame, scene, crop_box, VIEWPORT, progress, accent)
    draw_caption(frame, entry, entry["start"] + local_time, accent)
    draw_progress(frame, scene_index, progress, scene_count, accent)
    return apply_fade(frame, progress, duration).convert("RGB")


def srt_timestamp(seconds: float) -> str:
    milliseconds = max(0, round(seconds * 1000))
    hours, milliseconds = divmod(milliseconds, 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    secs, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"


def write_srt(timeline: list[dict], path: Path) -> None:
    rows: list[str] = []
    index = 1
    for entry in timeline:
        captions = entry["scene"].get("captions", [])
        if not captions:
            continue
        span = (entry["audio_end"] - entry["audio_start"]) / len(captions)
        for caption_index, caption in enumerate(captions):
            start = entry["audio_start"] + span * caption_index
            end = entry["audio_start"] + span * (caption_index + 1)
            rows.extend([str(index), f"{srt_timestamp(start)} --> {srt_timestamp(end)}", caption, ""])
            index += 1
    path.write_text("\n".join(rows), encoding="utf-8-sig")


def render_contact_sheet(previews: list[Image.Image], output: Path) -> None:
    thumb_w, thumb_h = 270, 480
    sheet = Image.new("RGB", (thumb_w * 3, thumb_h * 3), BACKGROUND)
    for index, preview in enumerate(previews):
        thumb = preview.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        sheet.paste(thumb, ((index % 3) * thumb_w, (index // 3) * thumb_h))
    sheet.save(output, quality=94)


def main() -> None:
    args = parse_args()
    promo_dir = Path(__file__).resolve().parent
    root = promo_dir.parent
    storyboard = (promo_dir / args.storyboard).resolve()
    audio_dir = (promo_dir / args.audio_dir).resolve()
    output_dir = (promo_dir / args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    vendor = promo_dir / "vendor"
    sys.path.insert(0, str(vendor))
    import imageio_ffmpeg  # type: ignore

    data = json.loads(storyboard.read_text(encoding="utf-8"))
    scenes = data["scenes"]
    basename = str(data.get("output_basename") or "Dota-Lens-Douyin")
    voiceover = output_dir / f"{basename}-Voiceover.wav"
    timeline = write_voiceover(scenes, audio_dir, voiceover)
    write_srt(timeline, output_dir / f"{basename}-Subtitles.srt")

    sources: dict[str, Image.Image] = {}
    for scene in scenes:
        image_path = (root / scene["image"]).resolve()
        if not image_path.exists():
            raise FileNotFoundError(image_path)
        sources[scene["id"]] = Image.open(image_path).convert("RGBA")

    previews: list[Image.Image] = []
    preview_dir = output_dir / "previews"
    preview_dir.mkdir(exist_ok=True)
    for index, entry in enumerate(timeline):
        preview = render_frame(entry, index, len(timeline), entry["duration"] * 0.55,
                               sources[entry["scene"]["id"]])
        preview.save(preview_dir / f"{index + 1:02d}-{entry['scene']['id']}.jpg", quality=93)
        previews.append(preview)
    render_contact_sheet(previews, output_dir / f"{basename}-Contact-Sheet.jpg")

    cover = previews[0].copy()
    cover_draw = ImageDraw.Draw(cover)
    cover_draw.rounded_rectangle((70, 1165, 1010, 1665), radius=12, fill=(7, 11, 14),
                                 outline=ACCENTS["blue"], width=4)
    cover_config = data.get("cover") or {}
    cover_lines = cover_config.get("lines") or ["你输掉的", "不只是 KDA"]
    y = 1250
    for line in cover_lines:
        cover_draw.text((WIDTH / 2, y), line, anchor="mm", font=font(BOLD, 78), fill=TEXT)
        y += 115
    cover_subtitle = str(cover_config.get("subtitle") or "DOTA 2 逐秒 Replay 复盘")
    cover_draw.text((WIDTH / 2, 1530), cover_subtitle, anchor="mm",
                    font=font(BOLD, 34), fill=ACCENTS["blue"])
    cover.save(output_dir / f"{basename}-Cover.png")

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    silent_video = output_dir / f"{basename}-Silent.mp4"
    final_video = output_dir / f"{basename}.mp4"
    total_duration = timeline[-1]["end"]
    total_frames = math.ceil(total_duration * FPS)
    command = [
        ffmpeg, "-y", "-f", "rawvideo", "-vcodec", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{WIDTH}x{HEIGHT}", "-r", str(FPS), "-i", "-", "-an",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", str(silent_video),
    ]
    encoder = subprocess.Popen(command, stdin=subprocess.PIPE)
    scene_index = 0
    try:
        for frame_number in range(total_frames):
            current = frame_number / FPS
            while scene_index < len(timeline) - 1 and current >= timeline[scene_index]["end"]:
                scene_index += 1
            entry = timeline[scene_index]
            local_time = current - entry["start"]
            frame = render_frame(entry, scene_index, len(timeline), local_time,
                                 sources[entry["scene"]["id"]])
            assert encoder.stdin is not None
            encoder.stdin.write(np.asarray(frame, dtype=np.uint8).tobytes())
            if frame_number % (FPS * 5) == 0:
                print(f"Rendered {current:05.1f}s / {total_duration:05.1f}s", flush=True)
    finally:
        if encoder.stdin:
            encoder.stdin.close()
        return_code = encoder.wait()
    if return_code != 0:
        raise RuntimeError(f"FFmpeg frame encoding failed with code {return_code}")

    subprocess.run([
        ffmpeg, "-y", "-i", str(silent_video), "-i", str(voiceover),
        "-c:v", "copy", "-af", "loudnorm=I=-16:TP=-1.5:LRA=7", "-ar", "48000",
        "-c:a", "aac", "-b:a", "160k", "-shortest",
        "-movflags", "+faststart", str(final_video),
    ], check=True)
    silent_video.unlink(missing_ok=True)
    print(f"Final video: {final_video}")


if __name__ == "__main__":
    main()
