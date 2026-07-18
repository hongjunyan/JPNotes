from typing import Optional

from sqlmodel import Field, SQLModel


class Note(SQLModel, table=True):
    __tablename__ = "notes"

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    content: str = ""
    created_at: str
    updated_at: str


class Tag(SQLModel, table=True):
    __tablename__ = "tags"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)


class NoteTag(SQLModel, table=True):
    __tablename__ = "note_tags"

    note_id: int = Field(foreign_key="notes.id", primary_key=True)
    tag_id: int = Field(foreign_key="tags.id", primary_key=True)


class Card(SQLModel, table=True):
    __tablename__ = "cards"

    id: Optional[int] = Field(default=None, primary_key=True)
    type: str = Field(index=True)  # 'vocab' | 'grammar'
    word: str
    reading: Optional[str] = None
    meaning_en: Optional[str] = None
    meaning_zh: Optional[str] = None
    pos: Optional[str] = None
    example: Optional[str] = None
    source_note_id: Optional[int] = Field(default=None, foreign_key="notes.id")

    # SRS (SM-2)
    due_date: str = Field(index=True)  # ISO date; new cards are due immediately
    interval: int = 0
    ease_factor: float = 2.5
    repetitions: int = 0
    lapses: int = 0
    last_reviewed: Optional[str] = None

    created_at: str
    updated_at: str


class CardTag(SQLModel, table=True):
    __tablename__ = "card_tags"

    card_id: int = Field(foreign_key="cards.id", primary_key=True)
    tag_id: int = Field(foreign_key="tags.id", primary_key=True)


class ReviewLog(SQLModel, table=True):
    __tablename__ = "review_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    card_id: int = Field(foreign_key="cards.id", index=True)
    rating: int  # 1=Again 2=Hard 3=Good 4=Easy
    reviewed_at: str = Field(index=True)


class Image(SQLModel, table=True):
    __tablename__ = "images"

    id: str = Field(primary_key=True)
    filename: str
    mime: str
    created_at: str
