"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "../../lib/api";

type Pipeline = {
  id: string;
  name: string;
  description?: string | null;
  dataset_id: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

type Dataset = {
  id: string;
  name: string;
};

type PipelineRun = {
  id?: string;
  pipeline_id?: string;
  status?: string;
  started_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  created_at?: string;
};

async function loadPipelineRuns(
  pipelineList: Pipeline[]
): Promise<{
  runs: Record<string, PipelineRun[]>;
  errors: Record<string, string>;
}> {
  const runMap: Record<string, PipelineRun[]> = {};
  const runErrors: Record<string, string> = {};

  await Promise.all(
    pipelineList.map(async (pipeline) => {
      try {
        const response = await apiFetch(
          `/pipelines/${pipeline.id}/runs`
        );

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          runErrors[pipeline.id] = getErrorMessage(
            data,
            "Unable to load this pipeline's runs."
          );
          return;
        }

        runMap[pipeline.id] = normalizeRuns(await response.json());
      } catch (error) {
        runErrors[pipeline.id] =
          error instanceof Error
            ? error.message
            : "Unable to load this pipeline's runs.";
      }
    })
  );

  return { runs: runMap, errors: runErrors };
}

export default function PipelinesPage() {
  const router = useRouter();

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [runs, setRuns] = useState<Record<string, PipelineRun[]>>({});
  const [runErrors, setRunErrors] = useState<Record<string, string>>({});

  const [pipelineName, setPipelineName] = useState("");
  const [pipelineDescription, setPipelineDescription] = useState("");
  const [selectedDatasetId, setSelectedDatasetId] = useState("");

  const [loading, setLoading] = useState(true);
  const [datasetsLoading, setDatasetsLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [runningPipeline, setRunningPipeline] =
    useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const pollAttempts = useRef<Record<string, number>>({});

  const loadPipelines = useCallback(async () => {
    const token = localStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await apiFetch("/pipelines");

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        throw new Error(
          "Unable to load pipelines from the DataForge API."
        );
      }

      const pipelineList = normalizePipelines(await response.json());

      setPipelines(pipelineList);

      const history = await loadPipelineRuns(pipelineList);
      setRuns(history.runs);
      setRunErrors(history.errors);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load pipelines."
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  const loadDatasets = useCallback(async () => {
    const token = localStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    try {
      setDatasetsLoading(true);
      const response = await apiFetch("/datasets");

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(getErrorMessage(data, "Unable to load datasets."));
      }

      const data = await response.json();
      setDatasets(normalizeDatasets(data));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load datasets."
      );
    } finally {
      setDatasetsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    startTransition(() => {
      void loadPipelines();
      void loadDatasets();
    });
  }, [loadDatasets, loadPipelines]);

  useEffect(() => {
    const activePipelines = pipelines.filter(
      (pipeline) =>
        (pollAttempts.current[pipeline.id] ?? 0) < 20 &&
        (runs[pipeline.id] ?? []).some((run) => {
          const status = run.status?.toLowerCase();
          return status === "queued" || status === "running";
        })
    );

    if (activePipelines.length === 0) return;

    let cancelled = false;
    let timeoutId: number;

    const pollRuns = async () => {
      const history = await loadPipelineRuns(activePipelines);
      if (cancelled) return;

      for (const pipeline of activePipelines) {
        pollAttempts.current[pipeline.id] =
          (pollAttempts.current[pipeline.id] ?? 0) + 1;
      }

      setRuns((current) => ({ ...current, ...history.runs }));
      setRunErrors((current) => {
        const next = { ...current };
        for (const pipeline of activePipelines) {
          if (history.errors[pipeline.id]) {
            next[pipeline.id] = history.errors[pipeline.id];
          } else {
            delete next[pipeline.id];
          }
        }
        return next;
      });

      timeoutId = window.setTimeout(() => void pollRuns(), 3000);
    };

    timeoutId = window.setTimeout(() => void pollRuns(), 2000);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [pipelines, runs]);

  const createPipeline = async () => {
    const token = localStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    if (!pipelineName.trim() || !selectedDatasetId) {
      setError("Enter a pipeline name and select a dataset.");
      return;
    }

    setCreating(true);
    setError("");
    setSuccess("");

    try {
      const response = await apiFetch("/pipelines", {
        method: "POST",
        body: JSON.stringify({
          name: pipelineName.trim(),
          description: pipelineDescription.trim() || null,
          dataset_id: selectedDatasetId,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "Unable to create pipeline.")
        );
      }

      setPipelineName("");
      setPipelineDescription("");
      setSuccess(`Pipeline "${data.name}" was created.`);
      await loadPipelines();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create pipeline."
      );
    } finally {
      setCreating(false);
    }
  };

  const runPipeline = async (pipeline: Pipeline) => {
    const token = localStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    setRunningPipeline(pipeline.id);
    delete pollAttempts.current[pipeline.id];
    setError("");
    setSuccess("");

    try {
      const response = await apiFetch(
        `/pipelines/${pipeline.id}/run`,
        { method: "POST" }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const detail =
          typeof data?.detail === "string"
            ? data.detail
            : "Pipeline execution could not be started.";

        throw new Error(detail);
      }

      setSuccess(
        `${pipeline.name} was queued. Run status will update from the backend.`
      );

      await loadPipelines();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to run pipeline."
      );
    } finally {
      setRunningPipeline(null);
    }
  };

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
              Pipelines
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Manage and execute your DataForge data pipelines.
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/data-quality"
              className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800"
            >
              Data Quality
            </Link>

            <button
              onClick={loadPipelines}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium transition hover:bg-blue-500 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl p-5 lg:p-8">
        {/* Messages */}

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-400">
            {success}
          </div>
        )}

        {/* Create pipeline */}

        <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold">Create Pipeline</h2>
          <p className="mt-1 text-sm text-slate-500">
            Associate a pipeline with an uploaded dataset in your workspace.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-slate-300">
              Pipeline name
              <input
                value={pipelineName}
                onChange={(event) => setPipelineName(event.target.value)}
                minLength={2}
                maxLength={150}
                placeholder="Customer quality checks"
                className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Dataset
              <select
                value={selectedDatasetId}
                onChange={(event) => setSelectedDatasetId(event.target.value)}
                disabled={datasetsLoading || datasets.length === 0}
                className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50"
              >
                <option value="">
                  {datasetsLoading ? "Loading datasets..." : "Select a dataset"}
                </option>
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.name} ({dataset.id})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate-300 md:col-span-2">
              Description
              <textarea
                value={pipelineDescription}
                onChange={(event) => setPipelineDescription(event.target.value)}
                rows={2}
                placeholder="Optional description"
                className="mt-2 w-full resize-y rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
              />
            </label>
          </div>
          {datasets.length === 0 && !datasetsLoading && (
            <p className="mt-3 text-sm text-amber-400">
              Upload a dataset before creating a pipeline.
            </p>
          )}
          <button
            type="button"
            onClick={createPipeline}
            disabled={creating || datasetsLoading || datasets.length === 0}
            className="mt-4 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Pipeline"}
          </button>
        </section>

        {/* Summary */}

        <section className="mb-6 grid gap-5 sm:grid-cols-3">
          <SummaryCard
            title="Total Pipelines"
            value={pipelines.length}
          />

          <SummaryCard
            title="Active Pipelines"
            value={
              pipelines.filter(
                (pipeline) =>
                  pipeline.is_active !== false
              ).length
            }
          />

          <SummaryCard
            title="Recent Runs"
            value={Object.values(runs).reduce(
              (total, pipelineRuns) =>
                total + pipelineRuns.length,
              0
            )}
          />
        </section>

        {/* Pipeline list */}

        {loading ? (
          <div className="flex min-h-80 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900">
            <p className="text-sm text-slate-500">
              Loading pipelines...
            </p>
          </div>
        ) : pipelines.length === 0 ? (
          <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-800 text-xl text-slate-500">
              ⚙
            </div>

            <h2 className="mt-5 text-lg font-semibold">
              No pipelines found
            </h2>

            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
              Create a pipeline through the DataForge backend
              before attempting to execute it.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {pipelines.map((pipeline) => {
              const pipelineRuns =
                runs[pipeline.id] ?? [];

              const latestRun =
                pipelineRuns.length > 0
                  ? pipelineRuns[0]
                  : null;

              return (
                <section
                  key={pipeline.id}
                  className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900"
                >
                  {/* Pipeline header */}

                  <div className="flex flex-col gap-5 border-b border-slate-800 p-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-xl font-semibold">
                          {pipeline.name}
                        </h2>

                        <StatusBadge
                          active={
                            pipeline.is_active !== false
                          }
                        />
                      </div>

                      {pipeline.description && (
                        <p className="mt-2 text-sm text-slate-500">
                          {pipeline.description}
                        </p>
                      )}

                      <div className="mt-4 space-y-3">
                        <p className="text-xs text-slate-600">
                          Pipeline ID: <span className="font-mono text-slate-500">{pipeline.id}</span>
                        </p>
                        <div>
                          <p className="text-xs font-semibold uppercase text-slate-400">
                            Dataset ID
                          </p>
                          <p className="mt-1 break-all font-mono text-sm text-slate-100">
                            {pipeline.dataset_id}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {datasets.find((dataset) => dataset.id === pipeline.dataset_id)?.name ?? "Dataset"}
                          </p>
                        </div>
                        {latestRun?.status === "completed" && (
                          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                            <p className="text-xs font-semibold uppercase text-emerald-300">
                              Cleaned dataset ID
                            </p>
                            <p className="mt-1 break-all font-mono text-sm text-slate-100">
                              {pipeline.dataset_id}
                            </p>
                            <p className="mt-3 text-xs font-semibold uppercase text-emerald-300">
                              Pipeline ID to paste in Analytics
                            </p>
                            <p className="mt-1 break-all font-mono text-sm text-slate-100">
                              {pipeline.id}
                            </p>
                            <Link
                              href={`/analytics?pipeline_id=${encodeURIComponent(pipeline.id)}`}
                              className="mt-3 inline-flex text-sm font-medium text-emerald-300 hover:text-emerald-200"
                            >
                              Open cleaned pipeline analytics
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        runPipeline(pipeline)
                      }
                      disabled={
                        runningPipeline === pipeline.id ||
                        pipeline.is_active === false
                      }
                      className="shrink-0 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {runningPipeline === pipeline.id
                        ? "Starting..."
                        : "Run Pipeline"}
                    </button>
                  </div>

                  {/* Latest execution */}

                  <div className="p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">
                          Execution History
                        </h3>

                        <p className="mt-1 text-xs text-slate-600">
                          Pipeline runs returned by the backend.
                        </p>
                      </div>

                      {latestRun && (
                        <RunStatus
                          status={latestRun.status}
                        />
                      )}
                    </div>

                    {runErrors[pipeline.id] && (
                      <p role="alert" className="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
                        {runErrors[pipeline.id]}
                      </p>
                    )}

                    {pipelineRuns.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-8 text-center">
                        <p className="text-sm text-slate-500">
                          No execution history available.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="text-xs uppercase tracking-wider text-slate-600">
                            <tr>
                              <th className="pb-3 pr-6">
                                Run ID
                              </th>

                              <th className="pb-3 pr-6">
                                Status
                              </th>

                              <th className="pb-3 pr-6">
                                Started
                              </th>

                              <th className="pb-3">
                                Completed
                              </th>
                              <th className="pb-3 pl-6">
                                Error
                              </th>
                            </tr>
                          </thead>

                          <tbody>
                            {pipelineRuns
                              .slice(0, 10)
                              .map((run, index) => (
                                <tr
                                  key={
                                    run.id ??
                                    `${pipeline.id}-${index}`
                                  }
                                  className="border-t border-slate-800"
                                >
                                  <td className="py-4 pr-6 font-mono text-xs text-slate-500">
                                    {run.id ?? "—"}
                                  </td>

                                  <td className="py-4 pr-6">
                                    <RunStatus
                                      status={run.status}
                                    />
                                  </td>

                                  <td className="py-4 pr-6 text-slate-500">
                                    {formatDate(
                                      run.started_at ??
                                        run.created_at
                                    )}
                                  </td>

                                  <td className="py-4 text-slate-500">
                                    {formatDate(
                                      run.completed_at
                                    )}
                                  </td>
                                  <td className="max-w-xs py-4 pl-6 text-xs text-red-400">
                                    {run.error_message ?? "—"}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-sm text-slate-500">
        {title}
      </p>

      <p className="mt-3 text-3xl font-bold text-white">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  active,
}: {
  active: boolean;
}) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        active
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-slate-800 text-slate-500"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function RunStatus({
  status,
}: {
  status?: string;
}) {
  const normalized =
    status?.toLowerCase() ?? "unknown";

  let className =
    "bg-slate-800 text-slate-400";

  if (
    normalized === "success" ||
    normalized === "completed" ||
    normalized === "succeeded"
  ) {
    className =
      "bg-emerald-500/10 text-emerald-400";
  } else if (
    normalized === "failed" ||
    normalized === "error"
  ) {
    className =
      "bg-red-500/10 text-red-400";
  } else if (
    normalized === "running" ||
    normalized === "processing"
  ) {
    className =
      "bg-blue-500/10 text-blue-400";
  } else if (
    normalized === "queued" ||
    normalized === "pending"
  ) {
    className =
      "bg-amber-500/10 text-amber-400";
  }

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${className}`}
    >
      {status ?? "Unknown"}
    </span>
  );
}

/* =========================================================
   NORMALIZERS
========================================================= */

function normalizePipelines(data: unknown): Pipeline[] {
  return getArray(data, "pipelines").filter(isPipeline);
}

function normalizeDatasets(data: unknown): Dataset[] {
  return getArray(data, "items").filter(isDataset);
}

function normalizeRuns(data: unknown): PipelineRun[] {
  return getArray(data, "runs").filter(isPipelineRun);
}

function getErrorMessage(data: unknown, fallback: string): string {
  if (isRecord(data) && typeof data.detail === "string") {
    return data.detail;
  }

  return fallback;
}

function getArray(data: unknown, key: string): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (!isRecord(data)) {
    return [];
  }

  if (Array.isArray(data.data)) {
    return data.data;
  }

  return Array.isArray(data[key]) ? data[key] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(
  value: Record<string, unknown>,
  key: string,
  nullable = false
): boolean {
  return value[key] === undefined ||
    typeof value[key] === "string" ||
    (nullable && value[key] === null);
}

function isPipeline(value: unknown): value is Pipeline {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.dataset_id === "string" &&
    isOptionalString(value, "description", true) &&
    (value.is_active === undefined || typeof value.is_active === "boolean") &&
    isOptionalString(value, "created_at") &&
    isOptionalString(value, "updated_at")
  );
}

function isDataset(value: unknown): value is Dataset {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

function isPipelineRun(value: unknown): value is PipelineRun {
  return (
    isRecord(value) &&
    isOptionalString(value, "id") &&
    isOptionalString(value, "pipeline_id") &&
    isOptionalString(value, "status") &&
    isOptionalString(value, "started_at", true) &&
    isOptionalString(value, "completed_at", true) &&
    isOptionalString(value, "error_message", true) &&
    isOptionalString(value, "created_at")
  );
}

/* =========================================================
   DATE FORMATTER
========================================================= */

function formatDate(
  value?: string | null
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}