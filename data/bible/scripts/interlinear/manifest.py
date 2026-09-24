import json
from pathlib import Path


def write_manifest(path, version, sources, outputs):
    doc = {"version": version, "sources": sources, "outputs": outputs}
    Path(path).write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
