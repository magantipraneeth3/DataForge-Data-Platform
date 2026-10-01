import os
from datetime import datetime
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine

from airflow import DAG
from airflow.operators.python import PythonOperator


# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------


def resolve_project_root() -> Path:
    candidates = [
        Path(os.getenv("DATAFORGE_PROJECT_ROOT", "")).expanduser(),
        Path("/opt/airflow/project"),
        Path(__file__).resolve().parents[2],
        Path(__file__).resolve().parents[1],
    ]

    for candidate in candidates:
        if candidate.exists() and (candidate / "backend").exists():
            return candidate

    return Path("/opt/airflow/project")


PROJECT_ROOT = resolve_project_root()

DATASET_PATH = (
    PROJECT_ROOT
    / "backend"
    / "storage"
    / "uploads"
    / "19286b54-4fba-4410-a1d1-fd8a65b24814"
    / "a1b07f45-d01b-49d5-8044-8cc32a74ceb1"
    / "customers.csv"
)

PROCESSED_PATH = (
    PROJECT_ROOT
    / "backend"
    / "storage"
    / "airflow_processed"
    / "customers_cleaned.csv"
)


def build_database_url() -> str:
    env_url = os.getenv("DATAFORGE_DATABASE_URL")
    if env_url:
        return env_url

    db_user = os.getenv("POSTGRES_USER", "dataforge_user")
    db_password = os.getenv("POSTGRES_PASSWORD", "dataforge_password")
    db_host = os.getenv("POSTGRES_HOST", "host.docker.internal")
    db_port = os.getenv("POSTGRES_PORT", "5434")
    db_name = os.getenv("POSTGRES_DB", "dataforge")

    return (
        f"postgresql+psycopg2://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    )


DATABASE_URL = build_database_url()


# ---------------------------------------------------------
# Extract
# ---------------------------------------------------------

def extract_data():
    print("Starting DataForge extraction...")

    if not DATASET_PATH.exists():
        raise FileNotFoundError(
            f"Dataset not found: {DATASET_PATH}"
        )

    df = pd.read_csv(DATASET_PATH)

    print("Dataset loaded successfully.")
    print(f"Rows: {len(df)}")
    print(f"Columns: {len(df.columns)}")
    print(f"Columns: {list(df.columns)}")

    df.to_csv(
        "/tmp/dataforge_extracted.csv",
        index=False,
    )


# ---------------------------------------------------------
# Validate
# ---------------------------------------------------------

def validate_data():
    print("Validating DataForge dataset...")

    input_path = Path("/tmp/dataforge_extracted.csv")

    if not input_path.exists():
        raise FileNotFoundError(
            "Extracted dataset was not found."
        )

    df = pd.read_csv(input_path)

    required_columns = {
        "customer_id",
        "age",
        "monthly_charges",
        "tenure",
        "churn",
    }

    missing_columns = required_columns - set(df.columns)

    if missing_columns:
        raise ValueError(
            f"Missing required columns: {missing_columns}"
        )

    if df.empty:
        raise ValueError("Dataset is empty.")

    print("Schema validation successful.")
    print(
        f"Missing values: "
        f"{df.isnull().sum().sum()}"
    )
    print(
        f"Duplicate rows: "
        f"{df.duplicated().sum()}"
    )


# ---------------------------------------------------------
# Transform
# ---------------------------------------------------------

def transform_data():
    print("Transforming DataForge dataset...")

    input_path = Path("/tmp/dataforge_extracted.csv")

    if not input_path.exists():
        raise FileNotFoundError(
            "Extracted dataset was not found."
        )

    df = pd.read_csv(input_path)

    # Remove duplicate records
    df = df.drop_duplicates()

    # Clean column names
    df.columns = [
        column.strip().lower().replace(" ", "_")
        for column in df.columns
    ]

    # Numeric conversion
    numeric_columns = [
        "age",
        "monthly_charges",
        "tenure",
    ]

    for column in numeric_columns:
        df[column] = pd.to_numeric(
            df[column],
            errors="coerce",
        )

    # Remove rows with invalid critical values
    df = df.dropna(
        subset=[
            "customer_id",
            "age",
            "monthly_charges",
            "tenure",
        ]
    )

    # Normalize churn values
    if df["churn"].dtype == "object":
        df["churn"] = (
            df["churn"]
            .astype(str)
            .str.strip()
            .str.lower()
        )

    output_directory = PROCESSED_PATH.parent

    output_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    df.to_csv(
        PROCESSED_PATH,
        index=False,
    )

    print("Transformation completed.")
    print(f"Final rows: {len(df)}")
    print(f"Final columns: {len(df.columns)}")
    print(f"Output: {PROCESSED_PATH}")


# ---------------------------------------------------------
# Load / Prepare
# ---------------------------------------------------------

def load_data():
    print("Loading transformed data...")

    if not PROCESSED_PATH.exists():
        raise FileNotFoundError(
            "Transformed dataset not found."
        )

    df = pd.read_csv(PROCESSED_PATH)

    print(
        f"Prepared {len(df)} records "
        "for the analytics layer."
    )

    print(df.head())


# ---------------------------------------------------------
# Load to PostgreSQL
# ---------------------------------------------------------

def load_to_postgresql():
    print("Loading transformed data into PostgreSQL...")

    if not PROCESSED_PATH.exists():
        raise FileNotFoundError(
            "Processed dataset not found."
        )

    df = pd.read_csv(PROCESSED_PATH)

    print(f"Rows to load: {len(df)}")
    print(f"Columns to load: {list(df.columns)}")

    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
    )

    try:
        df.to_sql(
            "customer_churn_analytics",
            engine,
            if_exists="replace",
            index=False,
        )

        print(
            "Successfully loaded "
            f"{len(df)} rows into "
            "customer_churn_analytics."
        )

    finally:
        engine.dispose()


# ---------------------------------------------------------
# Data Quality
# ---------------------------------------------------------

def run_quality_check():
    print("Running final DataForge quality check...")

    if not PROCESSED_PATH.exists():
        raise FileNotFoundError(
            "Processed dataset not found."
        )

    df = pd.read_csv(PROCESSED_PATH)

    total_rows = len(df)
    total_columns = len(df.columns)

    missing_values = int(
        df.isnull().sum().sum()
    )

    duplicate_rows = int(
        df.duplicated().sum()
    )

    if total_rows == 0:
        raise ValueError(
            "Quality check failed: dataset is empty."
        )

    quality_score = 100.0

    missing_rate = (
        missing_values
        / (total_rows * total_columns)
    )

    duplicate_rate = (
        duplicate_rows
        / total_rows
    )

    quality_score -= missing_rate * 50
    quality_score -= duplicate_rate * 30

    quality_score = max(
        0,
        min(100, quality_score),
    )

    print("================================")
    print("DATAFORGE DATA QUALITY REPORT")
    print("================================")
    print(f"Rows: {total_rows}")
    print(f"Columns: {total_columns}")
    print(f"Missing values: {missing_values}")
    print(f"Duplicate rows: {duplicate_rows}")
    print(f"Quality score: {quality_score:.2f}")
    print("================================")

    if quality_score < 70:
        raise ValueError(
            "Data quality score is below 70."
        )

    print(
        "Data quality validation "
        "completed successfully."
    )


# ---------------------------------------------------------
# DAG
# ---------------------------------------------------------

with DAG(
    dag_id="dataforge_customer_churn_etl",
    description=(
        "DataForge Customer Churn ETL "
        "and Data Quality Pipeline"
    ),
    start_date=datetime(2026, 1, 1),
    schedule=None,
    catchup=False,
    tags=[
        "dataforge",
        "etl",
        "customer-churn",
        "data-quality",
    ],
) as dag:

    extract = PythonOperator(
        task_id="extract_data",
        python_callable=extract_data,
    )

    validate = PythonOperator(
        task_id="validate_data",
        python_callable=validate_data,
    )

    transform = PythonOperator(
        task_id="transform_data",
        python_callable=transform_data,
    )

    load = PythonOperator(
        task_id="load_data",
        python_callable=load_data,
    )

    load_postgres = PythonOperator(
        task_id="load_to_postgresql",
        python_callable=load_to_postgresql,
    )

    quality_check = PythonOperator(
        task_id="quality_check",
        python_callable=run_quality_check,
    )

    extract >> validate >> transform >> load >> load_postgres >> quality_check