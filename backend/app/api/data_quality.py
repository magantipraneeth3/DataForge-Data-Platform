from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.models.data_quality_result import DataQualityResult
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.models.data_source import DataSource
from app.models.user import User
from app.services.data_quality import analyze_dataset
from app.services.rbac import require_permission


router = APIRouter(
    prefix="/data-quality",
    tags=["Data Quality"],
)


@router.post(
    "/{dataset_id}/analyze",
    status_code=status.HTTP_201_CREATED,
)
async def analyze_data_quality(
    dataset_id: UUID,
    current_user: User = Depends(
        require_permission("dataset:update")
    ),
    db: AsyncSession = Depends(get_db),
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

    version = await db.scalar(
        select(DatasetVersion)
        .where(
            DatasetVersion.dataset_id == dataset.id
        )
        .order_by(
            DatasetVersion.version_number.desc()
        )
        .limit(1)
    )

    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No dataset version found.",
        )

    data_source = await db.scalar(
        select(DataSource)
        .where(
            DataSource.dataset_id == dataset.id
        )
        .order_by(
            DataSource.created_at.desc()
        )
        .limit(1)
    )

    if not data_source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No uploaded data source found.",
        )

    try:
        analysis = analyze_dataset(
            data_source.file_path
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Data quality analysis failed: {exc}",
        )

    result = DataQualityResult(
        organization_id=current_user.organization_id,
        dataset_id=dataset.id,
        dataset_version_id=version.id,
        created_by=current_user.id,
        total_rows=analysis["total_rows"],
        total_columns=analysis["total_columns"],
        missing_values=analysis["missing_values"],
        duplicate_rows=analysis["duplicate_rows"],
        quality_score=analysis["quality_score"],
        column_statistics=analysis["column_statistics"],
    )

    db.add(result)
    await db.commit()
    await db.refresh(result)

    return {
        "message": "Data quality analysis completed.",
        "dataset_id": str(dataset.id),
        "dataset_version": version.version_number,
        "result_id": str(result.id),
        "total_rows": result.total_rows,
        "total_columns": result.total_columns,
        "missing_values": result.missing_values,
        "duplicate_rows": result.duplicate_rows,
        "quality_score": result.quality_score,
        "column_statistics": result.column_statistics,
    }


@router.get(
    "/{dataset_id}/latest",
)
async def get_latest_quality_result(
    dataset_id: UUID,
    current_user: User = Depends(
        require_permission("dataset:read")
    ),
    db: AsyncSession = Depends(get_db),
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

    result = await db.scalar(
        select(DataQualityResult)
        .where(
            DataQualityResult.dataset_id == dataset_id,
            DataQualityResult.organization_id
            == current_user.organization_id,
        )
        .order_by(
            DataQualityResult.created_at.desc()
        )
        .limit(1)
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No data quality result found.",
        )

    return {
        "result_id": str(result.id),
        "dataset_id": str(result.dataset_id),
        "dataset_version_id": str(
            result.dataset_version_id
        ),
        "total_rows": result.total_rows,
        "total_columns": result.total_columns,
        "missing_values": result.missing_values,
        "duplicate_rows": result.duplicate_rows,
        "quality_score": result.quality_score,
        "column_statistics": result.column_statistics,
        "created_at": result.created_at,
    }