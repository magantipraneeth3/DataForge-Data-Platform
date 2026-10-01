from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.pipeline import Pipeline
from app.models.pipeline_run import PipelineRun
from app.models.user import User
from app.services.data_quality import analyze_dataset
from app.services.rbac import require_permission


router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
)


def build_analytics_response(
    dataset: Dataset,
    data_source: DataSource,
    offset: int,
    limit: int,
):
    try:
        analysis = analyze_dataset(
            data_source.file_path,
            offset=offset,
            limit=limit,
            dashboard=True,
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The uploaded dataset file could not be found.",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Unable to analyze this dataset: {exc}",
        ) from exc

    return {
        "dataset_id": str(dataset.id),
        "dataset_name": (
            f"{dataset.name} (Cleaned)"
            if "_cleaned_" in data_source.file_name.lower()
            else dataset.name
        ),
        "analytics": analysis,
    }


@router.get("/datasets/{dataset_id}")
async def get_dataset_analytics(
    dataset_id: UUID,
    date_column: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_permission("analytics:read")
    ),
):
    dataset = await db.scalar(
        select(Dataset).where(
            Dataset.id == dataset_id,
            Dataset.organization_id == current_user.organization_id,
            Dataset.is_active.is_(True),
        )
    )

    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found.",
        )

    data_source = await db.scalar(
        select(DataSource)
        .where(
            DataSource.dataset_id == dataset.id,
            DataSource.organization_id == current_user.organization_id,
        )
        .order_by(DataSource.created_at.desc())
        .limit(1)
    )

    if not data_source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No uploaded data source found for this dataset.",
        )

    return build_analytics_response(dataset, data_source, offset, limit)


@router.get("/pipelines/{pipeline_or_run_id}")
async def get_pipeline_analytics(
    pipeline_or_run_id: UUID,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_permission("analytics:read")
    ),
):
    pipeline = await db.scalar(
        select(Pipeline).where(
            Pipeline.id == pipeline_or_run_id,
            Pipeline.organization_id == current_user.organization_id,
        )
    )

    if pipeline:
        pipeline_run = await db.scalar(
            select(PipelineRun)
            .where(
                PipelineRun.pipeline_id == pipeline.id,
                PipelineRun.organization_id == current_user.organization_id,
                PipelineRun.status == "completed",
            )
            .order_by(PipelineRun.completed_at.desc())
            .limit(1)
        )
    else:
        pipeline_run = await db.scalar(
            select(PipelineRun).where(
                PipelineRun.id == pipeline_or_run_id,
                PipelineRun.organization_id == current_user.organization_id,
                PipelineRun.status == "completed",
            )
        )
        if pipeline_run:
            pipeline = await db.scalar(
                select(Pipeline).where(
                    Pipeline.id == pipeline_run.pipeline_id,
                    Pipeline.organization_id == current_user.organization_id,
                )
            )

    if not pipeline or not pipeline_run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No successfully completed pipeline run was found for this ID.",
        )

    dataset = await db.scalar(
        select(Dataset).where(
            Dataset.id == pipeline.dataset_id,
            Dataset.organization_id == current_user.organization_id,
            Dataset.is_active.is_(True),
        )
    )
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pipeline dataset not found.",
        )

    run_marker = f"_cleaned_{pipeline_run.id.hex[:8]}"
    data_source = await db.scalar(
        select(DataSource)
        .where(
            DataSource.dataset_id == dataset.id,
            DataSource.organization_id == current_user.organization_id,
            DataSource.file_name.like(f"%{run_marker}%"),
        )
        .limit(1)
    )
    if not data_source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This run has no cleaned dataset. Run the pipeline again.",
        )

    return build_analytics_response(dataset, data_source, offset, limit)


@router.get("/customer-churn")
async def get_customer_churn_analytics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return customer churn records loaded by the
    DataForge Airflow ETL pipeline.
    """

    try:
        result = await db.execute(
            text(
                """
                SELECT
                    customer_id,
                    age,
                    monthly_charges,
                    tenure,
                    churn
                FROM customer_churn_analytics
                ORDER BY customer_id
                """
            )
        )

        rows = result.mappings().all()

        return {
            "total_records": len(rows),
            "data": [dict(row) for row in rows],
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to load analytics data: {str(exc)}",
        )


@router.get("/customer-churn/summary")
async def get_customer_churn_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return customer churn KPI metrics.
    """

    try:
        result = await db.execute(
            text(
                """
                SELECT
                    COUNT(*) AS total_customers,

                    COUNT(*) FILTER (
                        WHERE LOWER(churn) = 'yes'
                    ) AS churned_customers,

                    ROUND(
                        AVG(monthly_charges)::numeric,
                        2
                    ) AS average_monthly_charges,

                    ROUND(
                        AVG(tenure)::numeric,
                        2
                    ) AS average_tenure

                FROM customer_churn_analytics
                """
            )
        )

        summary = result.mappings().one()

        total_customers = int(
            summary["total_customers"] or 0
        )

        churned_customers = int(
            summary["churned_customers"] or 0
        )

        churn_rate = (
            (churned_customers / total_customers) * 100
            if total_customers > 0
            else 0
        )

        return {
            "total_customers": total_customers,
            "churned_customers": churned_customers,
            "churn_rate": round(churn_rate, 2),
            "average_monthly_charges": float(
                summary["average_monthly_charges"] or 0
            ),
            "average_tenure": float(
                summary["average_tenure"] or 0
            ),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unable to calculate analytics summary: {str(exc)}",
        )