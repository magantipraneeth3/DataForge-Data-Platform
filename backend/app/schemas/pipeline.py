from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PipelineCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    description: str | None = None
    schedule: str | None = None
    dataset_id: UUID


class PipelineResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    schedule: str | None
    dataset_id: UUID
    is_active: bool
    organization_id: UUID
    created_by: UUID

    model_config = {"from_attributes": True}


class PipelineRunResponse(BaseModel):
    id: UUID
    pipeline_id: UUID
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
    created_by: UUID

    model_config = {"from_attributes": True}