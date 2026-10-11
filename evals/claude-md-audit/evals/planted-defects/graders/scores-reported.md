---
type: regex
pattern: (\d{1,3}\s*/\s*100[\s\S]*){3}
match: contains
target: last_message
---
Report gives at least three /100 scores (one per CLAUDE.md file, skill Phase 3 format).
