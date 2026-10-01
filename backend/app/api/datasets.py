from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import File, UploadFile
from app.models.data_source import DataSource
from app.models.dataset_version import DatasetVersion
from app.services.data_ingestion import save_and_validate_file
from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.models.dataset import Dataset
from app.models.user import User
from app.schemas.dataset import (
    DatasetCreateRequest,
    DatasetListResponse,
    DatasetResponse,
)
from app.services.rbac import require_permission


router = APIRouter(
    prefix="/datasets",
    tags=["Datasets"],
)


@router.post(
    "",
    response_model=DatasetResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_dataset(
    request: DatasetCreateRequest,
    current_user: User = Depends(
        require_permission("dataset:create")
    ),
    db: AsyncSession = Depends(get_db),
):
    dataset = Dataset(
        organization_id=current_user.organization_id,
        name=request.name,
        description=request.description,
        created_by=current_user.id,
    )

    db.add(dataset)
    await db.commit()
    await db.refresh(dataset)

    return dataset


@router.get(
    "",
    response_model=DatasetListResponse,
)
async def list_datasets(
    current_user: User = Depends(
        require_permission("dataset:read")
    ),
    db: AsyncSession = Depends(get_db),
):
    latest_versions = (
        select(
            DatasetVersion.dataset_id.label("dataset_id"),
            func.max(DatasetVersion.version_number).label("version_number"),
        )
        .group_by(DatasetVersion.dataset_id)
        .subquery()
    )

    query = (
        select(Dataset, DatasetVersion)
        .select_from(Dataset)
        .outerjoin(
            latest_versions,
            Dataset.id == latest_versions.c.dataset_id,
        )
        .outerjoin(
            DatasetVersion,
            (DatasetVersion.dataset_id == Dataset.id)
            & (DatasetVersion.version_number == latest_versions.c.version_number),
        )
        .where(
            Dataset.organization_id == current_user.organization_id,
            Dataset.is_active.is_(True),
        )
        .order_by(Dataset.created_at.desc())
    )

    result = await db.execute(query)
    datasets = [
        DatasetResponse.model_validate(dataset).model_copy(
            update={
                "version": version.version_number if version else None,
                "row_count": version.row_count if version else None,
                "column_count": version.column_count if version else None,
            }
        )
        for dataset, version in result.all()
    ]

    return DatasetListResponse(
        items=datasets,
        total=len(datasets),
    )


@router.get(
    "/{dataset_id}",
    response_model=DatasetResponse,
)
async def get_dataset(
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

    return dataset


@router.delete(
    "/{dataset_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_dataset(
    dataset_id: UUID,
    current_user: User = Depends(
        require_permission("dataset:delete")
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

    dataset.is_active = False
    dataset.status = "deleted"

    await db.commit()

    return None

@router.post(
    "/{dataset_id}/upload",
    status_code=status.HTTP_201_CREATED,
)
async def upload_dataset_file(
    dataset_id: UUID,
    file: UploadFile = File(...),
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

    ingestion_result = await save_and_validate_file(
        file=file,
        organization_id=current_user.organization_id,
        dataset_id=dataset.id,
    )

    latest_version = await db.scalar(
        select(DatasetVersion.version_number)
        .where(
            DatasetVersion.dataset_id == dataset.id
        )
        .order_by(
            DatasetVersion.version_number.desc()
        )
        .limit(1)
    )

    next_version = (
        (latest_version + 1)
        if latest_version is not None
        else 1
    )

    version = DatasetVersion(
        dataset_id=dataset.id,
        version_number=next_version,
        row_count=ingestion_result["row_count"],
        column_count=ingestion_result["column_count"],
        file_size=ingestion_result["file_size"],
        created_by=current_user.id,
    )

    data_source = DataSource(
        organization_id=current_user.organization_id,
        dataset_id=dataset.id,
        source_type=file.content_type or "unknown",
        file_name=file.filename,
        file_path=ingestion_result["file_path"],
    )

    db.add(version)
    db.add(data_source)

    await db.commit()

    return {
        "message": "Dataset uploaded successfully.",
        "dataset_id": str(dataset.id),
        "version": next_version,
        "file_name": file.filename,
        "file_size": ingestion_result["file_size"],
        "row_count": ingestion_result["row_count"],
        "column_count": ingestion_result["column_count"],
        "columns": ingestion_result["columns"],
    }