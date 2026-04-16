"""Primitivas de acceso a base de datos para toda la aplicación."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    """Base declarativa común para todos los modelos SQLAlchemy."""

    pass


connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, class_=Session)


def get_session() -> Generator[Session, None, None]:
    """Entrega una sesión por request y garantiza su cierre al final del uso."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
