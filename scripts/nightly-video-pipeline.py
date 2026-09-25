#!/usr/bin/env python3
"""
scripts/nightly-video-pipeline.py — RobOS Nightly Video Production Engine

Converts raw test or demo recordings (MP4/WebM) into broadcast-ready:
1. YouTube Landscape (16:9, 1920x1080, Loudness-Normalized, 1280x720 Thumbnail, Chapters/Tags)
2. TikTok / YouTube Shorts / Reels (9:16, 1080x1920, Ambient Blur Backdrop, Top Hook Banner, Subtitles, Cover)
"""

from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import time

try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


FONTS_SEARCH_DIRS = [
    Path.home() / ".local/share/fonts/google",
    Path.home() / ".local/share/fonts",
    Path("/usr/share/fonts/truetype"),
    Path("/usr/share/fonts/opentype"),
    Path("/usr/share/fonts"),
]

def find_font(preferred_names: list[str]) -> Path | None:
    for name in preferred_names:
        for search_dir in FONTS_SEARCH_DIRS:
            if not search_dir.exists():
                continue
            for font_file in search_dir.glob(f"**/*{name}*.ttf"):
                return font_file
            for font_file in search_dir.glob(f"**/*{name}*.otf"):
                return font_file
    return None


def get_video_info(input_path: Path) -> dict:
    """Probe duration, width, height, fps, has_audio."""
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", "-show_streams", str(input_path)
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
    data = json.loads(res.stdout)
    
    video_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), None)
    audio_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), None)
    
    duration = float(data.get("format", {}).get("duration", 0))
    if duration == 0 and video_stream:
        duration = float(video_stream.get("duration", 0))
        
    width = int(video_stream.get("width", 1920)) if video_stream else 1920
    height = int(video_stream.get("height", 1080)) if video_stream else 1080
    
    return {
        "duration": duration,
        "width": width,
        "height": height,
        "has_audio": audio_stream is not None,
        "format": data.get("format", {}),
    }


def extract_snapshot_frame(video_path: Path, timestamp_sec: float, out_img: Path) -> Path:
    """Extract a single frame from the video at timestamp_sec."""
    out_img.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y", "-ss", f"{timestamp_sec:.2f}",
        "-i", str(video_path),
        "-frames:v", "1",
        "-q:v", "2",
        str(out_img)
    ]
    subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    return out_img


def generate_youtube_thumbnail(
    frame_path: Path,
    out_path: Path,
    title: str,
    badge: str = "RobOS Devlog",
    subtitle: str = "Automated AI Verification"
) -> Path:
    """Compose a 1280x720 YouTube thumbnail with bold text overlays."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if not PIL_AVAILABLE or not frame_path.exists():
        return out_path

    img = Image.open(frame_path).convert("RGBA").resize((1280, 720), Image.Resampling.LANCZOS)
    
    # Dark gradient vignette on left and bottom
    overlay = Image.new("RGBA", (1280, 720), (0, 0, 0, 0))
    draw_ov = ImageDraw.Draw(overlay)
    
    # Left dark gradient for text legibility
    for x in range(800):
        alpha = int(220 * (1 - (x / 800.0) ** 1.3))
        draw_ov.line([(x, 0), (x, 720)], fill=(10, 15, 30, alpha))
        
    # Bottom vignette
    for y in range(450, 720):
        alpha = int(180 * ((y - 450) / 270.0) ** 1.5)
        draw_ov.line([(0, y), (1280, y)], fill=(10, 15, 30, alpha))
        
    img = Image.alpha_composite(img, overlay)
    draw = ImageDraw.Draw(img)
    
    font_bold = find_font(["BebasNeue", "Montserrat-ExtraBold", "Montserrat-Bold", "LiberationSans-Bold"])
    font_sub = find_font(["Montserrat-Bold", "LiberationSans-Bold", "DejaVuSans-Bold"])
    
    f_badge = ImageFont.truetype(str(font_sub), 26) if font_sub else ImageFont.load_default()
    f_title = ImageFont.truetype(str(font_bold), 72) if font_bold else ImageFont.load_default()
    f_sub = ImageFont.truetype(str(font_sub), 32) if font_sub else ImageFont.load_default()
    
    # 1. Category Badge
    bx, by = 60, 65
    badge_text = f" {badge.upper()} "
    bbox = draw.textbbox((bx, by), badge_text, font=f_badge)
    pad = 8
    draw.rounded_rectangle(
        [bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad],
        radius=6, fill=(0, 188, 212, 230)
    )
    draw.text((bx, by), badge_text, font=f_badge, fill=(10, 15, 30, 255))
    
    # 2. Main Title (multi-line word wrap if needed)
    words = title.upper().split()
    lines = []
    curr = ""
    for w in words:
        test = (curr + " " + w).strip()
        if len(test) <= 20 or not curr:
            curr = test
        else:
            lines.append(curr)
            curr = w
    if curr:
        lines.append(curr)
        
    ty = 160
    for line in lines[:3]:
        # Drop shadow
        draw.text((64, ty + 4), line, font=f_title, fill=(0, 0, 0, 240))
        # Main text (yellow or cyan accent on first line, crisp white on rest)
        fill_col = (255, 215, 0, 255) if ty == 160 else (255, 255, 255, 255)
        draw.text((60, ty), line, font=f_title, fill=fill_col)
        ty += 80
        
    # 3. Subtitle / Callout Footer
    if subtitle:
        sy = 630
        draw.text((62, sy + 2), subtitle, font=f_sub, fill=(0, 0, 0, 220))
        draw.text((60, sy), subtitle, font=f_sub, fill=(0, 229, 255, 255))
        
    img.convert("RGB").save(out_path, "JPEG", quality=95)
    return out_path


def generate_tiktok_cover(
    frame_path: Path,
    out_path: Path,
    title: str,
    badge: str = "DEVLOG"
) -> Path:
    """Compose a 1080x1920 vertical TikTok/Shorts cover poster."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if not PIL_AVAILABLE or not frame_path.exists():
        return out_path

    orig = Image.open(frame_path).convert("RGBA")
    
    # 1. Background: blurred ambient copy
    bg = orig.resize((1080, 1920), Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(radius=30))
    # Dim background
    darken = Image.new("RGBA", (1080, 1920), (10, 15, 30, 160))
    bg = Image.alpha_composite(bg, darken)
    
    # 2. Foreground: centered crisp 1080x608
    fg = orig.resize((1080, 608), Image.Resampling.LANCZOS)
    bg.paste(fg, (0, 656))
    
    # 3. Top Banner
    draw = ImageDraw.Draw(bg)
    font_bold = find_font(["BebasNeue", "Montserrat-ExtraBold", "LiberationSans-Bold"])
    font_sub = find_font(["Montserrat-Bold", "LiberationSans-Bold"])
    
    f_badge = ImageFont.truetype(str(font_sub), 36) if font_sub else ImageFont.load_default()
    f_title = ImageFont.truetype(str(font_bold), 92) if font_bold else ImageFont.load_default()
    
    # Top badge
    draw.rounded_rectangle([340, 220, 740, 280], radius=12, fill=(0, 188, 212, 230))
    draw.text((540, 250), badge.upper(), font=f_badge, fill=(10, 15, 30, 255), anchor="mm")
    
    # Hook Title
    words = title.upper().split()
    lines = []
    curr = ""
    for w in words:
        test = (curr + " " + w).strip()
        if len(test) <= 15 or not curr:
            curr = test
        else:
            lines.append(curr)
            curr = w
    if curr:
        lines.append(curr)
        
    ty = 330
    for line in lines[:3]:
        draw.text((542, ty + 4), line, font=f_title, fill=(0, 0, 0, 240), anchor="mm")
        draw.text((540, ty), line, font=f_title, fill=(255, 235, 59, 255), anchor="mm")
        ty += 105
        
    # Lower third CTA
    draw.text((540, 1500), "SWIPE FOR CODE & E2E REVIEWS", font=f_badge, fill=(255, 255, 255, 220), anchor="mm")
    
    bg.convert("RGB").save(out_path, "JPEG", quality=95)
    return out_path


def process_youtube_video(
    input_path: Path,
    out_video: Path,
    info: dict
) -> Path:
    """Render 16:9 YouTube MP4 with loudnorm and faststart."""
    out_video.parent.mkdir(parents=True, exist_ok=True)
    
    cmd = ["ffmpeg", "-y", "-i", str(input_path)]
    
    if not info["has_audio"]:
        cmd.extend(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"])
        cmd.extend(["-map", "0:v", "-map", "1:a"])
    else:
        cmd.extend(["-map", "0:v", "-map", "0:a"])

    # Scale/pad to 1920x1080 if not already matching
    cmd.extend([
        "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "19",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart"
    ])
    
    if info["has_audio"]:
        cmd.extend([
            "-af", "loudnorm=I=-14:LRA=11:TP=-1.5",
            "-c:a", "aac",
            "-b:a", "192k"
        ])
    else:
        cmd.extend([
            "-shortest",
            "-c:a", "aac",
            "-b:a", "192k"
        ])
        
    cmd.append(str(out_video))
    print(f"  [YouTube] Encoding 1080p landscape video to {out_video.name}...")
    subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    return out_video


def process_tiktok_video(
    input_path: Path,
    out_video: Path,
    info: dict,
    title: str,
    max_duration: float = 58.0
) -> Path:
    """Render 9:16 vertical video (1080x1920) with ambient blur and top hook header."""
    out_video.parent.mkdir(parents=True, exist_ok=True)
    
    duration = min(info["duration"], max_duration) if info["duration"] > 0 else max_duration
    
    # Escape title for ffmpeg drawtext
    clean_title = re.sub(r"['\":\\]", "", title).strip()
    
    # FFmpeg filter complex:
    # 1. bg: scale to 1080x1920 cropped + boxblur + darken
    # 2. fg: scale 1080x608 centered
    # 3. overlay fg on bg
    # 4. drawtext hook banner
    filter_complex = (
        "[0:v]split=2[bg_in][fg_in];"
        "[bg_in]scale=360:640:force_original_aspect_ratio=increase,crop=360:640,boxblur=12:3,scale=1080:1920,colorchannelmixer=rr=0.35:gg=0.35:bb=0.35[bg];"
        "[fg_in]scale=1080:608:force_original_aspect_ratio=decrease[fg];"
        "[bg][fg]overlay=(W-w)/2:(H-h)/2[base];"
        f"[base]drawbox=x=40:y=180:w=1000:h=180:color=black@0.7:t=fill,"
        f"drawbox=x=40:y=180:w=1000:h=6:color=#00bcd4:t=fill,"
        f"drawtext=text='{clean_title}':font='Montserrat':fontsize=48:fontcolor=yellow:x=(w-text_w)/2:y=245[outv]"
    )
    
    cmd = ["ffmpeg", "-y"]
    if duration > 0:
        cmd.extend(["-t", f"{duration:.2f}"])
        
    cmd.extend(["-i", str(input_path)])
    
    if not info["has_audio"]:
        cmd.extend(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"])
        cmd.extend(["-filter_complex", filter_complex, "-map", "[outv]", "-map", "1:a", "-shortest"])
    else:
        cmd.extend(["-filter_complex", filter_complex, "-map", "[outv]", "-map", "0:a"])
        cmd.extend(["-af", "loudnorm=I=-14:LRA=11:TP=-1.5"])
        
    cmd.extend([
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "21",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        str(out_video)
    ])
    
    print(f"  [TikTok] Encoding 9:16 vertical video ({duration:.1f}s) to {out_video.name}...")
    subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    return out_video


def build_publishing_metadata(
    slug: str,
    title: str,
    badge: str,
    duration_sec: float,
    out_dir: Path
) -> dict:
    """Create YouTube & TikTok publishing metadata JSON files."""
    yt_meta = {
        "title": f"{title} | RobOS Autonomous Devlog",
        "titleAlternatives": [
            f"How We Automated Testing in Godot 4: {title}",
            f"{title} (Zero-Click AI Dev Suite)",
            f"Stress-Testing Game Rulesets with AI: {title}"
        ],
        "description": f"""Building reliable architectures and tactical isometric RPGs requires proof-of-work, not blind assumptions.

In this automated walkthrough, the RobOS harness executes and audits {title} end-to-end with zero manual clicks.

Timestamps & Chapters:
0:00 - Introduction & Architecture Overview
0:25 - Autonomous Scenario Setup & GameState Verification
1:10 - Execution & Headless Visual Proof-of-Work
{f'{int(duration_sec // 60)}:{int(duration_sec % 60):02d} - Telemetry Review & Verification' if duration_sec > 70 else '1:45 - Telemetry Review & Verification'}

Tech Stack:
- Platform: RobOS Knowledge Graph Architecture
- Engine: Godot 4.3 (GL Compatibility)
- Ruleset: D&D 5e SRD + Infinity Engine RTwP
- Testing: Headless Xvfb + BDD Behave Cucumber + FFmpeg 1080p

Learn more: https://github.com/nddipiazza/robos
""",
        "tags": [
            "robos", "godot4", "indiedev", "ai agents", "software engineering",
            "gamedev", "python", "cucumber", "test automation", "rpg", "devlog"
        ],
        "categoryId": "28", # Science & Tech
        "privacyStatus": "public",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
    
    tt_meta = {
        "caption": f"Stress-testing {title} with autonomous AI agents in #godot4 & #robos 🤖⚔️ Zero clicks, 100% verified.",
        "hashtags": [
            "#gamedev", "#indiedev", "#godotengine", "#programming",
            "#softwareengineer", "#ai", "#gamedevelopment", "#devlog"
        ],
        "soundRecommendation": "Original Sound - RobOS Autonomous Devlog (or trending upbeat ambient tech)",
        "optimalPostingTimes": ["12:00 PM EST", "7:00 PM EST"],
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
    
    yt_file = out_dir / f"{slug}-youtube-metadata.json"
    tt_file = out_dir / f"{slug}-tiktok-metadata.json"
    desc_file = out_dir / f"{slug}-youtube-description.txt"
    
    yt_file.write_text(json.dumps(yt_meta, indent=2), encoding="utf-8")
    tt_file.write_text(json.dumps(tt_meta, indent=2), encoding="utf-8")
    desc_file.write_text(yt_meta["description"], encoding="utf-8")
    
    return {"youtube": yt_file, "tiktok": tt_file}


def main():
    parser = argparse.ArgumentParser(description="RobOS Nightly Video Production Engine")
    parser.add_argument("--input", "-i", required=True, help="Input video file (.mp4, .webm)")
    parser.add_argument("--output-dir", "-o", default=None, help="Directory for deliverables")
    parser.add_argument("--slug", "-s", default=None, help="Output identifier slug")
    parser.add_argument("--title", "-t", default=None, help="Video title")
    parser.add_argument("--badge", "-b", default="RobOS Devlog", help="Category badge text")
    parser.add_argument("--subtitle", default="Autonomous AI Verification", help="Thumbnail subtitle")
    parser.add_argument("--skip-youtube", action="store_true", help="Skip 16:9 YouTube generation")
    parser.add_argument("--skip-tiktok", action="store_true", help="Skip 9:16 TikTok generation")
    parser.add_argument("--max-duration-shorts", type=float, default=58.0, help="Max duration for TikTok/Shorts (sec)")
    
    args = parser.parse_args()
    
    input_path = Path(args.input).resolve()
    if not input_path.exists():
        print(f"Error: input file does not exist: {input_path}", file=sys.stderr)
        sys.exit(1)
        
    slug = args.slug or input_path.stem.replace(" ", "-").lower()
    title = args.title or input_path.stem.replace("-", " ").replace("_", " ").title()
    
    out_dir = Path(args.output_dir).resolve() if args.output_dir else input_path.parent / f"{slug}-deliverables"
    out_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"==================================================")
    print(f"      RobOS Nightly Video Production Engine       ")
    print(f"==================================================")
    print(f"Input:       {input_path}")
    print(f"Title:       {title}")
    print(f"Output Dir:  {out_dir}")
    print(f"")
    
    # 1. Probe input video
    print(f"[1/4] Probing input media...")
    info = get_video_info(input_path)
    print(f"  Resolution: {info['width']}x{info['height']}")
    print(f"  Duration:   {info['duration']:.2f}s")
    print(f"  Has Audio:  {info['has_audio']}")
    print(f"")
    
    # 2. Extract snapshot frame for thumbnails
    print(f"[2/4] Capturing preview frames...")
    snap_time = min(max(3.0, info["duration"] * 0.4), info["duration"] - 0.5) if info["duration"] > 5 else 1.0
    snap_frame = out_dir / f"{slug}-raw-frame.png"
    extract_snapshot_frame(input_path, snap_time, snap_frame)
    
    yt_thumb = out_dir / f"{slug}-youtube-thumbnail.jpg"
    generate_youtube_thumbnail(snap_frame, yt_thumb, title, args.badge, args.subtitle)
    print(f"  [✓] YouTube Thumbnail: {yt_thumb.name} (1280x720)")
    
    tt_cover = out_dir / f"{slug}-tiktok-cover.jpg"
    generate_tiktok_cover(snap_frame, tt_cover, title, args.badge)
    print(f"  [✓] TikTok Cover:      {tt_cover.name} (1080x1920)")
    print(f"")
    
    # 3. Process video formats
    print(f"[3/4] Processing multi-format deliverables...")
    if not args.skip_youtube:
        yt_video = out_dir / f"{slug}-youtube-1080p.mp4"
        process_youtube_video(input_path, yt_video, info)
        print(f"  [✓] YouTube Video:     {yt_video.name} (1920x1080)")
        
    if not args.skip_tiktok:
        tt_video = out_dir / f"{slug}-tiktok-vertical.mp4"
        process_tiktok_video(input_path, tt_video, info, title, args.max_duration_shorts)
        print(f"  [✓] TikTok Video:      {tt_video.name} (1080x1920)")
    print(f"")
    
    # 4. Generate Metadata
    print(f"[4/4] Writing publishing metadata...")
    meta_files = build_publishing_metadata(slug, title, args.badge, info["duration"], out_dir)
    print(f"  [✓] YouTube Metadata:  {meta_files['youtube'].name}")
    print(f"  [✓] TikTok Metadata:   {meta_files['tiktok'].name}")
    print(f"")
    
    print(f"==================================================")
    print(f"✔ All nightly video deliverables ready in:")
    print(f"  {out_dir}")
    print(f"==================================================")


if __name__ == "__main__":
    main()
