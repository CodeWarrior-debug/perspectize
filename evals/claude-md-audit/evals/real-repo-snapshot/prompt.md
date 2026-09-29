---
description: perspectize itself at a pinned commit (see fixture.sh); graders hold seven verified real defects (R1-R7) and correct controls.
tags: [claude-md-improver, real-repo]
runs: 3
max_turns: 80
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Skill, Edit, Write]
---

Audit the CLAUDE.md files in this repo and give me a quality report. Check them against the actual code, not just for style.
