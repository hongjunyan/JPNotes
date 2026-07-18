"""Offline JMdict lookup via jamdict, for prefilling card fields."""

import threading
from pathlib import Path

from ..config import settings

# One Jamdict (and thus one SQLite connection) per thread: FastAPI runs sync
# endpoints in a threadpool, and sqlite3 connections must stay on their thread.
_local = threading.local()


def _jam():
    jam = getattr(_local, "jam", None)
    if jam is None:
        from jamdict import Jamdict

        db = Path(settings.jamdict_db)
        if db.is_file():
            # dictionary DB lives in the shared data dir (db_data/jamdict/)
            jam = Jamdict(db_file=str(db), kd2_file=str(db))
        else:
            # fall back to jamdict-data package or ~/.jamdict/data/
            jam = Jamdict()
        _local.jam = jam
    return jam


def lookup(word: str, limit: int = 5) -> list[dict]:
    """Return candidate entries: [{word, reading, pos, glosses}]."""
    word = word.strip()
    if not word:
        return []
    try:
        result = _jam().lookup(word)
    except Exception:
        return []

    candidates = []
    for entry in result.entries[:limit]:
        kanji = [k.text for k in entry.kanji_forms]
        kana = [k.text for k in entry.kana_forms]
        glosses: list[str] = []
        pos_list: list[str] = []
        for sense in entry.senses:
            glosses.append("; ".join(g.text for g in sense.gloss))
            for p in sense.pos:
                if p not in pos_list:
                    pos_list.append(p)
        candidates.append(
            {
                "word": kanji[0] if kanji else (kana[0] if kana else word),
                "reading": kana[0] if kana else None,
                "pos": ", ".join(pos_list[:3]) or None,
                "glosses": glosses,
            }
        )
    return candidates


def kanji_info(char: str) -> dict | None:
    """KanjiDic2 info for a single kanji: readings, meanings, strokes, level."""
    try:
        result = _jam().lookup(char)
    except Exception:
        return None
    for c in result.chars:
        if c.literal != char:
            continue
        on: list[str] = []
        kun: list[str] = []
        meanings: list[str] = []
        for rm in c.rm_groups:
            for r in rm.readings:
                if r.r_type == "ja_on":
                    on.append(r.value)
                elif r.r_type == "ja_kun":
                    kun.append(r.value)
            for m in rm.meanings:
                if not m.m_lang:  # English
                    meanings.append(m.value)
        return {
            "literal": c.literal,
            "stroke_count": c.stroke_count,
            "grade": getattr(c, "grade", None),
            "jlpt": getattr(c, "jlpt", None),
            "freq": getattr(c, "freq", None),
            "on": on,
            "kun": kun,
            "meanings": meanings,
        }
    return None
