"""Tests for harvest-prs.py using local fixture text only (no GitHub calls).

Run from this directory: python3 -I -m unittest
"""
import contextlib, importlib.util, io, json, os, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("harvest", os.path.join(HERE, "harvest-prs.py"))
harvest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harvest)

PR1 = """## Summary
Adds thing.

## QA Acceptance Criteria

| # | When | Then | Result | Notes |
|---|------|------|--------|-------|
| 1 | I open the page | I see the list | ✅ | |
| 2 | I click delete | a confirmation appears | | |

## Follow-up Steps

- [ ] DB migration: `migrate up` against prod
- [x] already done step
- [ ] <!-- Additional step -->

## Session Learnings

Proposed diff to `backend/CLAUDE.md`:

```diff
+Always wrap repository errors with context.
+Never log tokens.
```

Proposed diff to `CLAUDE.md`:

```diff
+Use origin/main for diffs, never local main.
```

**Known gaps:**
- Pagination of the activity grid is untested
- Retry on 429 not handled
"""
PR2 = """## Test Plan
- [ ] Verify dark mode on mobile

### Known gaps
- Cursor pagination for search results is missing
"""
PR3 = "No sections here."

PRS = [
    {"number": 10, "title": "feat: a", "body": PR1, "mergedAt": "2026-09-20T10:00:00Z", "url": "u",
     "labels": [{"name": "needs-demo-video"}, {"name": "ready for review"}]},
    {"number": 11, "title": "fix: b", "body": PR2, "mergedAt": "2026-09-21T10:00:00Z", "url": "u",
     "labels": [{"name": "migrations-unapplied"}]},
    {"number": 12, "title": "chore: c", "body": PR3, "mergedAt": "2026-09-22T10:00:00Z", "url": "u", "labels": []},
    {"number": 1, "title": "old", "body": "- [ ] stale", "mergedAt": "2026-01-01T00:00:00Z", "url": "u", "labels": []},
]


class HarvestTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        r = self.tmp.name
        os.makedirs(os.path.join(r, "backend"))
        with open(os.path.join(r, "backend", "CLAUDE.md"), "w") as f:
            f.write("# Backend\n\nAlways wrap repository errors with context.\n")
        with open(os.path.join(r, "CLAUDE.md"), "w") as f:
            f.write("# Root\n")
        with open(os.path.join(r, "FEATURE_BACKLOG.md"), "w") as f:
            f.write("# Backlog\n\n## Cursor pagination for search results\n")
        self.inp = os.path.join(r, "prs.json")
        self.dump(PRS, self.inp)
        self.issues = os.path.join(r, "issues.json")
        self.dump([{"number": 77, "title": "Activity grid pagination is untested"}], self.issues)
        self.files = harvest.read_claude_files(r)

    @staticmethod
    def dump(obj, path):
        with open(path, "w") as fh:
            json.dump(obj, fh)

    def tearDown(self):
        self.tmp.cleanup()

    def items(self, n):
        return harvest.extract(next(p for p in PRS if p["number"] == n), self.files)

    def test_learnings_applied_partial_not_found(self):
        ls = [i for i in self.items(10) if i[0] == "Session Learnings"]
        self.assertEqual(len(ls), 2)
        self.assertIn("[partial] (backend/CLAUDE.md)", ls[0][2])  # one of two lines present
        self.assertIn("[not found] (CLAUDE.md)", ls[1][2])
        full = {"text": "x", "target": "backend/CLAUDE.md", "added": ["Always wrap repository errors with context."]}
        self.assertEqual(harvest.learning_status(full, self.files), "applied")

    def test_unchecked_skips_checked_and_placeholders(self):
        u = [i for i in self.items(10) if i[0] == "Unchecked follow-ups"]
        self.assertEqual(len(u), 1)
        self.assertIn("migrate up", u[0][2])
        self.assertEqual(len([i for i in self.items(11) if i[0] == "Unchecked follow-ups"]), 1)

    def test_qa_rows_without_result(self):
        q = [i for i in self.items(10) if i[0] == "QA rows without a result"]
        self.assertEqual(len(q), 1)
        self.assertIn("click delete", q[0][2])

    def test_known_gaps_bold_and_heading(self):
        self.assertEqual(len([i for i in self.items(10) if i[0] == "Known gaps"]), 2)
        self.assertEqual(len([i for i in self.items(11) if i[0] == "Known gaps"]), 1)

    def test_labels(self):
        self.assertEqual([i[2].split(":")[0] for i in self.items(10) if i[0] == "Leftover labels"],
                         ["needs-demo-video"])
        self.assertEqual([i[2].split(":")[0] for i in self.items(11) if i[0] == "Leftover labels"],
                         ["migrations-unapplied"])
        self.assertEqual(self.items(12), [])

    def run_main(self, *extra):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            harvest.main(["--since", "2026-09-01", "--md", "--input", self.inp,
                          "--repo-root", self.tmp.name, *extra])
        return buf.getvalue()

    def test_digest_dedupe_and_since(self):
        out = self.run_main("--issues", self.issues)
        self.assertIn("# Merged-PR harvest since 2026-09-01 (3 PRs", out)
        self.assertNotIn("stale", out)
        self.assertIn("Pagination of the activity grid is untested", out)
        self.assertIn("possibly tracked: #77", out)
        self.assertIn("possibly tracked: backlog", out)

    def test_no_issues_file_means_no_issue_match(self):
        self.assertNotIn("#77", self.run_main())


if __name__ == "__main__":
    unittest.main()
