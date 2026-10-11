---
description: Audit a fixture monorepo whose CLAUDE.md files carry six planted defects (see fixture.sh) and one correct control command.
tags: [claude-md-improver]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Bash, Skill, Edit, Write]
---

Audit the CLAUDE.md files in this repo and give me a quality report. Check them against the actual code, not just for style.
