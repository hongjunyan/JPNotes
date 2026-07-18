"""Garbage collection for orphaned images and unused tags.

Images are uploaded before the note referencing them is saved, so they are not
tied to a note in the schema; a note references an image only via the
`![](/api/images/<id>)` URL in its markdown. Two collection paths:

- gc_for_deleted_note: called right after a note is deleted. Images that note
  referenced are removed immediately when no other note still references them
  (no grace period needed - the reference itself just disappeared).
- gc_sweep: full scan for the manual endpoint. Removes images referenced by no
  note, but keeps recent uploads (grace period) so an image pasted into an
  editor whose note has not been saved yet is never collected.

Both paths also drop tags no longer attached to any note or card.
"""

import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlmodel import Session, select

from ..config import settings
from ..models import Image, Note

IMAGE_REF_RE = re.compile(r"/api/images/([0-9a-f]{32})")

GRACE_HOURS = 24


def _referenced_image_ids(session: Session) -> set[str]:
    ids: set[str] = set()
    for content in session.exec(select(Note.content)).all():
        ids.update(IMAGE_REF_RE.findall(content))
    return ids


def _delete_image(session: Session, image: Image) -> None:
    (settings.image_path / image.id).unlink(missing_ok=True)
    session.delete(image)


def gc_orphan_tags(session: Session) -> int:
    result = session.execute(
        text(
            "DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM note_tags)"
            " AND id NOT IN (SELECT tag_id FROM card_tags)"
        )
    )
    return result.rowcount or 0


def gc_for_deleted_note(session: Session, deleted_content: str) -> dict:
    """Remove images the deleted note referenced, unless another note still does.
    Call after the note row is deleted, within the same transaction."""
    still_used = _referenced_image_ids(session)
    removed_images = 0
    for image_id in set(IMAGE_REF_RE.findall(deleted_content)) - still_used:
        image = session.get(Image, image_id)
        if image is not None:
            _delete_image(session, image)
            removed_images += 1
    removed_tags = gc_orphan_tags(session)
    return {"removed_images": removed_images, "removed_tags": removed_tags}


def gc_sweep(session: Session, grace_hours: int = GRACE_HOURS) -> dict:
    """Remove all images referenced by no note (older than the grace period),
    plus orphan tags."""
    used = _referenced_image_ids(session)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=grace_hours)
    removed_images = 0
    for image in session.exec(select(Image)).all():
        if image.id in used:
            continue
        try:
            created = datetime.fromisoformat(image.created_at)
        except ValueError:
            created = cutoff  # unparseable timestamp: treat as expired
        if created > cutoff:
            continue
        _delete_image(session, image)
        removed_images += 1
    removed_tags = gc_orphan_tags(session)
    return {"removed_images": removed_images, "removed_tags": removed_tags}

