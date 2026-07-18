from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings

# repo_root/db_data — single data directory shared by local dev and docker
# (docker overrides with DATA_DIR=/app/data, bind-mounted to ./db_data)
_DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "db_data"


class Settings(BaseSettings):
    data_dir: str = str(_DEFAULT_DATA_DIR)
    # the following derive from data_dir when left empty
    database_url: str = ""
    image_dir: str = ""
    jamdict_db: str = ""
    max_upload_mb: int = 10

    model_config = {"env_file": ".env", "extra": "ignore"}

    @model_validator(mode="after")
    def _derive_paths(self):
        base = Path(self.data_dir)
        if not self.database_url:
            self.database_url = f"sqlite:///{(base / 'jpnotes.db').as_posix()}"
        if not self.image_dir:
            self.image_dir = str(base / "images")
        if not self.jamdict_db:
            self.jamdict_db = str(base / "jamdict" / "jamdict.db")
        return self

    @property
    def image_path(self) -> Path:
        return Path(self.image_dir)


settings = Settings()
