import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.models.dataset import Dataset
from app.models.pipeline import Pipeline
from app.models.pipeline_run import PipelineRun
from app.models.pipeline_task import PipelineTask
from app.models.user import User
from app.schemas.pipeline import (
    PipelineCreateRequest,
    PipelineResponse,
    PipelineRunResponse,
)
from app.services.rbac import require_permission
from app.tasks.pipeline_tasks import execute_pipeline


router = APIRouter(
    prefix="/pipelines",
    tags=["Pipelines"],
)

logger = logging.getLogger(__name__)


@router.post(
    "",
    response_model=PipelineResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_pipeline(
    request: PipelineCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_permission("pipeline:run")),
):
    dataset = await db.scalar(
        select(Dataset).where(
            Dataset.id == request.dataset_id,
            Dataset.organization_id == current_user.organization_id,
            Dataset.is_active.is_(True),
        )
    )

    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found in your organization.",
        )

    pipeline = Pipeline(
        organization_id=current_user.organization_id,
        dataset_id=request.dataset_id,
        name=request.name,
        description=request.description,
        schedule=request.schedule,
        created_by=current_user.id,
    )

    db.add(pipeline)
    await db.commit()
    await db.refresh(pipeline)

    return pipeline


@router.get(
    "",
    response_model=list[PipelineResponse],
)
async def list_pipelines(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_permission("pipeline:run")),
):
    result = await db.scalars(
        select(Pipeline)
        .where(
            Pipeline.organization_id == current_user.organization_id,
            Pipeline.is_active.is_(True),
        )
        .order_by(Pipeline.created_at.desc())
    )

    return result.all()


@router.post(
    "/{pipeline_id}/run",
    response_model=PipelineRunResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def run_pipeline(
    pipeline_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_permission("pipeline:run")),
):
    pipeline = await db.scalar(
        select(Pipeline).where(
            Pipeline.id == pipeline_id,
            Pipeline.organization_id == current_user.organization_id,
            Pipeline.is_active.is_(True),
        )
    )

    if not pipeline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pipeline not found.",
        )

    pipeline_run = PipelineRun(
        organization_id=current_user.organization_id,
        pipeline_id=pipeline.id,
        status="queued",
        created_by=current_user.id,
    )

    db.add(pipeline_run)
    await db.flush()

    pipeline_task = PipelineTask(
        pipeline_run_id=pipeline_run.id,
        task_name="data_quality_analysis",
        task_type="data_quality",
        status="queued",
    )

    db.add(pipeline_task)

    await db.commit()

    await db.refresh(pipeline_run)
    await db.refresh(pipeline_task)

    try:
        execute_pipeline.delay(
            str(pipeline_run.id),
            str(pipeline_task.id),
        )
        logger.info("Pipeline run %s queued", pipeline_run.id)
    except Exception as exc:
        logger.exception("Pipeline run %s failed to dispatch", pipeline_run.id)
        pipeline_run.status = "failed"
        pipeline_run.completed_at = datetime.now(timezone.utc)
        pipeline_run.error_message = str(exc)[:1000]
        pipeline_task.status = "failed"
        pipeline_task.completed_at = datetime.now(timezone.utc)
        pipeline_task.error_message = str(exc)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Pipeline could not be queued because Redis or the Celery worker "
                "is unavailable. Check those services, then retry the run."
            ),
        ) from exc

    return pipeline_run


@router.get(
    "/{pipeline_id}/runs",
    response_model=list[PipelineRunResponse],
)
async def list_pipeline_runs(
    pipeline_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: User = Depends(require_permission("pipeline:run")),
):
    pipeline = await db.scalar(
        select(Pipeline).where(
            Pipeline.id == pipeline_id,
            Pipeline.organization_id == current_user.organization_id,
        )
    )

    if not pipeline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pipeline not found.",
        )

    result = await db.scalars(
        select(PipelineRun)
        .where(
            PipelineRun.pipeline_id == pipeline_id,
            PipelineRun.organization_id == current_user.organization_id,
        )
        .order_by(PipelineRun.created_at.desc())
    )

    return result.all()