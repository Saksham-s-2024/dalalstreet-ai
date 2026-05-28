"""Celery app for docker-compose / background workers (no tasks registered yet)."""
from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "dalalstreet",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kolkata",
    enable_utc=True,
)
