import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from interlinear.manifest import write_manifest

HERE = Path(__file__).resolve().parent
FIX = HERE / "fixtures"
SCRIPT = HERE.parents[1] / "normalize_interlinear.py"


class ManifestTests(unittest.TestCase):
    def test_write_manifest_shape(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "sources.json"
            write_manifest(p, 3, {"berean_tables": {"sha256": "aa"}},
                           {"bible_word": {"asset": "bible-word-v3.tsv.gz", "sha256": "bb", "rows": 5},
                            "bible_lexicon": {"asset": "bible-lexicon-v3.tsv.gz", "sha256": "cc", "rows": 2}})
            m = json.loads(p.read_text())
            self.assertEqual(m["version"], 3)
            self.assertEqual(m["outputs"]["bible_word"]["rows"], 5)
            self.assertTrue(p.read_text().endswith("\n"))

    def test_cli_runs_on_fixtures_and_writes_versioned_outputs(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d)
            proc = subprocess.run(
                [sys.executable, str(SCRIPT),
                 "--berean", str(FIX / "berean_excerpt.tsv"),
                 "--tahot", str(FIX / "tahot_excerpt.txt"), "--tagnt", str(FIX / "tagnt_excerpt.txt"),
                 "--lex-heb", str(FIX / "lexicon_heb_excerpt.txt"), "--lex-grk", str(FIX / "lexicon_grk_excerpt.txt"),
                 "--bsb", str(FIX / "bsb_excerpt.tsv"), "--out-dir", str(out), "--manifest", str(out / "sources.json"),
                 "--version", "1", "--berean-downloaded", "2026-09-24",
                 "--step-tagged-commit", "0f60797c170f11a1f8dc75c5f7617973e2e66b0d",
                 "--step-lexicon-commit", "48b7cfbda441adb6445ea565b4ed23dd98dfdf2e"],
                capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertTrue((out / "bible-word-v1.tsv.gz").exists())
            self.assertTrue((out / "bible-lexicon-v1.tsv.gz").exists())
            m = json.loads((out / "sources.json").read_text())
            self.assertEqual(m["outputs"]["bible_word"]["asset"], "bible-word-v1.tsv.gz")
            self.assertEqual(len(m["outputs"]["bible_word"]["sha256"]), 64)
            self.assertIn("tagged", proc.stdout)


if __name__ == "__main__":
    unittest.main()
