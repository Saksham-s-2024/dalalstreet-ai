import logging
import uuid

from app.core.database import get_session_factory
from app.models import ReportArchive

logger = logging.getLogger(__name__)


async def archive_user_report(user_id: str, kind: str, title: str, payload: dict) -> None:
    factory = get_session_factory()
    if factory is None:
        return
    try:
        async with factory() as session:
            session.add(
                ReportArchive(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    kind=kind,
                    title=title[:500],
                    payload=payload,
                )
            )
            await session.commit()
    except Exception as exc:
        logger.warning("Could not archive report for user %s: %s", user_id, exc)
