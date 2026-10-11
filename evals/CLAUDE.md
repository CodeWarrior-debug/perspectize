# evals/

`claude plugin eval` suites. Usage and case docs: [claude-md-audit/README.md](claude-md-audit/README.md).

- Cases must live inside the plugin folder under test: `--eval-dir` rejects absolute paths and dot-dirs (e.g. `.claude`), which is why `claude-md-audit/skills/` vendors the skill.
- A case that grants Bash needs a sandbox backend; cloud containers need `apt-get install -y bubblewrap socat` first or every run is refused.
- `regex` graders only prove a string appears. Use `llm` graders when a defect must be *flagged*, not merely mentioned.
- `--case` takes one glob; repeating the flag keeps only the last.
