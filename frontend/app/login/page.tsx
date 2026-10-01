"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, setToken } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("access_token");

    if (token) {
      router.replace("/dashboard");
      return;
    }

  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError("");

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      const response = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        let message = "Invalid email or password.";

        if (typeof data?.detail === "string") {
          message = data.detail;
        } else if (Array.isArray(data?.detail)) {
          message = data.detail
            .map((item: { msg?: string }) => item.msg)
            .filter(Boolean)
            .join(", ");
        }

        throw new Error(message);
      }

      if (!data?.access_token) {
        throw new Error(
          "Login succeeded, but no access token was returned."
        );
      }

      setToken(data.access_token);

      const meResponse = await apiFetch("/me");

      if (!meResponse.ok) {
        throw new Error("Unable to load user profile.");
      }

      router.replace("/dashboard");
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

  return (
    <main className="relative flex min-h-screen overflow-hidden bg-slate-950 text-white">
      {/* Background decoration */}

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-20%] h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-3xl" />

        <div className="absolute bottom-[-20%] right-[-10%] h-[500px] w-[500px] rounded-full bg-indigo-600/10 blur-3xl" />

        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      <div className="relative z-10 grid min-h-screen w-full lg:grid-cols-2">
        {/* =================================================
            LEFT PANEL
        ================================================= */}

        <section className="hidden flex-col justify-between border-r border-slate-800 p-10 lg:flex xl:p-14">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-3"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold shadow-lg shadow-blue-600/20">
                D
              </div>

              <div>
                <p className="text-lg font-bold tracking-tight">
                  DataForge
                </p>

                <p className="text-xs text-slate-500">
                  Data Platform
                </p>
              </div>
            </Link>
          </div>

          <div className="max-w-xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/5 px-3 py-1.5 text-xs font-medium text-blue-400">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              Production Data Platform
            </div>

            <h1 className="text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
              Turn your data into
              <span className="text-blue-400">
                {" "}
                actionable insights.
              </span>
            </h1>

            <p className="mt-6 max-w-lg text-base leading-7 text-slate-400">
              DataForge brings data ingestion, quality validation,
              pipeline orchestration and analytics into one
              secure workspace.
            </p>

            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              <Feature
                title="Data Management"
                description="Organize and process datasets."
              />

              <Feature
                title="Data Quality"
                description="Detect missing and duplicate data."
              />

              <Feature
                title="Pipeline Automation"
                description="Run repeatable data workflows."
              />

              <Feature
                title="Analytics"
                description="Turn processed data into insights."
              />
            </div>
          </div>

          <p className="text-xs text-slate-600">
            Secure workspace · Role-based access · API-driven
          </p>
        </section>

        {/* =================================================
            LOGIN PANEL
        ================================================= */}

        <section className="flex items-center justify-center px-6 py-12 sm:px-10">
          <div className="w-full max-w-md">
            {/* Mobile brand */}

            <div className="mb-10 lg:hidden">
              <Link
                href="/"
                className="inline-flex items-center gap-3"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold">
                  D
                </div>

                <div>
                  <p className="text-lg font-bold">
                    DataForge
                  </p>

                  <p className="text-xs text-slate-500">
                    Data Platform
                  </p>
                </div>
              </Link>
            </div>

            <div className="mb-8">
              <p className="mb-3 text-sm font-medium text-blue-400">
                Secure access
              </p>

              <h2 className="text-3xl font-bold tracking-tight">
                Sign in to DataForge
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-500">
                Access your data engineering and analytics
                workspace.
              </p>
            </div>

            {/* Error */}

            {error && (
              <div
                role="alert"
                className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3"
              >
                <div className="flex gap-3">
                  <span className="mt-0.5 text-red-400">
                    !
                  </span>

                  <p className="text-sm leading-5 text-red-400">
                    {error}
                  </p>
                </div>
              </div>
            )}

            {/* Form */}

            <form
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Email address
                </label>

                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-slate-300"
                  >
                    Password
                  </label>
                </div>

                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/10 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-transparent" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>

            {/* Register */}

            <div className="mt-8 text-center">
              <p className="text-sm text-slate-500">
                Don&apos;t have an account?{" "}
                <Link
                  href="/register"
                  className="font-medium text-blue-400 transition hover:text-blue-300"
                >
                  Create an account
                </Link>
              </p>
            </div>

            <div className="mt-10 border-t border-slate-800 pt-6">
              <p className="text-center text-xs leading-5 text-slate-600">
                Access permissions are determined by your
                DataForge account role.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   FEATURE CARD
========================================================= */

function Feature({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <p className="text-sm font-medium text-slate-200">
        {title}
      </p>

      <p className="mt-1 text-xs leading-5 text-slate-600">
        {description}
      </p>
    </div>
  );
}