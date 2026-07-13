from datetime import datetime

from sqlalchemy import DateTime, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.db import Base


class DatasetRecord(Base):
    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, index=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    raw_path: Mapped[str] = mapped_column(String(500), nullable=False)
    cleaned_path: Mapped[str] = mapped_column(String(500), nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    column_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    datetime_column: Mapped[str | None] = mapped_column(String(120), nullable=True)
    value_column: Mapped[str | None] = mapped_column(String(120), nullable=True)
    asset_column: Mapped[str | None] = mapped_column(String(120), nullable=True)
    summary_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

