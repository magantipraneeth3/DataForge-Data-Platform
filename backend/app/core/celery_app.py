from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "dataforge",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.pipeline_tasks"],
)

celery_app.conf.update(
    task_track_started=True,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    broker_connection_retry=True,
    broker_connection_retry_on_startup=True,
    broker_connection_max_retries=None,
    task_publish_retry=True,
    task_publish_retry_policy={
        "max_retries": 5,
        "interval_start": 1,
        "interval_step": 1,
        "interval_max": 3,
    },
    result_backend_always_retry=True,
    result_backend_max_retries=float("inf"),
    result_backend_base_sleep_between_retries_ms=100,
    result_backend_max_sleep_between_retries_ms=5000,
)

celery_app.autodiscover_tasks(["app.tasks"])