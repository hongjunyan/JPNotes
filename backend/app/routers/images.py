import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session

from ..config import settings
from ..db import get_session
from ..models import Image
from ..schemas import ImageOut
from ..services import cleanup

router = APIRouter(prefix="/images", tags=["images"])

ALLOWED_MIME = {"image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"}


@router.post("", response_model=ImageOut, status_code=201)
async def upload_image(file: UploadFile, session: Session = Depends(get_session)):
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=415, detail=f"Unsupported image type: {file.content_type}")

    data = await file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Image exceeds {settings.max_upload_mb} MB limit")

    image_id = uuid.uuid4().hex
    (settings.image_path / image_id).write_bytes(data)

    image = Image(
        id=image_id,
        filename=file.filename or image_id,
        mime=file.content_type,
        created_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
    )
    session.add(image)
    session.commit()
    return ImageOut(id=image_id, url=f"/api/images/{image_id}", filename=image.filename)


@router.post("/gc")
def collect_garbage(session: Session = Depends(get_session)):
    """Remove images referenced by no note (uploaded > 24h ago) and orphan tags."""
    result = cleanup.gc_sweep(session)
    session.commit()
    return result


@router.get("/{image_id}")
def get_image(image_id: str, session: Session = Depends(get_session)):
    image = session.get(Image, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")
    path = settings.image_path / image_id
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Image file missing")
    return FileResponse(path, media_type=image.mime, headers={"Cache-Control": "public, max-age=31536000, immutable"})
