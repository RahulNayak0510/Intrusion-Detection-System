import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import type {
  DashboardSummary,
  EventDetail,
  EventFilters,
  EventSummary,
  Paginated,
  ReplayResult,
  TokenOut,
  UserInfo,
} from "../types";

const TOKEN_KEY = "nids.auth.token";
const USER_KEY = "nids.auth.user";

export const client: AxiosInstance = axios.create({
  baseURL: "/api",
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

client.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  const token = getToken();
  if (token && cfg.headers) {
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

client.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err?.response?.status;
    if (status === 401) {
      clearAuth();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.assign("/login?redirect=" + encodeURIComponent(window.location.pathname + window.location.search));
      }
    }
    return Promise.reject(err);
  },
);

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string) {
  try { localStorage.setItem(TOKEN_KEY, t); } catch {}
}
export function getUser(): any | null {
  try {
    const v = localStorage.getItem(USER_KEY);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}
export function setUser(u: any) {
  try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch {}
}
export function clearAuth() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {}
}
export function isAuthenticated(): boolean {
  return !!getToken();
}

export interface LoginParams { username: string; password: string; }

export async function login(params: LoginParams): Promise<{ token: string }> {
  const { data } = await client.post<{ access_token: string; token_type: string; expires_minutes: number }>(
    "/auth/login",
    params,
  );
  return { token: data.access_token };
}

export async function fetchMe(): Promise<UserInfo> {
  const { data } = await client.get<UserInfo>("/auth/me");
  return data;
}

export async function fetchDashboard(hours = 24): Promise<DashboardSummary> {
  const { data } = await client.get<DashboardSummary>("/dashboard/summary", { params: { hours } });
  return data;
}

export async function fetchEvents(params: EventFilters): Promise<Paginated<EventSummary>> {
  const clean: any = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    clean[k] = v;
  }
  const { data } = await client.get<Paginated<EventSummary>>("/events", { params: clean });
  return data;
}

export async function fetchEvent(id: number): Promise<EventDetail> {
  const { data } = await client.get<EventDetail>(`/events/${id}`);
  return data;
}

export async function acknowledgeEvent(id: number, acknowledged: boolean): Promise<EventDetail> {
  const { data } = await client.patch<EventDetail>(`/events/${id}/acknowledge`, { acknowledged });
  return data;
}

export async function addNote(id: number, note: string) {
  const { data } = await client.post(`/events/${id}/notes`, { note });
  return data;
}

export async function replaySample(): Promise<ReplayResult> {
  const { data } = await client.post<ReplayResult>("/admin/replay-sample", {});
  return data;
}
