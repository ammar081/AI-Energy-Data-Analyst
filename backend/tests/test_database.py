from app.database.db import normalize_database_url


def test_normalize_database_url_selects_psycopg_driver() -> None:
    assert normalize_database_url("postgresql://user:pass@db:5432/app") == (
        "postgresql+psycopg://user:pass@db:5432/app"
    )
    assert normalize_database_url("sqlite:///local.db") == "sqlite:///local.db"
