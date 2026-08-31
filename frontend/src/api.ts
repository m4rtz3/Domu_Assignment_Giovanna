/**
 * Small fetch wrapper shared by every page: adds a client-side timeout (so a
 * slow backend doesn't leave the UI stuck on "loading" forever) and a
 * consistent error shape.
 */

const TIMEOUT_MS = 25_000;

export class ApiError extends Error {}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "GET" });
}

// Transcription can take a while for longer recordings, so it gets its own timeout.
export async function apiPostFile<T>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<T>(path, { method: "POST", body: formData }, 120_000);
}

async function apiRequest<T>(path: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(path, { ...init, signal: controller.signal });

    if (!response.ok) {
      const detail = await safeReadDetail(response);
      throw new ApiError(detail ?? `Request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("Request timed out. The server may be slow or unavailable -- try again.");
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError("Network error -- check your connection and try again.");
  } finally {
    clearTimeout(timeoutId);
  }
}

async function safeReadDetail(response: Response): Promise<string | null> {
  try {
    const data = await response.json();
    return typeof data?.detail === "string" ? data.detail : null;
  } catch {
    return null;
  }
}
