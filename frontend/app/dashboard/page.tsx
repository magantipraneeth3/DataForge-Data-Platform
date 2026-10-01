"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { apiFetch } from "../../lib/api";

type Role =
  | "admin"
  | "data_engineer"
  | "analyst"
  | "unknown";

type User = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  organization_id: string;
  is_active: boolean;
  role: string | null;
};

type Summary = {
  total_customers: number;
  churned_customers: number;
  churn_rate: number;
  average_monthly_charges: number;
  average_tenure: number;
};

type NavItem = {
  name: string;
  href: string;
  description: string;
  icon: string;
  roles: Role[];
};

const navigation: NavItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    description: "Platform overview",
    icon: "⌂",
    roles: ["admin", "data_engineer", "analyst"],
  },
  {
    name: "Datasets",
    href: "/datasets",
    description: "Manage data",
    icon: "▦",
    roles: ["admin", "data_engineer"],
  },
  {
    name: "Data Quality",
    href: "/data-quality",
    description: "Validate data",
    icon: "✓",
    roles: ["admin", "data_engineer"],
  },
  {
    name: "Pipelines",
    href: "/pipelines",
    description: "Run workflows",
    icon: "↯",
    roles: ["admin", "data_engineer"],
  },
  {
    name: "Analytics",
    href: "/analytics",
    description: "Explore insights",
    icon: "◒",
    roles: ["admin", "data_engineer", "analyst"],
  },
  {
    name: "Admin",
    href: "/admin",
    description: "Administration",
    icon: "⚙",
    roles: ["admin"],
  },
];

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsRefresh, setAnalyticsRefresh] = useState(0);

  const [error, setError] = useState("");
  const [analyticsError, setAnalyticsError] = useState("");

  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const loadDashboard = async () => {
      const token = localStorage.getItem("access_token");

      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const response = await apiFetch("/me");

        if (!response.ok) {
          localStorage.removeItem("access_token");
          router.replace("/login");
          return;
        }

        const userData: User = await response.json();

        setUser(userData);

        try {
          const analyticsResponse = await apiFetch(
            "/analytics/customer-churn/summary"
          );

          if (!analyticsResponse.ok) {
            throw new Error("Analytics could not be loaded.");
          }

          const analyticsData: Summary =
            await analyticsResponse.json();

          setSummary(analyticsData);
        } catch (analyticsErr) {
          setAnalyticsError(
            analyticsErr instanceof Error
              ? analyticsErr.message
              : "Unable to load analytics."
          );
        } finally {
          setAnalyticsLoading(false);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to connect to DataForge."
        );
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [router, analyticsRefresh]);

  const role = normalizeRole(user?.role);

  const visibleNavigation = useMemo(() => {
    return navigation.filter((item) =>
      item.roles.includes(role)
    );
  }, [role]);

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    router.replace("/login");
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-blue-500" />

          <p className="text-sm text-slate-400">
            Loading DataForge...
          </p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-slate-900 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            !
          </div>

          <h1 className="text-xl font-semibold">
            Unable to load dashboard
          </h1>

          <p className="mt-3 text-sm text-slate-400">
            {error}
          </p>

          <button
            onClick={() => window.location.reload()}
            className="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            Try Again
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <button
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}

      {/* =====================================================
          SIDEBAR
      ===================================================== */}

      <aside
        className={`
          fixed left-0 top-0 z-40 flex h-screen w-72 flex-col
          border-r border-slate-800 bg-slate-950
          transition-transform duration-200
          lg:translate-x-0
          ${
            sidebarOpen
              ? "translate-x-0"
              : "-translate-x-full"
          }
        `}
      >
        {/* Brand */}

        <div className="flex h-20 items-center border-b border-slate-800 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold shadow-lg shadow-blue-600/20">
              D
            </div>

            <div>
              <h1 className="text-lg font-bold tracking-tight">
                DataForge
              </h1>

              <p className="text-xs text-slate-500">
                Data Platform
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}

        <nav className="flex-1 overflow-y-auto px-4 py-6">
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-widest text-slate-600">
            Workspace
          </p>

          <div className="space-y-1">
            {visibleNavigation.map((item) => {
              const active = item.href === "/dashboard";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    group flex items-center gap-3 rounded-xl px-3 py-3
                    transition
                    ${
                      active
                        ? "bg-blue-600/10 text-blue-400"
                        : "text-slate-400 hover:bg-slate-900 hover:text-white"
                    }
                  `}
                >
                  <span
                    className={`
                      flex h-9 w-9 items-center justify-center rounded-lg text-sm
                      ${
                        active
                          ? "bg-blue-600 text-white"
                          : "bg-slate-900 text-slate-500 group-hover:text-slate-300"
                      }
                    `}
                  >
                    {item.icon}
                  </span>

                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {item.name}
                    </p>

                    <p className="truncate text-xs text-slate-600">
                      {item.description}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User section */}

        <div className="border-t border-slate-800 p-4">
          <div className="mb-3 rounded-xl bg-slate-900 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-sm font-semibold text-blue-400">
                {getInitials(user)}
              </div>

              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {user?.first_name} {user?.last_name}
                </p>

                <p className="truncate text-xs text-slate-500">
                  {user?.email}
                </p>
              </div>
            </div>

            <div className="mt-3">
              <RoleBadge role={role} />
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center rounded-lg border border-slate-800 px-3 py-2.5 text-sm text-slate-400 transition hover:border-red-500/30 hover:bg-red-500/5 hover:text-red-400"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* =====================================================
          MAIN AREA
      ===================================================== */}

      <div className="lg:pl-72">
        {/* Topbar */}

        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-slate-800 bg-slate-950/90 px-5 backdrop-blur lg:px-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg border border-slate-800 px-3 py-2 text-slate-300 lg:hidden"
            >
              ☰
            </button>

            <div>
              <p className="text-xs text-slate-500">
                Workspace
              </p>

              <h2 className="text-lg font-semibold">
                Overview
              </h2>
            </div>
          </div>

          <div className="hidden items-center gap-3 sm:flex">
            <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />

              <span className="text-xs text-slate-400">
                API Connected
              </span>
            </div>

            <RoleBadge role={role} />
          </div>
        </header>

        {/* Content */}

        <main className="mx-auto max-w-[1600px] p-5 lg:p-8">
          {/* Header */}

          <section className="mb-8">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <p className="mb-2 text-sm font-medium text-blue-400">
                  Data operations workspace
                </p>

                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Platform Overview
                </h1>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                  Monitor datasets, data quality, pipelines and
                  analytics from a single workspace.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setAnalyticsError("");
                    setAnalyticsLoading(true);
                    setAnalyticsRefresh((revision) => revision + 1);
                  }}
                  disabled={analyticsLoading}
                  className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {analyticsLoading ? "Refreshing..." : "Refresh analytics"}
                </button>
                {role === "admin" ||
                role === "data_engineer" ? (
                  <Link
                    href="/datasets"
                    className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500"
                  >
                    Manage Datasets
                  </Link>
                ) : (
                  <Link
                    href="/analytics"
                    className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500"
                  >
                    View Analytics
                  </Link>
                )}
              </div>
            </div>
          </section>

          {/* KPI cards */}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total Customers"
              value={
                analyticsLoading
                  ? "—"
                  : summary?.total_customers ?? 0
              }
              icon="◎"
            />

            <MetricCard
              label="Churned Customers"
              value={
                analyticsLoading
                  ? "—"
                  : summary?.churned_customers ?? 0
              }
              icon="↗"
            />

            <MetricCard
              label="Churn Rate"
              value={
                analyticsLoading
                  ? "—"
                  : `${summary?.churn_rate ?? 0}%`
              }
              icon="%"
            />

            <MetricCard
              label="Avg. Monthly Charges"
              value={
                analyticsLoading
                  ? "—"
                  : `₹${summary?.average_monthly_charges ?? 0}`
              }
              icon="₹"
            />
          </section>

          {/* Analytics error */}

          {analyticsError && (
            <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-400">
              Analytics data is currently unavailable:{" "}
              {analyticsError}
            </div>
          )}

          {/* Main grid */}

          <section className="mt-6 grid gap-6 xl:grid-cols-3">
            {/* Chart */}

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 xl:col-span-2">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    Customer Churn
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Current analytics from the processed dataset
                  </p>
                </div>

                <Link
                  href="/analytics"
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  View details →
                </Link>
              </div>

              {analyticsLoading ? (
                <div className="flex h-[300px] items-center justify-center">
                  <p className="text-sm text-slate-500">
                    Loading analytics...
                  </p>
                </div>
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                  >
                    <BarChart
                      data={[
                        {
                          name: "Customers",
                          value:
                            summary?.total_customers ?? 0,
                        },
                        {
                          name: "Churned",
                          value:
                            summary?.churned_customers ?? 0,
                        },
                      ]}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#1e293b"
                      />

                      <XAxis
                        dataKey="name"
                        stroke="#64748b"
                        tickLine={false}
                        axisLine={false}
                      />

                      <YAxis
                        stroke="#64748b"
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />

                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          border: "1px solid #1e293b",
                          borderRadius: "10px",
                          color: "#fff",
                        }}
                      />

                      <Bar
                        dataKey="value"
                        fill="#3b82f6"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Platform status */}

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-lg font-semibold">
                Platform Status
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Current service availability
              </p>

              <div className="mt-6 space-y-3">
                <StatusRow
                  name="DataForge API"
                  status="Operational"
                />

                <StatusRow
                  name="Authentication"
                  status="Operational"
                />

                <StatusRow
                  name="Analytics"
                  status={
                    analyticsError
                      ? "Unavailable"
                      : "Operational"
                  }
                />

                <StatusRow
                  name="Database"
                  status="Connected"
                />
              </div>

              <div className="mt-6 rounded-xl bg-slate-800/60 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Current access
                </p>

                <p className="mt-2 text-sm font-medium text-white">
                  {getRoleName(role)}
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Access controls are enforced by the backend
                  RBAC system.
                </p>
              </div>
            </div>
          </section>

          {/* Quick access */}

          <section className="mt-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">
                Quick Access
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Continue working with your available DataForge
                modules.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleNavigation
                .filter(
                  (item) => item.href !== "/dashboard"
                )
                .map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:-translate-y-0.5 hover:border-blue-500/30 hover:bg-slate-900/80"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-blue-400">
                        {item.icon}
                      </div>

                      <span className="text-slate-600 transition group-hover:text-blue-400">
                        →
                      </span>
                    </div>

                    <h3 className="mt-5 font-semibold">
                      {item.name}
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      {item.description}
                    </p>
                  </Link>
                ))}
            </div>
          </section>

          {/* Footer */}

          <footer className="mt-10 border-t border-slate-800 pt-6 text-center text-xs text-slate-600">
            DataForge · Production Data Engineering &
            Analytics Platform
          </footer>
        </main>
      </div>
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function normalizeRole(role: string | null | undefined): Role {
  if (!role) {
    return "unknown";
  }

  const normalized = role
    .toLowerCase()
    .trim()
    .replace("-", "_")
    .replace(" ", "_");

  if (
    normalized === "admin" ||
    normalized === "administrator"
  ) {
    return "admin";
  }

  if (
    normalized === "data_engineer" ||
    normalized === "dataengineer"
  ) {
    return "data_engineer";
  }

  if (normalized === "analyst") {
    return "analyst";
  }

  return "unknown";
}

function getRoleName(role: Role) {
  switch (role) {
    case "admin":
      return "Administrator";

    case "data_engineer":
      return "Data Engineer";

    case "analyst":
      return "Analyst";

    default:
      return "Unknown Role";
  }
}

function getInitials(user: User | null) {
  if (!user) {
    return "DF";
  }

  const first = user.first_name?.[0] ?? "";
  const last = user.last_name?.[0] ?? "";

  return `${first}${last}`.toUpperCase() || "DF";
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className="inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-400">
      {getRoleName(role)}
    </span>
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-700">
      <div className="flex items-start justify-between">
        <p className="text-sm text-slate-500">{label}</p>

        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-sm font-semibold text-blue-400">
          {icon}
        </div>
      </div>

      <p className="mt-4 text-3xl font-bold tracking-tight">
        {value}
      </p>
    </div>
  );
}

function StatusRow({
  name,
  status,
}: {
  name: string;
  status: string;
}) {
  const operational = status === "Operational" || status === "Connected";

  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-800/50 px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className={`h-2 w-2 rounded-full ${
            operational
              ? "bg-emerald-400"
              : "bg-amber-400"
          }`}
        />

        <span className="text-sm text-slate-300">
          {name}
        </span>
      </div>

      <span
        className={`text-xs ${
          operational
            ? "text-emerald-400"
            : "text-amber-400"
        }`}
      >
        {status}
      </span>
    </div>
  );
}