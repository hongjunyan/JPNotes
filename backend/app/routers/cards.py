from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlmodel import Session, select

from ..db import get_session
from ..models import Card, CardTag, Note, Tag
from ..schemas import CardCreate, CardListOut, CardOut, CardUpdate
from ..services import cleanup

router = APIRouter(prefix="/cards", tags=["cards"])

CARD_TYPES = {"vocab", "grammar"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _card_tags(session: Session, card_id: int) -> list[str]:
    rows = session.exec(
        select(Tag.name).join(CardTag, CardTag.tag_id == Tag.id).where(CardTag.card_id == card_id)
    ).all()
    return sorted(rows)


def _set_tags(session: Session, card_id: int, names: list[str]) -> None:
    session.execute(text("DELETE FROM card_tags WHERE card_id = :cid"), {"cid": card_id})
    for raw in names:
        name = raw.strip()
        if not name:
            continue
        tag = session.exec(select(Tag).where(Tag.name == name)).first()
        if tag is None:
            tag = Tag(name=name)
            session.add(tag)
            session.flush()
        session.add(CardTag(card_id=card_id, tag_id=tag.id))


def to_out(session: Session, card: Card) -> CardOut:
    title = None
    if card.source_note_id is not None:
        note = session.get(Note, card.source_note_id)
        title = note.title if note else None
    return CardOut(
        **card.model_dump(),
        source_note_title=title,
        tags=_card_tags(session, card.id),
    )


def _validate_type(card_type: str) -> None:
    if card_type not in CARD_TYPES:
        raise HTTPException(status_code=422, detail=f"type must be one of {sorted(CARD_TYPES)}")


@router.get("", response_model=CardListOut)
def list_cards(
    q: str | None = Query(default=None),
    type: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
):
    stmt = select(Card)
    if type:
        _validate_type(type)
        stmt = stmt.where(Card.type == type)
    if tag:
        stmt = stmt.join(CardTag, CardTag.card_id == Card.id).join(Tag, Tag.id == CardTag.tag_id).where(Tag.name == tag)

    if q:
        q = q.strip()
        if len(q) >= 3:
            phrase = q.replace('"', '""')
            rows = session.execute(
                text("SELECT rowid FROM cards_fts WHERE cards_fts MATCH :q ORDER BY rank"),
                {"q": f'"{phrase}"'},
            ).all()
            ids = [r[0] for r in rows]
            if not ids:
                return CardListOut(items=[], total=0)
            stmt = stmt.where(Card.id.in_(ids))
        else:
            like = f"%{q}%"
            stmt = stmt.where(
                (Card.word.like(like))
                | (Card.reading.like(like))
                | (Card.meaning_en.like(like))
                | (Card.meaning_zh.like(like))
            )

    cards = session.exec(stmt.order_by(Card.created_at.desc())).all()
    total = len(cards)
    page = cards[offset : offset + limit]
    return CardListOut(items=[to_out(session, c) for c in page], total=total)


@router.post("", response_model=CardOut, status_code=201)
def create_card(payload: CardCreate, session: Session = Depends(get_session)):
    _validate_type(payload.type)
    if not payload.word.strip():
        raise HTTPException(status_code=422, detail="word is empty")
    now = _now()
    card = Card(
        type=payload.type,
        word=payload.word.strip(),
        reading=payload.reading,
        meaning_en=payload.meaning_en,
        meaning_zh=payload.meaning_zh,
        pos=payload.pos,
        example=payload.example,
        source_note_id=payload.source_note_id,
        due_date=date.today().isoformat(),
        created_at=now,
        updated_at=now,
    )
    session.add(card)
    session.flush()
    _set_tags(session, card.id, payload.tags)
    session.commit()
    session.refresh(card)
    return to_out(session, card)


@router.get("/{card_id}", response_model=CardOut)
def get_card(card_id: int, session: Session = Depends(get_session)):
    card = session.get(Card, card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return to_out(session, card)


@router.put("/{card_id}", response_model=CardOut)
def update_card(card_id: int, payload: CardUpdate, session: Session = Depends(get_session)):
    card = session.get(Card, card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    data = payload.model_dump(exclude_unset=True)
    tags = data.pop("tags", None)
    if "type" in data:
        _validate_type(data["type"])
    for key, value in data.items():
        setattr(card, key, value)
    if tags is not None:
        _set_tags(session, card_id, tags)
    card.updated_at = _now()
    session.add(card)
    session.flush()
    cleanup.gc_orphan_tags(session)
    session.commit()
    session.refresh(card)
    return to_out(session, card)


@router.delete("/{card_id}", status_code=204)
def delete_card(card_id: int, session: Session = Depends(get_session)):
    card = session.get(Card, card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    session.execute(text("DELETE FROM card_tags WHERE card_id = :cid"), {"cid": card_id})
    session.execute(text("DELETE FROM review_logs WHERE card_id = :cid"), {"cid": card_id})
    session.delete(card)
    session.flush()
    cleanup.gc_orphan_tags(session)
    session.commit()
