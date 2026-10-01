"use client";

import {
  ChangeEvent,
  startTransition,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "../../lib/api";

type Dataset = {
  id: string;
  name?: string;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
  status?: string;
  version?: number;
  row_count?: number;
  column_count?: number;
};

type UploadResult = {
  dataset_name: string;
  dataset_id: string;
  version: number;
  row_count: number;
  column_count: number;
};

export default function DatasetsPage() {
  const router = useRouter();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploadResult, setUploadResult] =
    useState<UploadResult | null>(null);
  const [copiedDatasetId, setCopiedDatasetId] =
    useState<string | null>(null);

  const loadDatasets = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await apiFetch("/datasets");

      if (!response.ok) {
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        throw new Error(
          "Unable to load datasets from the DataForge API."
        );
      }

      const data = await response.json();

      /*
       * Support common response structures without
       * inventing dataset records.
       */

      if (Array.isArray(data)) {
        setDatasets(data);
      } else if (Array.isArray(data?.items)) {
        setDatasets(data.items);
      } else if (Array.isArray(data?.data)) {
        setDatasets(data.data);
      } else if (Array.isArray(data?.datasets)) {
        setDatasets(data.datasets);
      } else {
        setDatasets([]);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load datasets."
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    startTransition(() => {
      void loadDatasets();
    });
  }, [loadDatasets]);

  const handleFileChange = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] ?? null;

    setSelectedFile(file);
    setSuccess("");
    setError("");
    setUploadResult(null);
    setCopiedDatasetId(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Please select a CSV file first.");
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");
    setUploadResult(null);

    try {
      const createResponse = await apiFetch("/datasets", {
        method: "POST",
        body: JSON.stringify({ name: selectedFile.name }),
      });
      const createdDataset = await createResponse
        .json()
        .catch(() => null);

      if (!createResponse.ok || typeof createdDataset?.id !== "string") {
        const message =
          typeof createdDataset?.detail === "string"
            ? createdDataset.detail
            : "Unable to create a dataset for this upload.";
        throw new Error(message);
      }

      const formData = new FormData();

      formData.append("file", selectedFile);

      const response = await apiFetch(
        `/datasets/${createdDataset.id}/upload`,
        { method: "POST", body: formData }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        let message = "Dataset upload failed.";

        if (typeof data?.detail === "string") {
          message = data.detail;
        }

        throw new Error(message);
      }

      const result: UploadResult = {
        dataset_name: createdDataset.name,
        dataset_id: data.dataset_id,
        version: data.version,
        row_count: data.row_count,
        column_count: data.column_count,
      };
      setUploadResult(result);
      setSuccess("Dataset uploaded successfully.");

      setSelectedFile(null);

      const input =
        document.getElementById(
          "dataset-file"
        ) as HTMLInputElement | null;

      if (input) {
        input.value = "";
      }

      await loadDatasets();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to upload dataset."
      );
    } finally {
      setUploading(false);
    }
  };

  const copyDatasetId = async (datasetId: string) => {
    try {
      await navigator.clipboard.writeText(datasetId);
      setCopiedDatasetId(datasetId);
      window.setTimeout(() => setCopiedDatasetId(null), 1500);
    } catch {
      setError("Unable to copy the Dataset ID.");
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
              className="text-sm text-slate-500 hover:text-slate-300"
            >
              ← Back to Dashboard
            </Link>

            <h1 className="mt-2 text-3xl font-bold">
              Datasets
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Upload and manage datasets used by DataForge.
            </p>
          </div>

          <button
            onClick={loadDatasets}
            className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800"
          >
            Refresh
          </button>
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

        {uploadResult && (
          <section
            aria-live="polite"
            className="mb-6 rounded-xl border border-emerald-500/20 bg-slate-900 p-5"
          >
            <h2 className="text-base font-semibold text-white">
              {uploadResult.dataset_name}
            </h2>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-slate-500">Dataset ID</dt>
                <dd className="mt-1 break-all font-mono text-slate-200">
                  {uploadResult.dataset_id}
                </dd>
                <button
                  type="button"
                  onClick={() => copyDatasetId(uploadResult.dataset_id)}
                  className="mt-2 text-xs font-medium text-blue-400 hover:text-blue-300"
                >
                  {copiedDatasetId === uploadResult.dataset_id
                    ? "Copied"
                    : "Copy Dataset ID"}
                </button>
                <Link
                  href={`/data-quality?dataset_id=${encodeURIComponent(uploadResult.dataset_id)}`}
                  className="ml-4 text-xs font-medium text-emerald-400 hover:text-emerald-300"
                >
                  Analyze Quality
                </Link>
                <Link
                  href={`/analytics?dataset_id=${encodeURIComponent(uploadResult.dataset_id)}`}
                  className="ml-4 text-xs font-medium text-blue-400 hover:text-blue-300"
                >
                  Analyze Dataset
                </Link>
              </div>
              <div>
                <dt className="text-slate-500">Version</dt>
                <dd className="mt-1 text-slate-200">{uploadResult.version}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Rows</dt>
                <dd className="mt-1 text-slate-200">{uploadResult.row_count}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Columns</dt>
                <dd className="mt-1 text-slate-200">{uploadResult.column_count}</dd>
              </div>
            </dl>
          </section>
        )}

        {/* Upload */}

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold">
              Upload Dataset
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Upload a CSV dataset to begin processing.
            </p>
          </div>

          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/50 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
              ↑
            </div>

            <h3 className="mt-4 text-sm font-medium">
              Select a CSV file
            </h3>

            <p className="mt-2 text-xs text-slate-600">
              Choose a dataset from your computer.
            </p>

            <input
              id="dataset-file"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="mx-auto mt-6 block max-w-full text-sm text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-300 hover:file:bg-slate-700"
            />

            {selectedFile && (
              <div className="mx-auto mt-5 max-w-md rounded-lg bg-slate-800/70 p-3 text-left">
                <p className="text-sm font-medium text-slate-200">
                  {selectedFile.name}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {uploading
                ? "Uploading..."
                : "Upload Dataset"}
            </button>
          </div>
        </section>

        {/* Dataset list */}

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-800 p-6">
            <div>
              <h2 className="text-lg font-semibold">
                Dataset Catalog
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Datasets available in your DataForge workspace.
              </p>
            </div>

            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">
              {datasets.length} dataset
              {datasets.length === 1 ? "" : "s"}
            </span>
          </div>

          {loading ? (
            <div className="flex min-h-48 items-center justify-center">
              <div className="text-sm text-slate-500">
                Loading datasets...
              </div>
            </div>
          ) : datasets.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-500">
                ▦
              </div>

              <p className="mt-4 text-sm font-medium text-slate-300">
                No datasets found
              </p>

              <p className="mt-1 text-xs text-slate-600">
                Upload a CSV file to create your first dataset.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800/50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-6 py-4">
                      Dataset
                    </th>

                    <th className="px-6 py-4">
                      Dataset ID
                    </th>

                    <th className="px-6 py-4">
                      Status
                    </th>

                    <th className="px-6 py-4">
                      Version
                    </th>

                    <th className="px-6 py-4">
                      Rows
                    </th>

                    <th className="px-6 py-4">
                      Columns
                    </th>

                    <th className="px-6 py-4">
                      Created
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {datasets.map((dataset) => (
                    <tr
                      key={dataset.id}
                      className="border-t border-slate-800 transition hover:bg-slate-800/30"
                    >
                      <td className="px-6 py-5">
                        <div>
                          <p className="font-medium text-slate-200">
                            {dataset.name ||
                              "Unnamed Dataset"}
                          </p>

                        </div>
                      </td>

                      <td className="min-w-64 px-6 py-5">
                        <p className="sr-only">Dataset ID</p>
                        <p className="mt-1 break-all font-mono text-sm text-slate-100">
                          {dataset.id}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-4 text-xs font-medium">
                          <button
                            type="button"
                            onClick={() => copyDatasetId(dataset.id)}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            {copiedDatasetId === dataset.id ? "Copied" : "Copy ID"}
                          </button>
                          <Link
                            href={`/data-quality?dataset_id=${encodeURIComponent(dataset.id)}`}
                            className="text-emerald-400 hover:text-emerald-300"
                          >
                            Analyze Quality
                          </Link>
                          <Link
                            href={`/analytics?dataset_id=${encodeURIComponent(dataset.id)}`}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            Analyze Dataset
                          </Link>
                        </div>
                      </td>

                      <td className="px-6 py-5">
                        <StatusBadge
                          status={
                            dataset.status ||
                            "Available"
                          }
                        />
                      </td>

                      <td className="px-6 py-5 text-slate-400">
                        {dataset.version ?? "—"}
                      </td>

                      <td className="px-6 py-5 text-slate-400">
                        {dataset.row_count ??
                          "—"}
                      </td>

                      <td className="px-6 py-5 text-slate-400">
                        {dataset.column_count ??
                          "—"}
                      </td>

                      <td className="px-6 py-5 text-slate-500">
                        {dataset.created_at
                          ? formatDate(
                              dataset.created_at
                            )
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const normalized = status.toLowerCase();

  const isGood =
    normalized.includes("active") ||
    normalized.includes("available") ||
    normalized.includes("ready") ||
    normalized.includes("success");

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        isGood
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-slate-800 text-slate-400"
      }`}
    >
      {status}
    </span>
  );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}