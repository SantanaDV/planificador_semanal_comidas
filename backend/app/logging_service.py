from __future__ import annotations

import logging
import traceback
from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from .database import SessionLocal
from .models import SystemLog

LOGGER = logging.getLogger("menu_planner")
VALID_LEVELS = {"info", "warning", "error"}


def record_log(
    level: str,
    module: str,
    message: str,
    context: dict[str, Any] | None = None,
    stack_trace: str | None = None,
) -> None:
    normalized_level = level.lower().strip()
    if normalized_level not in VALID_LEVELS:
        normalized_level = "info"

    entry = SystemLog(
        level=normalized_level,
        module=module.strip()[:80] or "backend",
        message=message.strip() or "Sin mensaje",
        context=_safe_context(context),
        stack_trace=stack_trace,
    )

    try:
        with SessionLocal() as session:
            session.add(entry)
            session.commit()
    except SQLAlchemyError:
        LOGGER.exception("No se pudo persistir el log del sistema")


def record_exception(module: str, message: str, error: BaseException, context: dict[str, Any] | None = None) -> None:
    record_log(
        "error",
        module,
        message,
        context={**(context or {}), "exception_type": error.__class__.__name__},
        stack_trace="".join(traceback.format_exception(type(error), error, error.__traceback__)),
    )


def _safe_context(context: dict[str, Any] | None) -> dict[str, Any]:
    if not context:
        return {}
    safe: dict[str, Any] = {}
    for key, value in context.items():
        if "key" in key.lower() or "secret" in key.lower() or "password" in key.lower():
            safe[key] = "[redacted]"
            continue
        safe[key] = value
    return safe
