from sqlalchemy import event, text
from sqlmodel import Session, SQLModel, create_engine

from .config import settings

connect_args = {"check_same_thread": False}
engine = create_engine(settings.database_url, connect_args=connect_args)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


FTS_SETUP = """
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title, content,
    content='notes', content_rowid='id',
    tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
    INSERT INTO notes_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
    word, reading, meaning_en, meaning_zh, example,
    content='cards', content_rowid='id',
    tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS cards_ai AFTER INSERT ON cards BEGIN
    INSERT INTO cards_fts(rowid, word, reading, meaning_en, meaning_zh, example)
    VALUES (new.id, new.word, new.reading, new.meaning_en, new.meaning_zh, new.example);
END;

CREATE TRIGGER IF NOT EXISTS cards_ad AFTER DELETE ON cards BEGIN
    INSERT INTO cards_fts(cards_fts, rowid, word, reading, meaning_en, meaning_zh, example)
    VALUES ('delete', old.id, old.word, old.reading, old.meaning_en, old.meaning_zh, old.example);
END;

CREATE TRIGGER IF NOT EXISTS cards_au AFTER UPDATE ON cards BEGIN
    INSERT INTO cards_fts(cards_fts, rowid, word, reading, meaning_en, meaning_zh, example)
    VALUES ('delete', old.id, old.word, old.reading, old.meaning_en, old.meaning_zh, old.example);
    INSERT INTO cards_fts(rowid, word, reading, meaning_en, meaning_zh, example)
    VALUES (new.id, new.word, new.reading, new.meaning_en, new.meaning_zh, new.example);
END;
"""


def init_db() -> None:
    settings.image_path.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)
    raw = engine.raw_connection()
    try:
        raw.driver_connection.executescript(FTS_SETUP)
        raw.commit()
    finally:
        raw.close()


def get_session():
    with Session(engine) as session:
        yield session
