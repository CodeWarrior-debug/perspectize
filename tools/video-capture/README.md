# video-capture

Record a video of the running app for PR evidence. Use it when the behavior is **interactive** (hover states, multi-step flows, popovers that open and close, animations) — a screenshot can't show that. For static layout, keep using screenshots. See [VERIFICATION.md](../../.docs/VERIFICATION.md) §4.

Local-only, like the rest of browser verification: it attaches to the signed-in `sv-chrome` browser (port 9222, see `.claude/scripts/sv-chrome.sh`). Never sign in from here.

## Why this exists

There is no built-in recorder: the Chrome DevTools MCP can't record, `screencapture -v` needs a screen-recording permission the terminal doesn't have, and `ffmpeg` isn't installed. So:

- `record.mjs` — attaches to the page over CDP and saves screencast frames (`Page.startScreencast`) plus their timestamps. Node 22+ (global `WebSocket`), no npm deps.
- `mouse.mjs` — real, trusted mouse/keyboard input over CDP (smooth eased moves, click, type, key). Needed for genuine hover states; also what makes the pointer visible in the video.
- `encode.py` — turns the frames into an H.264 mp4 honoring real timing, with idle gaps capped (default 1.5 s) so time spent between tool calls is trimmed away.

## Setup (once per machine, throwaway venv)

```bash
python3 -m venv /tmp/perspectize-video-venv
/tmp/perspectize-video-venv/bin/pip install imageio-ffmpeg   # bundles an ffmpeg binary; nothing installed system-wide
```

## Record

1. Set the viewport (`emulate` on the MCP, e.g. `1280x900x1`) and load the page.
2. Inject a visible pointer (a screencast has no cursor) via `evaluate_script`:
   ```js
   () => { const c=document.createElement('div'); c.id='__ds_cursor';
     c.style.cssText='position:fixed;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(239,68,68,.55);border:2px solid #ef4444;z-index:2147483647;pointer-events:none';
     document.body.appendChild(c);
     addEventListener('mousemove',e=>{c.style.left=e.clientX+'px';c.style.top=e.clientY+'px';},true); }
   ```
   (Navigation removes it; re-inject after a full page load.)
3. Start the recorder in the background, drive the flow, then stop it:
   ```bash
   node tools/video-capture/record.mjs /tmp/vid-frames localhost:5173     # run in the background
   node tools/video-capture/mouse.mjs localhost:5173 click 1086 32        # each step is its own call
   node tools/video-capture/mouse.mjs localhost:5173 type "Psalm 139:1-10"
   touch /tmp/vid-frames/STOP                                              # finalizes frames.txt
   ```
   Find click coordinates with `evaluate_script` + `getBoundingClientRect()`.
4. Encode and preview:
   ```bash
   /tmp/perspectize-video-venv/bin/python3 tools/video-capture/encode.py /tmp/vid-frames ~/Downloads/screenshots/sv-<plan>-video-01-<what>-1280px.mp4 1.5
   ```

Frames are only emitted when the page changes, so a static page produces very few frames — that is expected.

## Embed in a PR

GitHub strips `<video>` for release assets and shows a bare `.mp4` URL as a plain link (tested with `gh api markdown`). What works inline is an animated GIF that links to the mp4 — see [PR_SCREENSHOTS.md](../../.docs/PR_SCREENSHOTS.md#videos).
