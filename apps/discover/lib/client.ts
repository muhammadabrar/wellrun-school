"use client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  schoolId: string | null;
};

export function getSession() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("wellrun-user");
  const token = localStorage.getItem("wellrun-token");
  if (!raw || !token) return null;
  return { token, user: JSON.parse(raw) as SessionUser };
}

export function setSession(next: { token: string; user: SessionUser } | null) {
  if (!next) {
    localStorage.removeItem("wellrun-token");
    localStorage.removeItem("wellrun-user");
    return;
  }
  localStorage.setItem("wellrun-token", next.token);
  localStorage.setItem("wellrun-user", JSON.stringify(next.user));
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  const session = getSession();
  if (session) headers.Authorization = `Bearer ${session.token}`;
  const res = await fetch(`${API}${path}`, { ...init, headers, credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = Array.isArray(body.message) ? body.message[0] : body.message;
    throw new Error(message ?? `Request failed: ${path}`);
  }
  return res.json();
}

export const client = {
  signup: (payload: { name: string; email: string; password: string; confirm: string }) =>
    request<{ token: string; user: SessionUser }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: SessionUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request("/auth/logout", { method: "POST" }),
  forgot: (email: string) =>
    request<{ message: string }>("/auth/forgot", { method: "POST", body: JSON.stringify({ email }) }),
  reset: (token: string, password: string, confirm: string) =>
    request<{ message: string }>("/auth/reset", {
      method: "POST",
      body: JSON.stringify({ token, password, confirm }),
    }),
  claim: (payload: { slug: string; roleAtSchool: string; whatsapp: string; note?: string }) =>
    request("/claims", { method: "POST", body: JSON.stringify(payload) }),
  myClaims: () =>
    request<{ id: string; status: string; school: { slug: string; name: string } }[]>("/claims/mine"),
};
