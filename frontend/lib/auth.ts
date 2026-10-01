import { apiFetch, setToken } from "./api";

export type UserRole =
  | "admin"
  | "data_engineer"
  | "analyst"
  | string;

export type CurrentUser = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  organization_id?: string;
  is_active: boolean;
  role?: UserRole;
};

export async function login(
  email: string,
  password: string
) {
  const response = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.detail || "Invalid email or password."
    );
  }

  setToken(data.access_token);

  return data;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const response = await apiFetch("/me");

  if (!response.ok) {
    throw new Error("Unable to load current user.");
  }

  return response.json();
}
