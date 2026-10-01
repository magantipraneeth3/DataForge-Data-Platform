import asyncio
import csv
from datetime import date
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.analytics import get_dataset_analytics, get_pipeline_analytics
from app.services.data_quality import analyze_dataset, clean_dataset_dates


class StubDatabase:
    def __init__(self, *results):
        self.results = iter(results)
        self.statements = []

    async def scalar(self, statement):
        self.statements.append(statement)
        return next(self.results)


def test_dataset_analytics_returns_analysis_for_organization_dataset(
    monkeypatch,
) -> None:
    dataset_id = uuid4()
    organization_id = uuid4()
    dataset = SimpleNamespace(id=dataset_id, name="Customers")
    data_source = SimpleNamespace(
        file_path="/uploads/customers_cleaned_a1b2c3d4.csv",
        file_name="customers_cleaned_a1b2c3d4.csv",
    )
    metrics = {
        "total_rows": 12,
        "total_columns": 2,
        "missing_values": 1,
        "duplicate_rows": 0,
        "quality_score": 98.0,
        "column_statistics": {},
        "date_columns": [],
        "preview": [],
    }
    monkeypatch.setattr(
        "app.api.analytics.analyze_dataset",
        lambda file_path, **filters: metrics,
    )
    db = StubDatabase(dataset, data_source)

    result = asyncio.run(
        get_dataset_analytics(
            dataset_id=dataset_id,
            db=db,
            current_user=SimpleNamespace(organization_id=organization_id),
        )
    )

    assert "datasets.organization_id" in str(db.statements[0])
    assert result == {
        "dataset_id": str(dataset_id),
        "dataset_name": "Customers (Cleaned)",
        "analytics": metrics,
    }


def test_dataset_analytics_hides_datasets_from_other_organizations() -> None:
    with pytest.raises(HTTPException) as error:
        asyncio.run(
            get_dataset_analytics(
                dataset_id=uuid4(),
                db=StubDatabase(None),
                current_user=SimpleNamespace(organization_id=uuid4()),
            )
        )

    assert error.value.status_code == 404


def test_pipeline_id_returns_analytics_for_its_completed_cleaned_run(
    monkeypatch,
) -> None:
    pipeline_id = uuid4()
    run_id = uuid4()
    dataset_id = uuid4()
    organization_id = uuid4()
    pipeline = SimpleNamespace(id=pipeline_id, dataset_id=dataset_id)
    pipeline_run = SimpleNamespace(id=run_id)
    dataset = SimpleNamespace(id=dataset_id, name="Orders")
    data_source = SimpleNamespace(
        file_path="/uploads/orders_cleaned_12345678.csv",
        file_name=f"orders_cleaned_{run_id.hex[:8]}.csv",
    )
    metrics = {"total_rows": 5, "preview": []}
    monkeypatch.setattr(
        "app.api.analytics.analyze_dataset",
        lambda file_path, **filters: metrics,
    )
    db = StubDatabase(pipeline, pipeline_run, dataset, data_source)

    result = asyncio.run(
        get_pipeline_analytics(
            pipeline_or_run_id=pipeline_id,
            db=db,
            current_user=SimpleNamespace(organization_id=organization_id),
        )
    )

    assert result == {
        "dataset_id": str(dataset_id),
        "dataset_name": "Orders (Cleaned)",
        "analytics": metrics,
    }
    expected_source_pattern = f"%_cleaned_{run_id.hex[:8]}%"
    assert expected_source_pattern in db.statements[3].compile().params.values()


def test_pipeline_analytics_requires_a_successful_run() -> None:
    pipeline = SimpleNamespace(id=uuid4(), dataset_id=uuid4())

    with pytest.raises(HTTPException) as error:
        asyncio.run(
            get_pipeline_analytics(
                pipeline_or_run_id=pipeline.id,
                db=StubDatabase(pipeline, None),
                current_user=SimpleNamespace(organization_id=uuid4()),
            )
        )

    assert error.value.status_code == 404


def test_dataset_analytics_filters_rows_by_selected_date_range(tmp_path) -> None:
    dataset_file = tmp_path / "orders.csv"
    dataset_file.write_text(
        "order_date,month,year,amount\n"
        "2026-09-01,9,2026,100\n"
        "2026-09-15,9,2026,200\n"
        "2026-10-01,10,2026,300\n",
        encoding="utf-8",
    )

    result = analyze_dataset(
        str(dataset_file),
        date_column="order_date",
        date_from=date(2026, 9, 10),
        date_to=date(2026, 9, 30),
        dashboard=True,
    )

    assert result["total_rows"] == 1
    assert result["date_columns"] == ["order_date"]
    assert result["preview"] == [{"amount": 200}]
    assert result["total_columns"] == 1
    assert "order_date" not in result["column_statistics"]
    assert "month" not in result["column_statistics"]
    assert "year" not in result["column_statistics"]
    assert result["numeric_summary"] == [
        {
            "column": "amount",
            "mean": 200.0,
            "min": 200.0,
            "max": 200.0,
            "currency": True,
        }
    ]


def test_dataset_analytics_returns_paginated_rows_and_full_summary(tmp_path) -> None:
    dataset_file = tmp_path / "customers.csv"
    dataset_file.write_text(
        "customer_id,monthly_charges,tenure,churn,notes\n"
        "C001,10,1,No,\n"
        "C002,20,2,Yes,ok\n"
        "C003,30,3,No,\n",
        encoding="utf-8",
    )

    result = analyze_dataset(
        str(dataset_file), offset=1, limit=1, dashboard=True
    )

    assert result["total_rows"] == 3
    assert result["offset"] == 1
    assert result["page_size"] == 1
    assert result["preview"] == [
        {
            "customer_id": "C002",
            "monthly_charges": 20,
            "tenure": 2,
            "churn": "Yes",
            "notes": "ok",
        }
    ]
    assert result["numeric_summary"][0]["mean"] == 20.0
    assert result["categorical_distributions"] == [
        {
            "column": "churn",
            "items": [
                {"label": "No", "count": 2},
                {"label": "Yes", "count": 1},
            ],
        }
    ]
    assert result["missing_by_column"] == [{"column": "notes", "missing": 2}]
    assert result["numeric_relationships"][0]["x_column"] == "monthly_charges"
    assert result["numeric_relationships"][0]["y_column"] == "tenure"
    assert result["numeric_relationships"][0]["x_currency"] is True
    assert result["numeric_relationships"][0]["y_currency"] is False
    assert len(result["numeric_relationships"][0]["points"]) == 3


def test_data_quality_analysis_keeps_date_columns_by_default(tmp_path) -> None:
    dataset_file = tmp_path / "orders.csv"
    dataset_file.write_text(
        "order_date,amount\n2026-09-15,200\n",
        encoding="utf-8",
    )

    result = analyze_dataset(str(dataset_file))

    assert result["total_columns"] == 2
    assert "order_date" in result["column_statistics"]
    assert result["preview"] == [
        {"order_date": "2026-09-15", "amount": 200}
    ]


def test_pipeline_date_cleaning_normalizes_values_without_replacing_source(
    tmp_path,
) -> None:
    source = tmp_path / "orders.csv"
    cleaned = tmp_path / "orders_cleaned_run.csv"
    source.write_text(
        "order_date,created_at,amount\n"
        "09/15/2026,2026-09-15T08:30:00Z,10\n"
        "2026-09-16,2026-09-16T12:00:00+00:00,11\n",
        encoding="utf-8",
    )

    result = clean_dataset_dates(str(source), str(cleaned))

    with cleaned.open(newline="", encoding="utf-8") as file:
        rows = list(csv.DictReader(file))

    assert result["date_columns"] == ["order_date", "created_at"]
    assert rows == [
        {
            "order_date": "2026-09-15",
            "created_at": "2026-09-15T08:30:00Z",
            "amount": "10",
        },
        {
            "order_date": "2026-09-16",
            "created_at": "2026-09-16T12:00:00Z",
            "amount": "11",
        },
    ]
    assert "09/15/2026" in source.read_text(encoding="utf-8")