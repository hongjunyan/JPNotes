from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..schemas import DictLookupResponse, FuriganaRequest, FuriganaResponse
from ..services import dictionary, furigana

router = APIRouter(prefix="/dict", tags=["dict"])


@router.post("/furigana", response_model=FuriganaResponse)
def suggest_furigana(payload: FuriganaRequest):
    segments = furigana.annotate(payload.text)
    return FuriganaResponse(segments=segments, marked=furigana.to_marked(segments))


@router.get("/lookup", response_model=DictLookupResponse)
def dict_lookup(word: str = Query(min_length=1)):
    return DictLookupResponse(candidates=dictionary.lookup(word))


class KanjiInfo(BaseModel):
    literal: str
    stroke_count: int | None
    grade: int | None
    jlpt: int | None
    freq: int | None
    on: list[str]
    kun: list[str]
    meanings: list[str]


@router.get("/kanji/{char}", response_model=KanjiInfo)
def kanji(char: str):
    info = dictionary.kanji_info(char)
    if info is None:
        raise HTTPException(status_code=404, detail=f"找不到漢字「{char}」的資料")
    return KanjiInfo(**info)
