from datetime import date
from itertools import combinations
from pathlib import Path
import re

import pandas as pd


def _read_dataset(path: Path) -> pd.DataFrame:
    extension = path.suffix.lower()
    if extension == ".csv":
        return pd.read_csv(path)
    if extension == ".json":
        return pd.read_json(path)
    if extension == ".xlsx":
        return pd.read_excel(path)
    raise ValueError("Unsupported dataset format.")


def _detect_date_columns(df: pd.DataFrame):
    date_columns = []
    parsed_dates = {}
    for column in df.columns:
        series = df[column]
        if not (
            pd.api.types.is_datetime64_any_dtype(series)
            or pd.api.types.is_object_dtype(series)
            or pd.api.types.is_string_dtype(series)
        ):
            continue

        parsed = pd.to_datetime(
            series,
            errors="coerce",
            utc=True,
            format="mixed",
        )
        non_missing = int(series.notna().sum())
        parsed_count = int(parsed.notna().sum())
        name_suggests_date = bool(
            re.search(r"date|time|timestamp", str(column), re.IGNORECASE)
        )
        if parsed_count and (
            name_suggests_date
            or parsed_count / max(non_missing, 1) >= 0.8
        ):
            date_columns.append(str(column))
            parsed_dates[str(column)] = parsed

    return date_columns, parsed_dates


def _is_currency_column(column: str) -> bool:
    return bool(
        re.search(
            r"amount|price|cost|charge|revenue|salary|fee|billing",
            column,
            re.IGNORECASE,
        )
    )


def clean_dataset_dates(source_path: str, output_path: str) -> dict:
    source = Path(source_path)
    output = Path(output_path)
    df = _read_dataset(source)
    date_columns, parsed_dates = _detect_date_columns(df)

    for column in date_columns:
        parsed = parsed_dates[column]
        has_time = bool(
            (
                (parsed.dt.hour != 0)
                | (parsed.dt.minute != 0)
                | (parsed.dt.second != 0)
            ).any()
        )
        date_format = (
            "%Y-%m-%dT%H:%M:%SZ" if has_time else "%Y-%m-%d"
        )
        normalized = parsed.dt.strftime(date_format)
        df[column] = normalized.where(parsed.notna(), df[column])

    output.parent.mkdir(parents=True, exist_ok=True)
    extension = output.suffix.lower()
    if extension == ".csv":
        df.to_csv(output, index=False)
    elif extension == ".json":
        df.to_json(output, orient="records", date_format="iso")
    elif extension == ".xlsx":
        df.to_excel(output, index=False)
    else:
        raise ValueError("Unsupported dataset format.")

    return {
        "row_count": len(df),
        "column_count": len(df.columns),
        "file_size": output.stat().st_size,
        "date_columns": date_columns,
    }


def analyze_dataset(
    file_path: str,
    date_column: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    offset: int = 0,
    limit: int = 100,
    dashboard: bool = False,
) -> dict:
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(
            f"Dataset file not found: {file_path}"
        )

    df = _read_dataset(path)
    date_columns, parsed_dates = _detect_date_columns(df)

    selected_date_column = date_column
    if not selected_date_column and date_columns:
        selected_date_column = min(
            date_columns,
            key=lambda column: (
                not bool(re.search(r"date|time|timestamp", column, re.IGNORECASE)),
                column,
            ),
        )

    if date_from or date_to:
        if not selected_date_column:
            raise ValueError("This dataset has no date column to filter by.")
        if selected_date_column not in parsed_dates:
            raise ValueError("Select a valid date column from this dataset.")
        if date_from and date_to and date_from > date_to:
            raise ValueError("Start date must not be after end date.")

        parsed = parsed_dates[selected_date_column]
        mask = parsed.notna()
        if date_from:
            mask &= parsed.dt.date >= date_from
        if date_to:
            mask &= parsed.dt.date <= date_to
        df = df.loc[mask]

    total_rows = len(df)
    total_columns = len(df.columns)

    missing_values = int(df.isnull().sum().sum())
    duplicate_rows = int(df.duplicated().sum())

    excluded_columns = {
        str(column)
        for column in df.columns
        if str(column) in date_columns
        or re.search(
            r"date|time|timestamp|(^|_)month($|_)|(^|_)year($|_)",
            str(column),
            re.IGNORECASE,
        )
    } if dashboard else set()
    display_columns = [
        column for column in df.columns if str(column) not in excluded_columns
    ]

    column_statistics = {}
    numeric_summary = []
    numeric_columns = []
    missing_by_column = []
    categorical_distributions = []

    for column in display_columns:
        series = df[column]

        missing_count = int(series.isnull().sum())
        unique_count = int(series.nunique(dropna=True))

        statistics = {
            "data_type": str(series.dtype),
            "missing_count": missing_count,
            "missing_percentage": round(
                (missing_count / total_rows) * 100,
                2,
            ) if total_rows else 0,
            "unique_count": unique_count,
        }
        if missing_count:
            missing_by_column.append(
                {"column": str(column), "missing": missing_count}
            )

        if pd.api.types.is_numeric_dtype(series):
            mean = float(series.mean()) if not series.dropna().empty else None
            minimum = float(series.min()) if not series.dropna().empty else None
            maximum = float(series.max()) if not series.dropna().empty else None
            statistics["min"] = (
                minimum
            )
            statistics["max"] = maximum
            statistics["mean"] = mean
            is_identifier = bool(
                re.search(
                    r"(^|_)(id|key|index)($|_)|identifier",
                    str(column),
                    re.IGNORECASE,
                )
            )
            if mean is not None and not is_identifier:
                numeric_columns.append(column)
                numeric_summary.append(
                    {
                        "column": str(column),
                        "mean": round(mean, 2),
                        "min": minimum,
                        "max": maximum,
                        "currency": _is_currency_column(str(column)),
                    }
                )
        elif (
            not re.search(r"(^|_)(id|key|index)($|_)|identifier", str(column), re.IGNORECASE)
            and unique_count > 1
            and unique_count <= 20
        ):
            counts = series.dropna().astype(str).value_counts().head(10)
            if len(counts) > 1:
                categorical_distributions.append(
                    {
                        "column": str(column),
                        "items": [
                            {"label": label, "count": int(count)}
                            for label, count in counts.items()
                        ],
                    }
                )

        column_statistics[str(column)] = statistics

    numeric_relationships = []
    for x_column, y_column in combinations(numeric_columns, 2):
        pair = df[[x_column, y_column]].dropna()
        if pair.empty:
            continue
        if len(pair) > 250:
            pair = pair.sample(n=250, random_state=0)
        correlation = df[x_column].corr(df[y_column])
        numeric_relationships.append(
            {
                "x_column": str(x_column),
                "y_column": str(y_column),
                "x_currency": _is_currency_column(str(x_column)),
                "y_currency": _is_currency_column(str(y_column)),
                "correlation": (
                    round(float(correlation), 3)
                    if pd.notna(correlation)
                    else None
                ),
                "points": [
                    {"x": float(row[x_column]), "y": float(row[y_column])}
                    for _, row in pair.iterrows()
                ],
            }
        )
        if len(numeric_relationships) == 3:
            break

    if dashboard:
        total_columns = len(display_columns)
        missing_values = int(df[display_columns].isnull().sum().sum())
    total_cells = total_rows * total_columns

    missing_rate = (
        missing_values / total_cells
        if total_cells
        else 0
    )

    duplicate_rate = (
        duplicate_rows / total_rows
        if total_rows
        else 0
    )

    score = 100

    score -= missing_rate * 50
    score -= duplicate_rate * 30

    score = max(0, min(100, score))

    page = df.iloc[offset : offset + limit]

    return {
        "total_rows": total_rows,
        "total_columns": total_columns,
        "missing_values": missing_values,
        "duplicate_rows": duplicate_rows,
        "quality_score": round(score, 2),
        "column_statistics": column_statistics,
        "date_columns": date_columns,
        "numeric_summary": numeric_summary,
        "numeric_relationships": numeric_relationships,
        "missing_by_column": missing_by_column,
        "categorical_distributions": categorical_distributions,
        "offset": offset,
        "page_size": limit,
        "preview": [
            {
                str(column): _json_value(value)
                for column, value in row.items()
            }
            for row in page[display_columns].to_dict(orient="records")
        ],
    }


def _json_value(value):
    try:
        missing = pd.isna(value)
        if not hasattr(missing, "__iter__") and bool(missing):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "item"):
        return value.item()
    return value