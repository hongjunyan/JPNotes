from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from ..db import get_session
from ..models import CardTag, NoteTag, Tag
from ..schemas import TagOut

router = APIRouter(prefix="/tags", tags=["tags"])


class TagCreate(BaseModel):
    name: str


@router.get("", response_model=list[TagOut])
def list_tags(session: Session = Depends(get_session)):
    note_counts = dict(
        session.execute(
            select(NoteTag.tag_id, func.count(NoteTag.note_id)).group_by(NoteTag.tag_id)
        ).all()
    )
    card_counts = dict(
        session.execute(
            select(CardTag.tag_id, func.count(CardTag.card_id)).group_by(CardTag.tag_id)
        ).all()
    )
    tags = session.exec(select(Tag).order_by(Tag.name)).all()
    return [
        TagOut(
            id=t.id,
            name=t.name,
            note_count=note_counts.get(t.id, 0),
            card_count=card_counts.get(t.id, 0),
        )
        for t in tags
    ]


@router.post("", response_model=TagOut, status_code=201)
def create_tag(payload: TagCreate, session: Session = Depends(get_session)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Tag name is empty")
    existing = session.exec(select(Tag).where(Tag.name == name)).first()
    if existing:
        return TagOut(id=existing.id, name=existing.name, note_count=0)
    tag = Tag(name=name)
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return TagOut(id=tag.id, name=tag.name, note_count=0)


@router.delete("/{tag_id}", status_code=204)
def delete_tag(tag_id: int, session: Session = Depends(get_session)):
    tag = session.get(Tag, tag_id)
    if tag is None:
        raise HTTPException(status_code=404, detail="Tag not found")
    from sqlalchemy import text

    session.execute(text("DELETE FROM note_tags WHERE tag_id = :tid"), {"tid": tag_id})
    session.execute(text("DELETE FROM card_tags WHERE tag_id = :tid"), {"tid": tag_id})
    session.delete(tag)
    session.commit()
