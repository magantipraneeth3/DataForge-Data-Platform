"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, getToken } from "../../lib/api";

type QualityResult = {
  quality_score?: number;
  total_rows?: number;
  total_columns?: number;
  missing_values?: number;
  duplicate_rows?: number;
  column_stats?: Record<string, unknown>;
};

type DatasetOption = {
  id: string;
  name: string;
};

export default function DataQualityPage() {
  const [datasetId, setDatasetId] = useState("");
  const [datasets, setDatasets] = useState<DatasetOption[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(true);

  const [result, setResult] =
    useState<QualityResult | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [loadingLatest, setLoadingLatest] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [emptyMessage, setEmptyMessage] = useState(
    "Enter a Dataset ID or select a dataset to begin."
  );

  const loadLatestQuality = async (id: string) => {
    const token = getToken();
    if (!token) {
      setError("Your session has expired. Please log in again.");
      return;
    }

    setLoadingLatest(true);
    setResult(null);
    setError("");
    setEmptyMessage("No quality analysis has been run for this dataset yet.");

    try {
      const response = await apiFetch(
        `/data-quality/${encodeURIComponent(id)}/latest`
      );
      const data = await response.json().catch(() => null);

      if (response.status === 404) {
        const detail = getDetail(data);
        if (detail === "Dataset not found.") {
          setError("Dataset not found.");
        }
        return;
      }

      if (response.status === 401) {
        setError("Your session has expired. Please log in again.");
        return;
      }

      if (!response.ok) {
        logQualityFailure("load latest result", response.status, data);
        setError(
          response.status >= 500
            ? "Data quality analysis failed. Please try again."
            : getDetail(data) || "Unable to load quality results."
        );
        return;
      }

      setResult(normalizeQualityResult(data));
    } catch (err) {
      logQualityFailure("load latest result", undefined, err);
      setError("Unable to connect to the DataForge API.");
    } finally {
      setLoadingLatest(false);
    }
  };

  useEffect(() => {
    const queryDatasetId = new URLSearchParams(window.location.search)
      .get("dataset_id")
      ?.trim();

    if (queryDatasetId) {
      setDatasetId(queryDatasetId);
      void loadLatestQuality(queryDatasetId);
    }

    const loadDatasets = async () => {
      const token = getToken();
      if (!token) {
        setError("Your session has expired. Please log in again.");
        setDatasetsLoading(false);
        return;
      }

      try {
        const response = await apiFetch("/datasets");
        const data = await response.json().catch(() => null);

        if (response.status === 401) {
          setError("Your session has expired. Please log in again.");
          return;
        }

        if (!response.ok) {
          logQualityFailure("load datasets", response.status, data);
          setError(getDetail(data) || "Unable to load datasets.");
          return;
        }

        setDatasets(normalizeDatasets(data));
      } catch (err) {
        logQualityFailure("load datasets", undefined, err);
        setError("Unable to connect to the DataForge API.");
      } finally {
        setDatasetsLoading(false);
      }
    };

    void loadDatasets();
  }, []);

  const analyzeDataset = async () => {
    if (!getToken()) {
      setError("Your session has expired. Please log in again.");
      return;
    }

    if (!datasetId.trim()) {
      setError("Please enter a dataset ID.");
      return;
    }

    setAnalyzing(true);
    setError("");
    setSuccess("");

    try {
      const response = await apiFetch(
        `/data-quality/${encodeURIComponent(datasetId.trim())}/analyze`,
        { method: "POST" }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        logQualityFailure("analyze dataset", response.status, data);
        if (response.status === 401) {
          setError("Your session has expired. Please log in again.");
        } else if (response.status === 404 && getDetail(data) === "Dataset not found.") {
          setError("Dataset not found.");
        } else if (response.status >= 500 || response.status === 400) {
          setError("Data quality analysis failed. Please try again.");
        } else {
          setError(getDetail(data) || "Data quality analysis failed.");
        }
        return;
      }

      const normalized = normalizeQualityResult(data);

      setResult(normalized);
      setEmptyMessage("");

      setSuccess(
        "Data quality analysis completed successfully."
      );
    } catch (err) {
      logQualityFailure("analyze dataset", undefined, err);
      setError("Unable to connect to the DataForge API.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDatasetChange = (id: string) => {
    setDatasetId(id);
    setResult(null);
    setError("");
    setSuccess("");
    if (id) void loadLatestQuality(id);
  };

  const score = result?.quality_score ?? 0;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Header */}

      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
          <div>
            <Link
              href="/dashboard"
              className="text-sm text-slate-500 transition hover:text-slate-300"
            >
              ← Back to Dashboard
            </Link>

            <h1 className="mt-2 text-3xl font-bold">
              Data Quality
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Validate dataset completeness, consistency and
              quality.
            </p>
          </div>

          <Link
            href="/datasets"
            className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800"
          >
            Datasets
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl p-5 lg:p-8">
        {/* Messages */}

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
            {error}
            {error === "Your session has expired. Please log in again." && (
              <Link href="/login" className="ml-2 underline underline-offset-2">
                Log in
              </Link>
            )}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-400">
            {success}
          </div>
        )}

        {/* Dataset selector */}

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold">
              Analyze Dataset
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Select a dataset or enter its ID to load and run quality analysis.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
            <div>
              <label
                htmlFor="dataset-selector"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Select Dataset
              </label>
              <select
                id="dataset-selector"
                value={datasets.some((dataset) => dataset.id === datasetId) ? datasetId : ""}
                onChange={(event) => handleDatasetChange(event.target.value)}
                disabled={datasetsLoading}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50"
              >
                <option value="">
                  {datasetsLoading ? "Loading datasets..." : "Choose a dataset"}
                </option>
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.name} — {dataset.id}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1">
              <label
                htmlFor="dataset-id"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Dataset ID
              </label>

              <input
                id="dataset-id"
                value={datasetId}
                onChange={(event) => handleDatasetChange(event.target.value)}
                placeholder="Enter dataset UUID"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 font-mono text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
              />
            </div>

            <button
              onClick={analyzeDataset}
              disabled={analyzing || loadingLatest || !datasetId.trim()}
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {analyzing
                ? "Analyzing..."
                : "Run Quality Analysis"}
            </button>
          </div>
        </section>

        {loadingLatest ? (
          <section className="mt-6 flex min-h-48 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-sm text-slate-500">
            Loading latest quality result...
          </section>
        ) : result ? (
          <>
            {/* Quality overview */}

            <section className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
              <QualityCard
                title="Quality Score"
                value={`${score}%`}
                highlight
              />

              <QualityCard
                title="Total Rows"
                value={result.total_rows ?? 0}
              />

              <QualityCard
                title="Columns"
                value={result.total_columns ?? 0}
              />

              <QualityCard
                title="Missing Values"
                value={result.missing_values ?? 0}
              />

              <QualityCard
                title="Duplicates"
                value={result.duplicate_rows ?? 0}
              />
            </section>

            {/* Score visualization */}

            <section className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="text-lg font-semibold">
                  Quality Score
                </h2>

                <div className="mt-8 flex items-center justify-center">
                  <div className="relative flex h-52 w-52 items-center justify-center rounded-full border-[18px] border-slate-800">
                    <div
                      className="absolute inset-[-18px] rounded-full border-[18px] border-transparent border-t-blue-500 border-r-blue-500"
                      style={{
                        transform: `rotate(${45 + score * 2.7}deg)`,
                      }}
                    />

                    <div className="text-center">
                      <p className="text-5xl font-bold">
                        {score}
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        out of 100
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-8 text-center">
                  <QualityStatus score={score} />
                </div>
              </div>

              {/* Quality checks */}

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="text-lg font-semibold">
                  Quality Checks
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Latest validation results.
                </p>

                <div className="mt-6 space-y-3">
                  <CheckRow
                    label="Dataset loaded"
                    passed={
                      (result.total_rows ?? 0) >= 0
                    }
                  />

                  <CheckRow
                    label="No missing values"
                    passed={
                      (result.missing_values ?? 0) === 0
                  }
                  />

                  <CheckRow
                    label="No duplicate rows"
                    passed={
                      (result.duplicate_rows ?? 0) === 0
                  }
                  />

                  <CheckRow
                    label="Quality score available"
                    passed={
                      result.quality_score !== undefined
                    }
                  />
                </div>
              </div>
            </section>

            {/* Column statistics */}

            {result.column_stats &&
              Object.keys(result.column_stats).length >
                0 && (
                <section className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                  <div className="border-b border-slate-800 p-6">
                    <h2 className="text-lg font-semibold">
                      Column Statistics
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      Statistics returned by the DataForge
                      quality engine.
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-800/50 text-xs uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-6 py-4">
                            Column
                          </th>

                          <th className="px-6 py-4">
                            Statistics
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {Object.entries(
                          result.column_stats
                        ).map(([column, stats]) => (
                          <tr
                            key={column}
                            className="border-t border-slate-800"
                          >
                            <td className="px-6 py-4 font-medium text-slate-300">
                              {column}
                            </td>

                            <td className="px-6 py-4 font-mono text-xs text-slate-500">
                              {formatStats(stats)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
          </>
        ) : error ? null : (
          <section className="mt-6 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-800 text-xl text-slate-500">
              ✓
            </div>

            <h2 className="mt-5 text-lg font-semibold">
              {emptyMessage || "No quality result yet"}
            </h2>

            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
              Run a quality analysis to inspect missing values, duplicate rows,
              dataset dimensions and the overall quality score.
            </p>

            <button
              onClick={analyzeDataset}
              disabled={analyzing || !datasetId.trim()}
              className="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium transition hover:bg-blue-500 disabled:opacity-50"
            >
              {analyzing
                ? "Analyzing..."
                : "Analyze Dataset"}
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function getDetail(data: unknown): string | null {
  if (isRecord(data) && typeof data.detail === "string") {
    return data.detail;
  }

  return null;
}

function logQualityFailure(
  operation: string,
  status: number | undefined,
  detail: unknown
) {
  if (process.env.NODE_ENV === "development") {
    console.error("Data quality request failed", {
      operation,
      status,
      detail,
    });
  }
}

function normalizeDatasets(data: unknown): DatasetOption[] {
  if (!isRecord(data) || !Array.isArray(data.items)) {
    return [];
  }

  return data.items.filter(
    (item): item is DatasetOption =>
      isRecord(item) &&
      typeof item.id === "string" &&
      typeof item.name === "string"
  );
}

function normalizeQualityResult(
  data: unknown
): QualityResult {
  const envelope = isRecord(data) ? data : {};
  const source = isRecord(envelope.result)
    ? envelope.result
    : envelope;

  return {
    quality_score: readNumber(source, "quality_score", "score"),
    total_rows: readNumber(source, "total_rows", "rows"),
    total_columns: readNumber(source, "total_columns", "columns"),
    missing_values: readNumber(source, "missing_values", "missing_count"),
    duplicate_rows: readNumber(source, "duplicate_rows", "duplicates"),
    column_stats: isRecord(source.column_statistics)
      ? source.column_statistics
      : isRecord(source.column_stats)
        ? source.column_stats
        : isRecord(source.columns_stats)
          ? source.columns_stats
          : {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(
  source: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    if (typeof source[key] === "number") {
      return source[key];
    }
  }

  return undefined;
}

function QualityCard({
  title,
  value,
  highlight = false,
}: {
  title: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        highlight
          ? "border-blue-500/20 bg-blue-500/5"
          : "border-slate-800 bg-slate-900"
      }`}
    >
      <p className="text-sm text-slate-500">
        {title}
      </p>

      <p
        className={`mt-3 text-3xl font-bold ${
          highlight
            ? "text-blue-400"
            : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function CheckRow({
  label,
  passed,
}: {
  label: string;
  passed: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-800/50 px-4 py-3">
      <span className="text-sm text-slate-300">
        {label}
      </span>

      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${
          passed
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-red-500/10 text-red-400"
        }`}
      >
        {passed ? "✓" : "×"}
      </span>
    </div>
  );
}

function QualityStatus({
  score,
}: {
  score: number;
}) {
  if (score >= 90) {
    return (
      <span className="rounded-full bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400">
        Excellent data quality
      </span>
    );
  }

  if (score >= 70) {
    return (
      <span className="rounded-full bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-400">
        Good data quality
      </span>
    );
  }

  return (
    <span className="rounded-full bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400">
      Data quality needs attention
    </span>
  );
}

function formatStats(value: unknown) {
  if (
    typeof value === "object" &&
    value !== null
  ) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}