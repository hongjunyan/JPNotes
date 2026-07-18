"""Fetch the JMdict/KanjiDic2 SQLite database into <repo>/db_data/jamdict/.

The jamdict-data pip package is broken on Windows (file-lock bug in its
setup.py) and would bloat the docker image anyway, so both local dev and
docker read the dictionary from the shared data directory instead:
run this once, then the backend finds it at db_data/jamdict/jamdict.db.
"""

import json
import lzma
import shutil
import tarfile
import tempfile
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
TARGET = REPO_ROOT / "db_data" / "jamdict" / "jamdict.db"


def main() -> None:
    if TARGET.is_file():
        print(f"already exists: {TARGET} ({TARGET.stat().st_size / 1e6:.1f} MB)")
        return

    meta = json.load(urllib.request.urlopen("https://pypi.org/pypi/jamdict-data/json"))
    sdist = next(u for u in meta["urls"] if u["packagetype"] == "sdist")
    print(f"downloading {sdist['url']} ({sdist['size'] / 1e6:.1f} MB)")

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tar_path = Path(tmp) / "jamdict-data.tar.gz"
        urllib.request.urlretrieve(sdist["url"], tar_path)
        print("downloaded, extracting...")
        with tarfile.open(tar_path) as tf:
            member = next(m for m in tf.getmembers() if m.name.endswith("jamdict.db.xz"))
            tf.extract(member, tmp, filter="data")
            print("decompressing...")
            with lzma.open(Path(tmp) / member.name) as src, open(TARGET, "wb") as dst:
                shutil.copyfileobj(src, dst)

    print(f"done: {TARGET} ({TARGET.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
