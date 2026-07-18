from typing import Optional

from pydantic import BaseModel


class NoteCreate(BaseModel):
    title: str
    content: str = ""
    tags: list[str] = []


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[list[str]] = None


class NoteOut(BaseModel):
    id: int
    title: str
    content: str
    tags: list[str]
    created_at: str
    updated_at: str


class NoteListItem(BaseModel):
    id: int
    title: str
    excerpt: str
    tags: list[str]
    updated_at: str


class NoteListOut(BaseModel):
    items: list[NoteListItem]
    total: int


class TagOut(BaseModel):
    id: int
    name: str
    note_count: int
    card_count: int = 0


class FuriganaRequest(BaseModel):
    text: str


class FuriganaSegment(BaseModel):
    surface: str
    reading: Optional[str] = None  # hiragana; None when surface has no kanji


class FuriganaResponse(BaseModel):
    segments: list[FuriganaSegment]
    marked: str  # text with {漢字|かんじ} markers applied


class ImageOut(BaseModel):
    id: str
    url: str
    filename: str


class CardCreate(BaseModel):
    type: str  # 'vocab' | 'grammar'
    word: str
    reading: Optional[str] = None
    meaning_en: Optional[str] = None
    meaning_zh: Optional[str] = None
    pos: Optional[str] = None
    example: Optional[str] = None
    source_note_id: Optional[int] = None
    tags: list[str] = []


class CardUpdate(BaseModel):
    type: Optional[str] = None
    word: Optional[str] = None
    reading: Optional[str] = None
    meaning_en: Optional[str] = None
    meaning_zh: Optional[str] = None
    pos: Optional[str] = None
    example: Optional[str] = None
    source_note_id: Optional[int] = None
    tags: Optional[list[str]] = None


class CardOut(BaseModel):
    id: int
    type: str
    word: str
    reading: Optional[str]
    meaning_en: Optional[str]
    meaning_zh: Optional[str]
    pos: Optional[str]
    example: Optional[str]
    source_note_id: Optional[int]
    source_note_title: Optional[str] = None
    tags: list[str]
    due_date: str
    interval: int
    ease_factor: float
    repetitions: int
    lapses: int
    last_reviewed: Optional[str]
    created_at: str
    updated_at: str


class CardListOut(BaseModel):
    items: list[CardOut]
    total: int


class DictCandidate(BaseModel):
    word: str
    reading: Optional[str]
    pos: Optional[str]
    glosses: list[str]


class DictLookupResponse(BaseModel):
    candidates: list[DictCandidate]


class ReviewQueueOut(BaseModel):
    cards: list[CardOut]
    total: int


class ReviewRequest(BaseModel):
    rating: int  # 1=Again 2=Hard 3=Good 4=Easy
