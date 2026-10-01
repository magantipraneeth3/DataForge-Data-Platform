from pathlib import Path
from uuid import UUID

import pandas as pd
from fastapi import HTTPException, UploadFile, status


ALLOWED_EXTENSIONS = {".csv", ".json", ".xlsx"}

UPLOAD_DIR = Path("storage/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


async def save_and_validate_file(
    file: UploadFile,
    organization_id: UUID,
    dataset_id: UUID,
):
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File name is required.",
        )

    extension = Path(file.filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Unsupported file type. "
                "Allowed types: CSV, JSON, XLSX."
            ),
        )

    organization_dir = UPLOAD_DIR / str(organization_id)
    dataset_dir = organization_dir / str(dataset_id)

    dataset_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    file_path = dataset_dir / file.filename

    contents = await file.read()

    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    file_path.write_bytes(contents)

    try:
        if extension == ".csv":
            dataframe = pd.read_csv(file_path)

        elif extension == ".json":
            dataframe = pd.read_json(file_path)

        elif extension == ".xlsx":
            dataframe = pd.read_excel(file_path)

    except Exception as exc:
        file_path.unlink(missing_ok=True)

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unable to parse uploaded file: {exc}",
        )

    if dataframe.empty:
        file_path.unlink(missing_ok=True)

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded dataset contains no rows.",
        )

    dataframe.columns = [
        str(column).strip().lower().replace(" ", "_")
        for column in dataframe.columns
    ]

    dataframe = dataframe.dropna(
        how="all"
    )

    return {
        "file_path": str(file_path),
        "file_size": len(contents),
        "row_count": len(dataframe),
        "column_count": len(dataframe.columns),
        "columns": dataframe.columns.tolist(),
        "dataframe": dataframe,
    }