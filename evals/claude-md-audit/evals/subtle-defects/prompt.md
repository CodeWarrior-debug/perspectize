---
description: Harder fixture — defects need cross-file or code reading (S1-S6), plus look-wrong-but-correct traps (T1-T3). See fixture.sh.
tags: [claude-md-improver]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Skill, Edit, Write]
---

Audit the CLAUDE.md files in this repo and give me a quality report. Check them against the actual code, not just for style.
