from contextlib import asynccontextmanager

from fastapi import FastAPI

from .db import init_db
from .routers import dict as dict_router
from .routers import cards, exam, images, notes, review, stats, tags


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="JPNotes API", lifespan=lifespan)

app.include_router(notes.router, prefix="/api")
app.include_router(cards.router, prefix="/api")
app.include_router(review.router, prefix="/api")
app.include_router(exam.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(tags.router, prefix="/api")
app.include_router(dict_router.router, prefix="/api")
app.include_router(images.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
