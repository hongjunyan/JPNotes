import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlmodel import Session, select

from ..db import get_session
from ..models import Note, NoteTag, Tag
from ..schemas import NoteCreate, NoteListItem, NoteListOut, NoteOut, NoteUpdate
from ..services import cleanup

router = APIRouter(prefix="/notes", tags=["notes"])

RUBY_RE = re.compile(r"\{([^{}|]+)\|([^{}|]+)\}")
MD_IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
MD_MARKS_RE = re.compile(r"[#*`>\[\]()_~-]")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _plain_excerpt(content: str, length: int = 120) -> str:
    txt = MD_IMAGE_RE.sub("", content)
    txt = RUBY_RE.sub(r"\1", txt)
    txt = MD_MARKS_RE.sub("", txt)
    txt = " ".join(txt.split())
    return txt[:length]


def _note_tags(session: Session, note_id: int) -> list[str]:
    rows = session.exec(
        select(Tag.name).join(NoteTag, NoteTag.tag_id == Tag.id).where(NoteTag.note_id == note_id)
    ).all()
    return sorted(rows)


def _set_tags(session: Session, note_id: int, names: list[str]) -> None:
    session.execute(text("DELETE FROM note_tags WHERE note_id = :nid"), {"nid": note_id})
    for raw in names:
        name = raw.strip()
        if not name:
            continue
        tag = session.exec(select(Tag).where(Tag.name == name)).first()
        if tag is None:
            tag = Tag(name=name)
            session.add(tag)
            session.flush()
        session.add(NoteTag(note_id=note_id, tag_id=tag.id))


def _to_out(session: Session, note: Note) -> NoteOut:
    return NoteOut(
        id=note.id,
        title=note.title,
        content=note.content,
        tags=_note_tags(session, note.id),
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@router.get("", response_model=NoteListOut)
def list_notes(
    q: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
):
    stmt = select(Note)
    if tag:
        stmt = stmt.join(NoteTag, NoteTag.note_id == Note.id).join(Tag, Tag.id == NoteTag.tag_id).where(Tag.name == tag)

    if q:
        q = q.strip()
        if len(q) >= 3:
            phrase = q.replace('"', '""')
            fts_ids = session.execute(
                text("SELECT rowid FROM notes_fts WHERE notes_fts MATCH :q ORDER BY rank"),
                {"q": f'"{phrase}"'},
            ).all()
            ids = [row[0] for row in fts_ids]
            if not ids:
                return NoteListOut(items=[], total=0)
            stmt = stmt.where(Note.id.in_(ids))
        else:
            like = f"%{q}%"
            stmt = stmt.where((Note.title.like(like)) | (Note.content.like(like)))

    notes = session.exec(stmt.order_by(Note.updated_at.desc())).all()
    total = len(notes)
    page = notes[offset : offset + limit]
    items = [
        NoteListItem(
            id=n.id,
            title=n.title,
            excerpt=_plain_excerpt(n.content),
            tags=_note_tags(session, n.id),
            updated_at=n.updated_at,
        )
        for n in page
    ]
    return NoteListOut(items=items, total=total)


@router.post("", response_model=NoteOut, status_code=201)
def create_note(payload: NoteCreate, session: Session = Depends(get_session)):
    now = _now()
    note = Note(title=payload.title or "無題", content=payload.content, created_at=now, updated_at=now)
    session.add(note)
    session.flush()
    _set_tags(session, note.id, payload.tags)
    session.commit()
    session.refresh(note)
    return _to_out(session, note)


@router.get("/{note_id}", response_model=NoteOut)
def get_note(note_id: int, session: Session = Depends(get_session)):
    note = session.get(Note, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    return _to_out(session, note)


@router.put("/{note_id}", response_model=NoteOut)
def update_note(note_id: int, payload: NoteUpdate, session: Session = Depends(get_session)):
    note = session.get(Note, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    if payload.title is not None:
        note.title = payload.title
    if payload.content is not None:
        note.content = payload.content
    if payload.tags is not None:
        _set_tags(session, note_id, payload.tags)
    note.updated_at = _now()
    session.add(note)
    session.commit()
    session.refresh(note)
    return _to_out(session, note)


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: int, session: Session = Depends(get_session)):
    note = session.get(Note, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    deleted_content = note.content
    # cards keep living when their source note goes away — just unlink them
    # (cards.source_note_id has no ON DELETE SET NULL in the sqlite schema)
    session.execute(text("UPDATE cards SET source_note_id = NULL WHERE source_note_id = :nid"), {"nid": note_id})
    session.execute(text("DELETE FROM note_tags WHERE note_id = :nid"), {"nid": note_id})
    session.delete(note)
    session.flush()
    cleanup.gc_for_deleted_note(session, deleted_content)
    session.commit()
