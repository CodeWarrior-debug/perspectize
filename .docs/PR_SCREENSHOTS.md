# PR Screenshots (Release-Hosted)

Screenshots captured during self-verification (see [VERIFICATION.md](VERIFICATION.md), `sv-` prefix) live locally in `/Users/jamesjordan/Downloads/screenshots/` — they aren't committed to the repo. To reference them in a PR, upload them as assets on a dedicated GitHub Release that acts as a permanent asset bucket, then link the resulting URLs in the PR body.

## One-time setup

Check whether the bucket release already exists before creating it:

```bash
gh release view screenshots
```

If it doesn't exist yet, create it once:

```bash
gh release create screenshots \
  --title "Verification Screenshots" \
  --notes "Asset bucket for PR self-verification screenshots. Not a versioned release — do not use for changelog/version tracking." \
  --prerelease
```

## Per-PR workflow

1. **Upload this PR's screenshots** (`--clobber` overwrites same-named assets safely on re-runs):
   ```bash
   gh release upload screenshots /Users/jamesjordan/Downloads/screenshots/sv-<plan>-*.png --clobber
   ```

2. **Get shareable URLs** for just the files you uploaded:
   ```bash
   gh release view screenshots --json assets --jq '.assets[] | select(.name | startswith("sv-<plan>-")) | .browser_download_url'
   ```

3. **Paste them into the PR body's Testing section** as markdown images:
   ```markdown
   ### Screenshots
   | Viewport | Screenshot |
   |---|---|
   | Mobile (375px) | ![mobile](https://github.com/CodeWarrior-debug/perspectize/releases/download/screenshots/sv-01-02-mobile-375px.png) |
   | Tablet (768px) | ![tablet](https://github.com/CodeWarrior-debug/perspectize/releases/download/screenshots/sv-01-03-tablet-768px.png) |
   | Desktop (1280px) | ![desktop](https://github.com/CodeWarrior-debug/perspectize/releases/download/screenshots/sv-01-04-desktop-1280px.png) |
   ```

## Why a release instead of committing the images

- Keeps screenshot binaries out of git history entirely (no repo bloat, no LFS needed)
- GitHub renders release-asset image URLs inline in PR markdown same as any other image
- One persistent `screenshots` release accumulates assets across every PR — no per-PR release/tag needed
- `--clobber` makes re-uploading after a fix idempotent — same filename just replaces the old asset and the PR's existing markdown link keeps working

## Videos

**For interactive behavior — hover states, multi-step flows, popovers that open and close, animations — a video is better than screenshots.** A still can't show that a hover draws a connector, a popover closes on success, or a form syncs as you type. Use screenshots for static layout, video for interaction (often both on the same PR).

Record the running app with [`tools/video-capture`](../tools/video-capture/README.md) (CDP screencast + a venv-bundled ffmpeg; the DevTools MCP itself can't record), or Vitest Browser Mode's opt-in `recordVideo` (see `frontend/CLAUDE.md`). Name videos `sv-<plan>-video-NN-<what>-<width>px.mp4`. The same bucket release hosts them, and upload and URL lookup are identical to screenshots with a different glob:

```bash
gh release upload screenshots /Users/jamesjordan/Downloads/screenshots/sv-<plan>-*.mp4 --clobber
gh release view screenshots --json assets --jq '.assets[] | select(.name | startswith("sv-<plan>-")) | .browser_download_url'
```

### Embedding — GIF preview linked to the mp4

**A `<video>` tag does not work for release assets.** Tested with `gh api markdown` (mode `gfm`): the sanitizer strips `<video src="…releases/download/…mp4" controls>` down to an empty paragraph, and a bare `.mp4` URL renders as a plain link with no player. GitHub only produces an inline player for files dragged into the PR description box in the web UI, which can't be scripted.

What renders inline from a release asset is an **animated GIF**. Make a small preview GIF from the mp4 and embed it as an image that links to the full-quality mp4:

```bash
ffmpeg -i sv-<plan>-video-01-<what>-1280px.mp4 \
  -vf "fps=8,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  sv-<plan>-video-01-<what>-preview.gif
gh release upload screenshots sv-<plan>-video-01-<what>-preview.gif sv-<plan>-video-01-<what>-1280px.mp4 --clobber
```

```markdown
[![What the clip shows](https://github.com/CodeWarrior-debug/perspectize/releases/download/screenshots/sv-<plan>-video-01-<what>-preview.gif)](https://github.com/CodeWarrior-debug/perspectize/releases/download/screenshots/sv-<plan>-video-01-<what>-1280px.mp4)
```

(`ffmpeg` is the binary bundled with the `imageio-ffmpeg` venv described in the video-capture README; screencast clips of mostly-static UI stay under ~1 MB as GIFs.) A short sentence above the embed saying what to look at helps, since a GIF has no controls and loops.

## Required permission

`gh release create`/`gh release upload`/`gh release view` need the `Bash(gh release:*)` allow rule in `.claude/settings.json`.
