import random

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..models import Card, CardTag, Tag

router = APIRouter(prefix="/exam", tags=["exam"])


class ExamGenerateRequest(BaseModel):
    type: str | None = None  # 'vocab' | 'grammar' | None(all)
    tag: str | None = None
    count: int = 10


class ExamQuestion(BaseModel):
    card_id: int
    direction: str  # 'word2meaning' | 'meaning2word'
    prompt: str
    reading: str | None  # shown after answering, for word prompts
    choices: list[str]
    answer: int  # index into choices (graded client-side; personal tool)


class ExamOut(BaseModel):
    questions: list[ExamQuestion]


def _meaning(card: Card) -> str | None:
    return card.meaning_zh or card.meaning_en


@router.post("/generate", response_model=ExamOut)
def generate(payload: ExamGenerateRequest, session: Session = Depends(get_session)):
    if payload.count < 1 or payload.count > 50:
        raise HTTPException(status_code=422, detail="count must be 1-50")

    stmt = select(Card)
    if payload.type:
        stmt = stmt.where(Card.type == payload.type)
    if payload.tag:
        stmt = (
            stmt.join(CardTag, CardTag.card_id == Card.id)
            .join(Tag, Tag.id == CardTag.tag_id)
            .where(Tag.name == payload.tag)
        )
    pool = [c for c in session.exec(stmt).all() if _meaning(c)]

    # distractors may come from the whole collection when the filtered pool is small
    all_cards = [c for c in session.exec(select(Card)).all() if _meaning(c)]

    if len(pool) < 1 or len(all_cards) < 4:
        raise HTTPException(
            status_code=422,
            detail="出題需要至少 4 張填有意思（中文或英文）的卡片",
        )

    chosen = random.sample(pool, min(payload.count, len(pool)))
    questions: list[ExamQuestion] = []

    for card in chosen:
        direction = random.choice(["word2meaning", "meaning2word"])
        if direction == "word2meaning":
            correct = _meaning(card)
            distractor_pool = list({_meaning(c) for c in all_cards if c.id != card.id and _meaning(c) != correct})
        else:
            correct = card.word
            distractor_pool = list({c.word for c in all_cards if c.id != card.id and c.word != correct})

        if len(distractor_pool) < 3:
            # not enough unique alternatives for this direction; try the other one
            continue

        distractors = random.sample(distractor_pool, 3)
        choices = distractors + [correct]
        random.shuffle(choices)
        questions.append(
            ExamQuestion(
                card_id=card.id,
                direction=direction,
                prompt=card.word if direction == "word2meaning" else _meaning(card),
                reading=card.reading,
                choices=choices,
                answer=choices.index(correct),
            )
        )

    if not questions:
        raise HTTPException(status_code=422, detail="卡片的意思重複度太高，無法產生選項")
    return ExamOut(questions=questions)
