from uuid import UUID

from pydantic import BaseModel, Field


class DatasetCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=1000)


class DatasetResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    status: str
    is_active: bool
    organization_id: UUID
    created_by: UUID
    version: int | None = None
    row_count: int | None = None
    column_count: int | None = None

    model_config = {
        "from_attributes": True
    }


class DatasetListResponse(BaseModel):
    items: list[DatasetResponse]
    total: int