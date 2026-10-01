"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "../../lib/api";

export default function RegisterPage() {
  const router = useRouter();

  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (
      !organizationName.trim() ||
      !organizationSlug.trim() ||
      !firstName.trim() ||
      !lastName.trim() ||
      !email.trim() ||
      !password ||
      !confirmPassword ||
      !role
    ) {
      setError(
        !role
          ? "Please select a role."
          : "Please complete all required fields."
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError(
        "Password must contain at least 8 characters."
      );
      return;
    }

    setLoading(true);

    try {
      const response = await apiFetch(
        "/auth/register",
        {
          method: "POST",
          body: JSON.stringify({
            organization_name: organizationName.trim(),
            organization_slug: organizationSlug.trim(),
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            email: email.trim(),
            password,
            role,
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        let message = "Registration failed.";

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

      setSuccess(
        "Account created successfully. Please sign in."
      );

      setTimeout(() => {
        router.replace("/login");
      }, 1200);
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
      {/* Background */}

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
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-3"
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

          <div className="max-w-xl">
            <p className="mb-4 text-sm font-medium text-blue-400">
              Build. Validate. Analyze.
            </p>

            <h1 className="text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
              One workspace for your
              <span className="text-blue-400">
                {" "}
                data lifecycle.
              </span>
            </h1>

            <p className="mt-6 max-w-lg text-base leading-7 text-slate-400">
              Connect your data workflows with quality checks,
              automated pipelines and analytics in a unified
              platform.
            </p>

            <div className="mt-10 space-y-4">
              <InfoRow
                number="01"
                title="Ingest"
                description="Bring datasets into your workspace."
              />

              <InfoRow
                number="02"
                title="Validate"
                description="Measure and monitor data quality."
              />

              <InfoRow
                number="03"
                title="Analyze"
                description="Explore processed data and insights."
              />
            </div>
          </div>

          <p className="text-xs text-slate-600">
            Secure workspace · Role-based access · API-driven
          </p>
        </section>

        {/* =================================================
            REGISTER FORM
        ================================================= */}

        <section className="flex items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md">
            {/* Mobile brand */}

            <div className="mb-8 lg:hidden">
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

            <div className="mb-7">
              <p className="mb-3 text-sm font-medium text-blue-400">
                Get started
              </p>

              <h2 className="text-3xl font-bold tracking-tight">
                Create your DataForge account
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-500">
                Create a DataForge account to access the
                platform.
              </p>
            </div>

            {/* Error */}

            {error && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3"
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

            {/* Success */}

            {success && (
              <div
                role="status"
                className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3"
              >
                <div className="flex gap-3">
                  <span className="mt-0.5 text-emerald-400">
                    ✓
                  </span>

                  <p className="text-sm leading-5 text-emerald-400">
                    {success}
                  </p>
                </div>
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField
                  id="organizationName"
                  label="Workspace name"
                  value={organizationName}
                  onChange={setOrganizationName}
                  placeholder="Acme Analytics"
                  disabled={loading}
                />

                <InputField
                  id="organizationSlug"
                  label="Workspace slug"
                  value={organizationSlug}
                  onChange={setOrganizationSlug}
                  placeholder="acme-analytics"
                  disabled={loading}
                />
              </div>

              {/* Name */}

              <div className="grid gap-4 sm:grid-cols-2">
                <InputField
                  id="firstName"
                  label="First name"
                  value={firstName}
                  onChange={setFirstName}
                  placeholder="First name"
                  autoComplete="given-name"
                  disabled={loading}
                />

                <InputField
                  id="lastName"
                  label="Last name"
                  value={lastName}
                  onChange={setLastName}
                  placeholder="Last name"
                  autoComplete="family-name"
                  disabled={loading}
                />
              </div>

              {/* Email */}

              <InputField
                id="email"
                label="Email address"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                type="email"
                autoComplete="email"
                disabled={loading}
              />

              {/* Password */}

              <InputField
                id="password"
                label="Password"
                value={password}
                onChange={setPassword}
                placeholder="Create a password"
                type="password"
                autoComplete="new-password"
                disabled={loading}
              />

              <p className="-mt-2 text-xs text-slate-600">
                Use at least 8 characters.
              </p>

              {/* Confirm password */}

              <InputField
                id="confirmPassword"
                label="Confirm password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Confirm your password"
                type="password"
                autoComplete="new-password"
                disabled={loading}
              />

              <div>
                <label
                  htmlFor="role"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Role
                </label>

                <select
                  id="role"
                  name="role"
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">Select Role</option>
                  <option value="data_engineer">Data Engineer</option>
                  <option value="analyst">Analyst</option>
                </select>

                <p className="mt-2 text-xs text-slate-600">
                  Select the role that matches your responsibilities.
                </p>
              </div>

              {/* Submit */}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/10 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-transparent" />
                    Creating account...
                  </>
                ) : (
                  "Create account"
                )}
              </button>
            </form>

            {/* Login */}

            <div className="mt-7 text-center">
              <p className="text-sm text-slate-500">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-medium text-blue-400 transition hover:text-blue-300"
                >
                  Sign in
                </Link>
              </p>
            </div>

            <div className="mt-8 border-t border-slate-800 pt-5">
              <p className="text-center text-xs leading-5 text-slate-600">
                Your account permissions are determined by
                your assigned DataForge role.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   INPUT FIELD
========================================================= */

function InputField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  autoComplete?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-medium text-slate-300"
      >
        {label}
      </label>

      <input
        id={id}
        name={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}

/* =========================================================
   INFO ROW
========================================================= */

function InfoRow({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-blue-400">
        {number}
      </div>

      <div>
        <p className="text-sm font-medium text-slate-200">
          {title}
        </p>

        <p className="mt-1 text-xs leading-5 text-slate-600">
          {description}
        </p>
      </div>
    </div>
  );
}