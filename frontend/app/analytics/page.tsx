"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch, getToken } from "../../lib/api";

const pageSize = 100;
const chartColors = ["#39c6a5", "#f0b45b", "#70a7fa", "#ed7586", "#a6d96a", "#d58bd8"];

export default function AnalyticsPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="text-sm text-slate-400 transition hover:text-white"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="mt-2 text-slate-400">
            Explore processed data from a dataset or completed pipeline.
          </p>
        </div>

        <DatasetAnalysisSelector />
      </div>
    </main>
  );
}

type DatasetOption = {
  id: string;
  name: string;
};

type AnalyticsIdType = "dataset" | "pipeline";

type ColumnStatistics = {
  data_type?: string;
  missing_count?: number;
  missing_percentage?: number;
  unique_count?: number;
  min?: number | null;
  max?: number | null;
  mean?: number | null;
};

type DatasetAnalysis = {
  dataset_id: string;
  dataset_name: string;
  analytics: {
    total_rows: number;
    total_columns: number;
    missing_values: number;
    duplicate_rows: number;
    quality_score: number;
    column_statistics: Record<string, ColumnStatistics>;
    date_columns: string[];
    numeric_summary: {
      column: string;
      mean: number;
      min: number;
      max: number;
      currency: boolean;
    }[];
    numeric_relationships: {
      x_column: string;
      y_column: string;
      x_currency: boolean;
      y_currency: boolean;
      correlation: number | null;
      points: { x: number; y: number }[];
    }[];
    missing_by_column: { column: string; missing: number }[];
    categorical_distributions: {
      column: string;
      items: { label: string; count: number }[];
    }[];
    offset: number;
    page_size: number;
    preview: Record<string, string | number | boolean | null>[];
  };
};

function DatasetAnalysisSelector() {
  const [datasets, setDatasets] = useState<DatasetOption[]>([]);
  const [datasetSearch, setDatasetSearch] = useState("");
  const [entryId, setEntryId] = useState("");
  const [idType, setIdType] = useState<AnalyticsIdType>("dataset");
  const [analysis, setAnalysis] = useState<DatasetAnalysis | null>(null);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  const analyzeIdentifier = async (
    type: AnalyticsIdType,
    id: string,
    offset = 0
  ) => {
    const normalizedId = id.trim();
    if (!normalizedId) {
      setError("Select a dataset or enter its ID.");
      return;
    }

    setAnalyzing(true);
    setError("");

    try {
      const query = new URLSearchParams();
      query.set("offset", String(offset));
      query.set("limit", String(pageSize));
      const queryString = query.size ? `?${query.toString()}` : "";
      const response = await apiFetch(
        `/analytics/${type === "pipeline" ? "pipelines" : "datasets"}/${encodeURIComponent(normalizedId)}${queryString}`
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : `Dataset analytics request failed (${response.status}).`
        );
      }
      setAnalysis(data as DatasetAnalysis);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to analyze this dataset."
      );
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    const queryParameters = new URLSearchParams(window.location.search);
    const requestedPipelineId = queryParameters.get("pipeline_id")?.trim();
    const requestedDatasetId = queryParameters.get("dataset_id")?.trim();

    if (requestedPipelineId || requestedDatasetId) {
      const type = requestedPipelineId ? "pipeline" : "dataset";
      const requestedId = requestedPipelineId ?? requestedDatasetId ?? "";
      void Promise.resolve().then(() => {
        setIdType(type);
        setEntryId(requestedId);
        return analyzeIdentifier(type, requestedId);
      });
    }

    const loadDatasets = async () => {
      try {
        const response = await apiFetch("/datasets");
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            typeof data?.detail === "string"
              ? data.detail
              : "Unable to load datasets."
          );
        }

        const items = Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data)
            ? data
            : [];
        setDatasets(
          items.filter(
            (item: unknown): item is DatasetOption =>
              typeof item === "object" &&
              item !== null &&
              "id" in item &&
              typeof item.id === "string" &&
              "name" in item &&
              typeof item.name === "string"
          )
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to load datasets."
        );
      } finally {
        setLoadingDatasets(false);
      }
    };

    void loadDatasets();
  }, []);

  const selectedDatasetId = entryId;
  const filteredDatasets = datasets.filter((dataset) =>
    `${dataset.name} ${dataset.id}`
      .toLowerCase()
      .includes(datasetSearch.trim().toLowerCase())
  );
  const currentOffset = analysis?.analytics.offset ?? 0;
  const showingFrom = analysis?.analytics.total_rows ? currentOffset + 1 : 0;
  const showingTo = Math.min(
    currentOffset + (analysis?.analytics.preview.length ?? 0),
    analysis?.analytics.total_rows ?? 0
  );

  return (
    <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="text-lg font-semibold">Analyze a dataset or pipeline</h2>
      <form
        className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          void analyzeIdentifier(idType, selectedDatasetId);
        }}
      >
        <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-1" role="group" aria-label="ID type">
          <button
            type="button"
            aria-pressed={idType === "dataset"}
            onClick={() => {
              setIdType("dataset");
              setEntryId("");
              setAnalysis(null);
            }}
            className={`flex-1 rounded-md px-3 py-2 text-sm ${idType === "dataset" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
          >
            Dataset
          </button>
          <button
            type="button"
            aria-pressed={idType === "pipeline"}
            onClick={() => {
              setIdType("pipeline");
              setEntryId("");
              setAnalysis(null);
            }}
            className={`flex-1 rounded-md px-3 py-2 text-sm ${idType === "pipeline" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
          >
            Pipeline
          </button>
        </div>
        <label className="sr-only" htmlFor="analytics-dataset-id">
          {idType === "pipeline" ? "Pipeline or run ID" : "Dataset ID"}
        </label>
        <input
          id="analytics-dataset-id"
          value={selectedDatasetId}
          onChange={(event) => {
            setEntryId(event.target.value);
            setAnalysis(null);
            setError("");
          }}
          placeholder={idType === "pipeline" ? "Paste a pipeline or completed run ID" : "Paste a dataset ID"}
          className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-sm text-white placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={analyzing || !selectedDatasetId.trim()}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {analyzing ? "Updating..." : analysis ? "Update analytics" : "Analyze"}
        </button>
      </form>

      {idType === "dataset" && (
        <section className="mt-5" aria-label="Available datasets">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Datasets ({datasets.length})
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Select a dataset to load its analytics.
              </p>
            </div>
            <label className="w-full sm:max-w-sm">
              <span className="sr-only">Search datasets</span>
              <input
                type="search"
                value={datasetSearch}
                onChange={(event) => setDatasetSearch(event.target.value)}
                placeholder="Search by name or ID"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500"
              />
            </label>
          </div>
          <div
            role="listbox"
            aria-label="Datasets"
            className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950"
          >
            {loadingDatasets ? (
              <p className="p-4 text-sm text-slate-400">Loading datasets...</p>
            ) : filteredDatasets.length ? (
              filteredDatasets.map((dataset) => {
                const selected = idType === "dataset" && selectedDatasetId === dataset.id;
                return (
                  <button
                    key={dataset.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setIdType("dataset");
                      setEntryId(dataset.id);
                      setError("");
                      void analyzeIdentifier("dataset", dataset.id);
                    }}
                    className={`flex w-full flex-col gap-1 border-b border-slate-800 px-4 py-3 text-left last:border-b-0 hover:bg-slate-800/70 sm:flex-row sm:items-center sm:justify-between ${selected ? "bg-slate-800/70" : ""}`}
                  >
                    <span className="font-medium text-slate-200">{dataset.name}</span>
                    <span className="break-all font-mono text-xs text-slate-500">
                      {dataset.id}
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="p-4 text-sm text-slate-400">
                {datasets.length ? "No datasets match that search." : "No datasets are available for this role."}
              </p>
            )}
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {analysis && (
        <div className="mt-6 border-t border-slate-800 pt-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">{analysis.dataset_name}</h3>
            <p className="break-all font-mono text-xs text-slate-500">
              {analysis.dataset_id}
            </p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <AnalysisMetric label="Rows" value={analysis.analytics.total_rows} />
            <AnalysisMetric label="Columns" value={analysis.analytics.total_columns} />
            <AnalysisMetric label="Missing values" value={analysis.analytics.missing_values} />
            <AnalysisMetric label="Duplicate rows" value={analysis.analytics.duplicate_rows} />
            <AnalysisMetric label="Quality score" value={`${analysis.analytics.quality_score}%`} />
          </dl>

          <div className="mt-8 grid gap-5 xl:grid-cols-2">
            <ChartPanel title="Numeric averages">
              {analysis.analytics.numeric_summary.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={analysis.analytics.numeric_summary}
                    layout="vertical"
                    margin={{ left: 8, right: 20 }}
                  >
                    <CartesianGrid stroke="#293444" strokeDasharray="3 3" />
                    <XAxis type="number" stroke="#94a3b8" />
                    <YAxis dataKey="column" type="category" width={110} stroke="#cbd5e1" />
                    <Tooltip
                      formatter={(value, _name, item) => {
                        const number = Number(value);
                        const label = item.payload?.currency
                          ? `₹${number.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
                          : number;
                        return [label, String(item.payload?.column ?? "Mean")];
                      }}
                      contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
                    />
                    <Legend />
                    <Bar dataKey="mean" name="Mean" fill="#39c6a5" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty>No numeric columns are available to chart.</ChartEmpty>
              )}
            </ChartPanel>

            {analysis.analytics.numeric_relationships.map((relationship) => (
              <ChartPanel
                key={`${relationship.x_column}-${relationship.y_column}`}
                title={`${relationship.x_column} vs ${relationship.y_column}`}
                subtitle={relationship.correlation === null
                  ? "Correlation unavailable"
                  : `Correlation ${relationship.correlation}`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 12, right: 18, bottom: 12, left: 8 }}>
                    <CartesianGrid stroke="#293444" strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name={relationship.x_column}
                      stroke="#94a3b8"
                      tickFormatter={(value) => relationship.x_currency ? `₹${value}` : value}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name={relationship.y_column}
                      stroke="#94a3b8"
                      tickFormatter={(value) => relationship.y_currency ? `₹${value}` : value}
                    />
                    <Tooltip
                      formatter={(value, name) => {
                        const columnName = String(name);
                        const currency = columnName === relationship.x_column
                          ? relationship.x_currency
                          : relationship.y_currency;
                        const formatted = currency
                          ? `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
                          : value;
                        return [formatted, columnName];
                      }}
                      contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
                    />
                    <Scatter
                      name={`${relationship.x_column} vs ${relationship.y_column}`}
                      data={relationship.points}
                      fill="#70a7fa"
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </ChartPanel>
            ))}

            <ChartPanel title="Missing values by column">
              {analysis.analytics.missing_by_column.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={analysis.analytics.missing_by_column}
                    layout="vertical"
                    margin={{ left: 8, right: 20 }}
                  >
                    <CartesianGrid stroke="#293444" strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} stroke="#94a3b8" />
                    <YAxis dataKey="column" type="category" width={110} stroke="#cbd5e1" />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
                    <Bar dataKey="missing" name="Missing rows" fill="#ed7586" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty>All displayed columns are complete.</ChartEmpty>
              )}
            </ChartPanel>

            {analysis.analytics.categorical_distributions.map((distribution) => (
              <ChartPanel key={distribution.column} title={`Category breakdown: ${distribution.column}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distribution.items}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius="72%"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {distribution.items.map((item, itemIndex) => (
                        <Cell key={item.label} fill={chartColors[itemIndex % chartColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartPanel>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-200">
              Dataset records ({analysis.analytics.total_rows})
            </h4>
            <p className="text-xs text-slate-400">
              Showing {showingFrom}-{showingTo} of {analysis.analytics.total_rows}
            </p>
          </div>

          <div className="mt-3 max-h-[560px] overflow-auto rounded-lg border border-slate-800">
            {analysis.analytics.preview.length ? (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-800 text-xs text-slate-300">
                <tr>
                  {Object.keys(analysis.analytics.preview[0]).map((column) => (
                    <th key={column} className="py-3 pr-4">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analysis.analytics.preview.map((row, index) => (
                  <tr key={index} className="border-t border-slate-800">
                    {Object.entries(row).map(([column, value]) => (
                      <td key={column} className="py-3 pr-4 text-slate-300">
                        {formatCell(column, value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            ) : (
              <p className="py-4 text-sm text-slate-400">
                No rows match the current filters.
              </p>
            )}
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void analyzeIdentifier(idType, selectedDatasetId, Math.max(0, currentOffset - pageSize))}
              disabled={analyzing || currentOffset === 0}
              className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => void analyzeIdentifier(idType, selectedDatasetId, currentOffset + pageSize)}
              disabled={analyzing || showingTo >= analysis.analytics.total_rows}
              className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
            >
              Next
            </button>
          </div>

          <h4 className="mt-8 text-sm font-semibold text-slate-200">
            Column statistics
          </h4>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-slate-400">
                <tr>
                  <th className="py-3 pr-4">Column</th>
                  <th className="py-3 pr-4">Type</th>
                  <th className="py-3 pr-4">Unique</th>
                  <th className="py-3 pr-4">Missing</th>
                  <th className="py-3 pr-4">Min</th>
                  <th className="py-3 pr-4">Max</th>
                  <th className="py-3">Mean</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(analysis.analytics.column_statistics).map(([column, stats]) => (
                  <tr key={column} className="border-t border-slate-800">
                    <td className="py-3 pr-4 font-medium text-slate-200">{column}</td>
                    <td className="py-3 pr-4 text-slate-400">{stats.data_type ?? "—"}</td>
                    <td className="py-3 pr-4 text-slate-300">{stats.unique_count ?? "—"}</td>
                    <td className="py-3 pr-4 text-slate-300">{stats.missing_count ?? 0} ({stats.missing_percentage ?? 0}%)</td>
                    <td className="py-3 pr-4 text-slate-300">{formatCell(column, stats.min ?? null)}</td>
                    <td className="py-3 pr-4 text-slate-300">{formatCell(column, stats.max ?? null)}</td>
                    <td className="py-3 text-slate-300">{formatCell(column, stats.mean ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function formatCell(column: string, value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number" && /amount|price|cost|charge|revenue|salary/i.test(column)) {
    return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  }
  return String(value);
}

function ChartPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-200">{title}</h4>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      <div className="h-[280px]">{children}</div>
    </section>
  );
}

function ChartEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}


function AnalysisMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-l-2 border-blue-500 pl-3">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-white">{value}</dd>
    </div>
  );
}