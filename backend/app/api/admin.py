from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends

from app.core.database import get_db
from app.models.data_quality_result import DataQualityResult
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.models.pipeline import Pipeline
from app.models.pipeline_run import PipelineRun
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole
from app.services.rbac import get_effective_role, require_permission


router = APIRouter(prefix="/admin", tags=["Administration"])


@router.get("/overview")
async def get_admin_overview(
    current_user: User = Depends(require_permission("admin:manage")),
    db: AsyncSession = Depends(get_db),
):
    users = list(
        (
            await db.scalars(
                select(User).order_by(User.created_at.desc())
            )
        ).all()
    )
    user_by_id = {user.id: user for user in users}
    user_roles = {
        user.id: await get_effective_role(user, db)
        for user in users
    }
    active_users = [user for user in users if user.is_active]

    status_rows = (
        await db.execute(
            select(PipelineRun.status, func.count())
            .group_by(PipelineRun.status)
        )
    ).all()
    run_status_counts = {
        str(status).lower(): count for status, count in status_rows
    }

    analytics_records = None
    try:
        analytics_records = await db.scalar(
            text("SELECT COUNT(*) FROM customer_churn_analytics")
        )
    except Exception:
        await db.rollback()

    events: list[dict] = []

    def actor_fields(user_id):
        actor = user_by_id.get(user_id)
        if not actor:
            return {"actor_name": "Unattributed", "actor_email": None}
        return {
            "actor_name": f"{actor.first_name} {actor.last_name}".strip(),
            "actor_email": actor.email,
        }

    dataset_rows = (
        await db.execute(
            select(
                Dataset.id,
                Dataset.name,
                Dataset.status,
                Dataset.created_at,
                Dataset.created_by,
            )
            .order_by(Dataset.created_at.desc())
            .limit(50)
        )
    ).all()
    for dataset_id, name, status, created_at, created_by in dataset_rows:
        events.append(
            {
                "id": f"dataset:{dataset_id}",
                "type": "Dataset created",
                "summary": name,
                "status": status,
                "dataset_id": str(dataset_id),
                "pipeline_id": None,
                "error_message": None,
                "occurred_at": created_at,
                **actor_fields(created_by),
            }
        )

    version_rows = (
        await db.execute(
            select(
                DatasetVersion.id,
                Dataset.id,
                Dataset.name,
                DatasetVersion.version_number,
                DatasetVersion.created_at,
                DatasetVersion.created_by,
            )
            .join(Dataset, Dataset.id == DatasetVersion.dataset_id)
            .order_by(DatasetVersion.created_at.desc())
            .limit(50)
        )
    ).all()
    for version_id, dataset_id, name, version, occurred_at, created_by in version_rows:
        events.append(
            {
                "id": f"version:{version_id}",
                "type": "Dataset uploaded",
                "summary": f"{name} · version {version}",
                "status": "completed",
                "dataset_id": str(dataset_id),
                "pipeline_id": None,
                "error_message": None,
                "occurred_at": occurred_at,
                **actor_fields(created_by),
            }
        )

    pipeline_rows = (
        await db.execute(
            select(
                Pipeline.id,
                Pipeline.name,
                Pipeline.dataset_id,
                Pipeline.created_at,
                Pipeline.created_by,
            )
            .order_by(Pipeline.created_at.desc())
            .limit(50)
        )
    ).all()
    for pipeline_id, name, dataset_id, occurred_at, created_by in pipeline_rows:
        events.append(
            {
                "id": f"pipeline:{pipeline_id}",
                "type": "Pipeline created",
                "summary": name,
                "status": "created",
                "dataset_id": str(dataset_id),
                "pipeline_id": str(pipeline_id),
                "error_message": None,
                "occurred_at": occurred_at,
                **actor_fields(created_by),
            }
        )

    run_rows = (
        await db.execute(
            select(
                PipelineRun.id,
                Pipeline.id,
                Pipeline.name,
                Pipeline.dataset_id,
                PipelineRun.status,
                PipelineRun.error_message,
                PipelineRun.created_at,
                PipelineRun.created_by,
            )
            .join(Pipeline, Pipeline.id == PipelineRun.pipeline_id)
            .order_by(PipelineRun.created_at.desc())
            .limit(100)
        )
    ).all()
    for run_id, pipeline_id, name, dataset_id, status, error, occurred_at, created_by in run_rows:
        events.append(
            {
                "id": f"run:{run_id}",
                "type": "Pipeline run",
                "summary": name,
                "status": status,
                "dataset_id": str(dataset_id),
                "pipeline_id": str(pipeline_id),
                "error_message": error,
                "occurred_at": occurred_at,
                **actor_fields(created_by),
            }
        )

    quality_rows = (
        await db.execute(
            select(
                DataQualityResult.id,
                Dataset.id,
                Dataset.name,
                DataQualityResult.quality_score,
                DataQualityResult.created_at,
                DataQualityResult.created_by,
            )
            .join(Dataset, Dataset.id == DataQualityResult.dataset_id)
            .order_by(DataQualityResult.created_at.desc())
            .limit(100)
        )
    ).all()
    for result_id, dataset_id, name, score, occurred_at, created_by in quality_rows:
        events.append(
            {
                "id": f"quality:{result_id}",
                "type": "Quality analysis",
                "summary": f"{name} · score {score}",
                "status": "completed",
                "dataset_id": str(dataset_id),
                "pipeline_id": None,
                "error_message": None,
                "occurred_at": occurred_at,
                **actor_fields(created_by),
            }
        )

    events.sort(key=lambda event: event["occurred_at"], reverse=True)

    return {
        "staff": {
            "total": len(users),
            "active": len(active_users),
            "admins": sum(user_roles[user.id] == "admin" for user in users),
            "data_engineers": sum(
                user_roles[user.id] == "data_engineer" for user in active_users
            ),
            "analysts": sum(
                user_roles[user.id] == "analyst" for user in active_users
            ),
        },
        "users": [
            {
                "id": str(user.id),
                "name": f"{user.first_name} {user.last_name}".strip(),
                "email": user.email,
                "role": user_roles[user.id],
                "is_active": user.is_active,
                "created_at": user.created_at,
            }
            for user in users
        ],
        "pipeline_run_statuses": run_status_counts,
        "analytics_records": analytics_records,
        "activity": events[:100],
    }