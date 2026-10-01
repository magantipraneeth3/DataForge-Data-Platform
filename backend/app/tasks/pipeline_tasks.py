import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from celery import Task
from sqlalchemy import select

from app.core.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.models.data_quality_result import DataQualityResult
from app.models.data_source import DataSource
from app.models.dataset_version import DatasetVersion
from app.models.pipeline import Pipeline
from app.models.pipeline_run import PipelineRun
from app.models.pipeline_task import PipelineTask
from app.services.data_quality import analyze_dataset, clean_dataset_dates


logger = logging.getLogger(__name__)


async def execute_pipeline_run(
    pipeline_run_id: str,
    pipeline_task_id: str,
):
    async with AsyncSessionLocal() as db:

        # ---------------------------------------------------------
        # 1. Load pipeline run
        # ---------------------------------------------------------
        pipeline_run = await db.scalar(
            select(PipelineRun).where(
                PipelineRun.id == UUID(pipeline_run_id)
            )
        )

        pipeline_task = await db.scalar(
            select(PipelineTask).where(
                PipelineTask.id == UUID(pipeline_task_id)
            )
        )

        if not pipeline_run:
            logger.error("Pipeline run %s failed: run record not found", pipeline_run_id)
            raise ValueError(
                "Pipeline run not found."
            )

        if not pipeline_task:
            message = "Pipeline task not found."
            pipeline_run.status = "failed"
            pipeline_run.completed_at = datetime.now(timezone.utc)
            pipeline_run.error_message = message
            await db.commit()
            logger.error("Pipeline run %s failed: %s", pipeline_run_id, message)
            raise ValueError(message)

        # ---------------------------------------------------------
        # 2. Load the actual pipeline
        # ---------------------------------------------------------
        pipeline = await db.scalar(
            select(Pipeline).where(
                Pipeline.id == pipeline_run.pipeline_id,
                Pipeline.organization_id == pipeline_run.organization_id,
                Pipeline.is_active.is_(True),
            )
        )

        if not pipeline:
            message = "Pipeline not found or is inactive."
            pipeline_run.status = "failed"
            pipeline_run.completed_at = datetime.now(timezone.utc)
            pipeline_run.error_message = message
            pipeline_task.status = "failed"
            pipeline_task.completed_at = datetime.now(timezone.utc)
            pipeline_task.error_message = message
            await db.commit()
            logger.error("Pipeline run %s failed: %s", pipeline_run_id, message)
            raise ValueError(
                message
            )

        # ---------------------------------------------------------
        # 3. Mark pipeline as running
        # ---------------------------------------------------------
        started_at = datetime.now(timezone.utc)
        pipeline_run.status = "running"
        pipeline_run.started_at = started_at

        pipeline_task.status = "running"
        pipeline_task.started_at = started_at
        pipeline_task.attempt += 1

        await db.commit()
        logger.info("Pipeline run %s started", pipeline_run_id)

        cleaned_file_path = None
        try:

            # -----------------------------------------------------
            # 4. Get the dataset explicitly linked to the pipeline
            # -----------------------------------------------------
            dataset_id = pipeline.dataset_id

            # -----------------------------------------------------
            # 5. Get the latest version of that dataset
            # -----------------------------------------------------
            latest_version = await db.scalar(
                select(DatasetVersion)
                .where(
                    DatasetVersion.dataset_id == dataset_id
                )
                .order_by(
                    DatasetVersion.version_number.desc()
                )
                .limit(1)
            )

            if not latest_version:
                raise ValueError(
                    "No dataset version found for the pipeline dataset."
                )

            # -----------------------------------------------------
            # 6. Get the dataset source file
            # -----------------------------------------------------
            data_source = await db.scalar(
                select(DataSource)
                .where(
                    DataSource.dataset_id == dataset_id,
                    DataSource.organization_id
                    == pipeline_run.organization_id,
                )
                .order_by(
                    DataSource.created_at.desc()
                )
                .limit(1)
            )

            if not data_source:
                raise ValueError(
                    "No data source found for the pipeline dataset."
                )

            # -----------------------------------------------------
            # 7. Validate file
            # -----------------------------------------------------
            file_path = Path(data_source.file_path)

            if not file_path.exists():
                raise FileNotFoundError(
                    f"Dataset file not found: {file_path}"
                )

            cleaned_file_path = file_path.with_name(
                f"{file_path.stem}_cleaned_{pipeline_run.id.hex[:8]}{file_path.suffix}"
            )
            cleaning_result = clean_dataset_dates(
                str(file_path),
                str(cleaned_file_path),
            )

            logger.info(
                "Pipeline run %s normalized date columns %s",
                pipeline_run_id,
                cleaning_result["date_columns"],
            )

            # -----------------------------------------------------
            # 8. Run data quality analysis against cleaned data
            # -----------------------------------------------------
            quality_result = analyze_dataset(
                str(cleaned_file_path)
            )

            cleaned_version = DatasetVersion(
                dataset_id=dataset_id,
                version_number=latest_version.version_number + 1,
                row_count=cleaning_result["row_count"],
                column_count=cleaning_result["column_count"],
                file_size=cleaning_result["file_size"],
                created_by=pipeline_run.created_by,
            )
            db.add(cleaned_version)
            await db.flush()

            cleaned_source = DataSource(
                organization_id=pipeline_run.organization_id,
                dataset_id=dataset_id,
                source_type=data_source.source_type,
                file_name=cleaned_file_path.name,
                file_path=str(cleaned_file_path),
            )
            db.add(cleaned_source)

            # -----------------------------------------------------
            # 9. Save data quality result
            # -----------------------------------------------------
            result = DataQualityResult(
                organization_id=pipeline_run.organization_id,
                dataset_id=dataset_id,
                dataset_version_id=cleaned_version.id,
                total_rows=quality_result["total_rows"],
                total_columns=quality_result["total_columns"],
                missing_values=quality_result["missing_values"],
                duplicate_rows=quality_result["duplicate_rows"],
                quality_score=quality_result["quality_score"],
                column_statistics=quality_result["column_statistics"],
            )

            db.add(result)

            # -----------------------------------------------------
            # 10. Mark task successful
            # -----------------------------------------------------
            pipeline_task.status = "success"
            pipeline_task.completed_at = datetime.now(timezone.utc)

            pipeline_run.status = "completed"
            pipeline_run.completed_at = datetime.now(timezone.utc)
            pipeline_run.error_message = None

            await db.commit()
            logger.info("Pipeline run %s completed", pipeline_run_id)

        except Exception as exc:

            if cleaned_file_path is not None:
                cleaned_file_path.unlink(missing_ok=True)

            # -----------------------------------------------------
            # 11. Mark task and pipeline as failed
            # -----------------------------------------------------
            pipeline_task.status = "failed"
            pipeline_task.completed_at = datetime.now(timezone.utc)
            pipeline_task.error_message = str(exc)

            pipeline_run.status = "failed"
            pipeline_run.completed_at = datetime.now(timezone.utc)
            pipeline_run.error_message = str(exc)

            await db.commit()
            logger.exception("Pipeline run %s failed", pipeline_run_id)

            raise


@celery_app.task(
    bind=True,
    name="dataforge.execute_pipeline",
)
def execute_pipeline(
    self: Task,
    pipeline_run_id: str,
    pipeline_task_id: str,
):
    return asyncio.run(
        execute_pipeline_run(
            pipeline_run_id=pipeline_run_id,
            pipeline_task_id=pipeline_task_id,
        )
    )