---
type: regex
pattern: make seed|`seed`|seed target
flags: i
match: contains
target: last_message
---
D2: flags `make seed` as a Makefile target that does not exist.
