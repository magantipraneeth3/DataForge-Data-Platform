"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, getToken } from "../../lib/api";

type User = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  organization_id: string;
  is_active: boolean;
  role: string | null;
};

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
};

type Activity = {
  id: string;
  type: string;
  summary: string;
  status: string;
  dataset_id: string | null;
  pipeline_id: string | null;
  error_message: string | null;
  occurred_at: string;
  actor_name: string;
  actor_email: string | null;
};

type AdminOverview = {
  staff: {
    total: number;
    active: number;
    admins: number;
    data_engineers: number;
    analysts: number;
  };
  users: AdminUser[];
  pipeline_run_statuses: Record<string, number>;
  analytics_records: number | null;
  activity: Activity[];
};

export default function AdminPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadUser = async () => {
      if (!getToken()) {
        router.replace("/login");
        return;
      }

      try {
        const response = await apiFetch("/me");

        if (!response.ok) {
          if (response.status === 401) {
            router.replace("/login");
            return;
          }
          throw new Error("Unable to verify Admin access.");
        }

        const data: User = await response.json();
        if (data.role !== "admin") {
          router.replace("/dashboard");
          return;
        }

        setUser(data);

        const overviewResponse = await apiFetch("/admin/overview");
        if (overviewResponse.status === 401) {
          router.replace("/login");
          return;
        }

        const overviewData = await overviewResponse.json().catch(() => null);
        if (!overviewResponse.ok) {
          throw new Error(
            typeof overviewData?.detail === "string"
              ? overviewData.detail
              : "Unable to load Admin activity."
          );
        }
        setOverview(overviewData);
      } catch {
        setError("Unable to connect to DataForge API.");
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, [router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-slate-400">Loading admin center...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6">
          <p className="text-red-400">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Admin Center</h1>
            <p className="mt-2 text-slate-400">
              Manage platform access and review system information.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
          >
            ← Back to Dashboard
          </Link>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Active Data Engineers" value={overview?.staff.data_engineers ?? 0} />
          <Metric label="Active Analysts" value={overview?.staff.analysts ?? 0} />
          <Metric label="Active Portal Users" value={overview?.staff.active ?? 0} />
          <Metric label="Analytics Records" value={overview?.analytics_records ?? "Unavailable"} />
        </section>

        <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Pipeline Runs</h2>
              <p className="mt-1 text-sm text-slate-500">Statuses reported by stored pipeline runs.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(overview?.pipeline_run_statuses ?? {}).map(([status, count]) => (
                <span key={status} className="rounded-md bg-slate-800 px-3 py-2 text-sm text-slate-300">
                  {status}: {count}
                </span>
              ))}
              {overview && Object.keys(overview.pipeline_run_statuses).length === 0 && (
                <span className="text-sm text-slate-500">No pipeline runs recorded.</span>
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 p-5">
            <h2 className="font-semibold">Portal Users</h2>
            <p className="mt-1 text-sm text-slate-500">
              {overview?.staff.total ?? 0} registered accounts · {overview?.staff.admins ?? 0} Admin assignment(s)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800/60 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Login ID</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Joined</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.users ?? []).map((account) => (
                  <tr key={account.id} className="border-t border-slate-800">
                    <td className="px-5 py-3 text-slate-200">{account.name}</td>
                    <td className="px-5 py-3 text-slate-400">{account.email}</td>
                    <td className="px-5 py-3 capitalize text-slate-300">{account.role.replaceAll("_", " ")}</td>
                    <td className="px-5 py-3 text-slate-300">{account.is_active ? "Active" : "Inactive"}</td>
                    <td className="px-5 py-3 text-slate-500">{formatDate(account.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 p-5">
            <h2 className="font-semibold">Recent Process Activity</h2>
            <p className="mt-1 text-sm text-slate-500">Dataset uploads, pipeline runs, and quality analyses recorded by DataForge.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800/60 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-5 py-3">When</th>
                  <th className="px-5 py-3">Process</th>
                  <th className="px-5 py-3">Actor</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Record</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.activity ?? []).map((item) => (
                  <tr key={item.id} className="border-t border-slate-800 align-top">
                    <td className="whitespace-nowrap px-5 py-3 text-slate-500">{formatDate(item.occurred_at)}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-200">{item.type}</p>
                      <p className="mt-1 text-slate-500">{item.summary}</p>
                      {item.error_message && <p className="mt-1 max-w-md text-xs text-red-400">{item.error_message}</p>}
                    </td>
                    <td className="px-5 py-3 text-slate-400">
                      {item.actor_name}
                      {item.actor_email && <p className="mt-1 text-xs text-slate-600">{item.actor_email}</p>}
                    </td>
                    <td className="px-5 py-3 capitalize text-slate-300">{item.status}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">
                      {item.dataset_id && <p>Dataset {item.dataset_id}</p>}
                      {item.pipeline_id && <p className="mt-1">Pipeline {item.pipeline_id}</p>}
                    </td>
                  </tr>
                ))}
                {overview && overview.activity.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">No process activity recorded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {overview?.activity.some((item) => item.actor_name === "Unattributed") && (
            <p className="border-t border-slate-800 px-5 py-3 text-xs text-slate-500">
              Older quality-analysis records predate actor tracking and are shown as Unattributed.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
    </section>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}