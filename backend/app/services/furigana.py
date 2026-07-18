"""Furigana suggestion: text -> segments with hiragana readings for kanji parts.

Uses fugashi (MeCab) with unidic-lite. Readings come back in katakana and are
converted to hiragana. For tokens that mix kanji and okurigana (e.g. 食べる),
the common kana prefix/suffix is stripped so the ruby only covers the kanji:
食べる -> {食|た}べる.
"""

from functools import lru_cache

from fugashi import Tagger

from ..schemas import FuriganaSegment


@lru_cache(maxsize=1)
def _tagger() -> Tagger:
    return Tagger()


def _kata_to_hira(text: str) -> str:
    return "".join(
        chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in text
    )


def _has_kanji(text: str) -> bool:
    return any(
        "一" <= c <= "鿿" or c in "々〆ヵヶ" for c in text
    )


def _token_reading(word) -> str | None:
    f = word.feature
    reading = getattr(f, "kana", None) or getattr(f, "pron", None)
    if not reading or reading == "*":
        return None
    return _kata_to_hira(reading)


def _split_okurigana(surface: str, reading: str) -> tuple[str, str, str, str]:
    """Return (prefix, core_surface, core_reading, suffix) where prefix/suffix
    are kana shared by surface and reading, and core covers the kanji."""
    hira_surface = _kata_to_hira(surface)

    prefix_len = 0
    while (
        prefix_len < len(surface) - 1
        and prefix_len < len(reading) - 1
        and not _has_kanji(surface[prefix_len])
        and hira_surface[prefix_len] == reading[prefix_len]
    ):
        prefix_len += 1

    suffix_len = 0
    while (
        suffix_len < len(surface) - prefix_len - 1
        and suffix_len < len(reading) - prefix_len - 1
        and not _has_kanji(surface[-1 - suffix_len])
        and hira_surface[-1 - suffix_len] == reading[-1 - suffix_len]
    ):
        suffix_len += 1

    core_surface = surface[prefix_len : len(surface) - suffix_len]
    core_reading = reading[prefix_len : len(reading) - suffix_len]
    prefix = surface[:prefix_len]
    suffix = surface[len(surface) - suffix_len :] if suffix_len else ""
    return prefix, core_surface, core_reading, suffix


def annotate(text: str) -> list[FuriganaSegment]:
    """Tokenize text and return segments; kanji-bearing segments get a reading."""
    segments: list[FuriganaSegment] = []

    def push(surface: str, reading: str | None = None) -> None:
        if not surface:
            return
        if reading is None and segments and segments[-1].reading is None:
            segments[-1].surface += surface
        else:
            segments.append(FuriganaSegment(surface=surface, reading=reading))

    for word in _tagger()(text):
        space = getattr(word, "white_space", "") or ""
        if space:
            push(space)
        surface = word.surface
        if not _has_kanji(surface):
            push(surface)
            continue
        reading = _token_reading(word)
        if not reading:
            push(surface)
            continue
        prefix, core_s, core_r, suffix = _split_okurigana(surface, reading)
        push(prefix)
        push(core_s, core_r)
        push(suffix)

    return segments


def to_marked(segments: list[FuriganaSegment]) -> str:
    """Render segments back to text with {漢字|かんじ} markers."""
    parts = []
    for seg in segments:
        if seg.reading:
            parts.append(f"{{{seg.surface}|{seg.reading}}}")
        else:
            parts.append(seg.surface)
    return "".join(parts)
