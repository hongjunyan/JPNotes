from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..db import get_session
from ..models import Card, CardTag, ReviewLog, Tag
from ..schemas import CardOut, ReviewQueueOut, ReviewRequest
from ..services import srs
from .cards import to_out

router = APIRouter(prefix="/review", tags=["review"])


@router.get("/queue", response_model=ReviewQueueOut)
def get_queue(
    type: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    session: Session = Depends(get_session),
):
    today = date.today().isoformat()
    stmt = select(Card).where(Card.due_date <= today)
    if type:
        stmt = stmt.where(Card.type == type)
    if tag:
        stmt = stmt.join(CardTag, CardTag.card_id == Card.id).join(Tag, Tag.id == CardTag.tag_id).where(Tag.name == tag)
    cards = session.exec(stmt.order_by(Card.due_date, Card.id)).all()
    return ReviewQueueOut(cards=[to_out(session, c) for c in cards[:limit]], total=len(cards))


@router.post("/{card_id}", response_model=CardOut)
def rate_card(card_id: int, payload: ReviewRequest, session: Session = Depends(get_session)):
    card = session.get(Card, card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    if payload.rating not in (1, 2, 3, 4):
        raise HTTPException(status_code=422, detail="rating must be 1-4")

    state = srs.SrsState(
        interval=card.interval,
        ease_factor=card.ease_factor,
        repetitions=card.repetitions,
        lapses=card.lapses,
    )
    new_state, due = srs.review(state, payload.rating, date.today())

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    card.interval = new_state.interval
    card.ease_factor = new_state.ease_factor
    card.repetitions = new_state.repetitions
    card.lapses = new_state.lapses
    card.due_date = due
    card.last_reviewed = now
    card.updated_at = now
    session.add(card)
    session.add(ReviewLog(card_id=card_id, rating=payload.rating, reviewed_at=now))
    session.commit()
    session.refresh(card)
    return to_out(session, card)
