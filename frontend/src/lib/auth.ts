import { useSyncExternalStore } from "react";
import { API_URL } from "@/lib/api";

// Who is signed in. The session token lives in this browser only (localStorage), and the
// server keeps a hashed copy so that logging out really ends the session.

export type Session = { token: string; name: string; email: string };

const KEY = "airsense.session";
const EVENT = "airsense-auth";

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null; // private window or blocked storage: act as signed out
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function getSession(): Session | null {
  const raw = readRaw();
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return s && typeof s.token === "string" ? (s as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: the person stays signed out */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function clearSession() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
  window.dispatchEvent(new Event(EVENT));
}

// The raw string is the snapshot, so React can compare it cheaply. The server render sees "signed out".
export function useSession(): Session | null {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return s && typeof s.token === "string" ? (s as Session) : null;
  } catch {
    return null;
  }
}

// Turn the server's error body into one plain sentence.
export async function errorText(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail) && body.detail[0]?.msg) return "Please check the details you entered and try again.";
  } catch {
    /* fall through */
  }
  return `The server answered with status ${res.status}.`;
}

async function post(path: string, body: unknown): Promise<Session> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("We couldn’t reach the AirSense server. Check that it is running, then try again.");
  }
  if (!res.ok) throw new Error(await errorText(res));
  const data = await res.json();
  const session: Session = { token: data.token, name: data.user.name, email: data.user.email };
  saveSession(session);
  return session;
}

export const login = (email: string, password: string) => post("/auth/login", { email, password });

export const register = (name: string, email: string, password: string) =>
  post("/auth/register", { name, email, password });

export async function logout() {
  const s = getSession();
  clearSession(); // sign out here first, even if the server cannot be reached
  if (s) {
    try {
      await fetch(`${API_URL}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${s.token}` } });
    } catch {
      /* the session still expires by itself after 7 days */
    }
  }
}

// A request that carries the signed-in person's token. A 401 means the session ended.
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const s = getSession();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
      ...(s ? { Authorization: `Bearer ${s.token}` } : {}),
    },
  });
  if (res.status === 401) clearSession();
  return res;
}
