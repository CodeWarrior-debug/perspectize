"""Usage: encode.py <framesDir> <out.mp4>  -- turns screencast frames into an mp4 honoring real timing."""
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

frames_dir, out = Path(sys.argv[1]), Path(sys.argv[2])
MAX_GAP = float(sys.argv[3]) if len(sys.argv) > 3 else 1.5  # seconds; longest a still frame may be held
rows = [line.split() for line in (frames_dir / "frames.txt").read_text().splitlines() if line.strip()]
if len(rows) < 2:
    sys.exit(f"need at least 2 frames, got {len(rows)}")

lines = []
for i, (name, ts) in enumerate(rows):
    lines.append(f"file '{frames_dir / name}'")
    dur = (float(rows[i + 1][1]) - float(ts)) if i + 1 < len(rows) else 0.5
    dur = min(dur, MAX_GAP)  # trim idle time between tool calls
    lines.append(f"duration {max(dur, 0.01):.4f}")
lines.append(f"file '{frames_dir / rows[-1][0]}'")  # concat demuxer quirk: repeat last frame

listing = frames_dir / "concat.txt"
listing.write_text("\n".join(lines) + "\n")

subprocess.run(
    [
        imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", str(listing),
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30", "-pix_fmt", "yuv420p",
        "-c:v", "libx264", "-crf", "23", str(out),
    ],
    check=True,
)
print(out, out.stat().st_size, "bytes")
