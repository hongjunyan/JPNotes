from collections import Counter
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from ..db import get_session
from ..models import Card, Note, ReviewLog

router = APIRouter(prefix="/stats", tags=["stats"])


class StatsOverview(BaseModel):
    due_today: int
    total_cards: int
    total_notes: int
    reviews_today: int
    streak: int
    retention_30d: float | None  # share of ratings >= 2 in last 30 days; None if no data


class HeatmapDay(BaseModel):
    date: str
    count: int


def _local_date(iso_utc: str) -> date:
    """UTC ISO timestamp -> local calendar date (heatmap/streak are local-day concepts)."""
    return datetime.fromisoformat(iso_utc).astimezone().date()


def _review_dates(session: Session) -> Counter:
    counts: Counter = Counter()
    for (reviewed_at,) in session.execute(select(ReviewLog.reviewed_at)).all():
        counts[_local_date(reviewed_at)] += 1
    return counts


@router.get("/overview", response_model=StatsOverview)
def overview(session: Session = Depends(get_session)):
    today = date.today()
    due_today = session.execute(
        select(func.count(Card.id)).where(Card.due_date <= today.isoformat())
    ).scalar_one()
    total_cards = session.execute(select(func.count(Card.id))).scalar_one()
    total_notes = session.execute(select(func.count(Note.id))).scalar_one()

    by_day = _review_dates(session)
    reviews_today = by_day.get(today, 0)

    # streak: consecutive review days ending today (or yesterday when today is still empty)
    streak = 0
    cursor = today if today in by_day else today - timedelta(days=1)
    while cursor in by_day:
        streak += 1
        cursor -= timedelta(days=1)

    cutoff = datetime.now().astimezone() - timedelta(days=30)
    recent = session.execute(
        select(ReviewLog.rating).where(ReviewLog.reviewed_at >= cutoff.isoformat())
    ).all()
    retention = round(sum(1 for (r,) in recent if r >= 2) / len(recent), 3) if recent else None

    return StatsOverview(
        due_today=due_today,
        total_cards=total_cards,
        total_notes=total_notes,
        reviews_today=reviews_today,
        streak=streak,
        retention_30d=retention,
    )


@router.get("/heatmap", response_model=list[HeatmapDay])
def heatmap(days: int = Query(default=182, le=366), session: Session = Depends(get_session)):
    start = date.today() - timedelta(days=days - 1)
    by_day = _review_dates(session)
    return [
        HeatmapDay(date=d.isoformat(), count=n)
        for d, n in sorted(by_day.items())
        if d >= start
    ]
