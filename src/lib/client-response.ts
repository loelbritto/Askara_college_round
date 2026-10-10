const statusMessages: Record<number, string> = {
  401: "Your access session has expired. Sign in again; your work is still here.",
  403: "The server did not allow this request. Reopen the workspace and try again.",
  413: "The request is too large. Reduce the source packet before trying again.",
  429: "Too many requests. Wait before trying again. Your inputs and previous report are preserved.",
  502: "The audit service could not return a valid response. Your work is preserved; retry explicitly.",
  503: "The audit service is temporarily unavailable. Your work is preserved; try again later.",
  504: "The audit request timed out. Your work is preserved; retry explicitly.",
};

/** Hosting and firewall errors can be HTML even when application routes return JSON. */
export async function readApiResponse<T>(response: Response, fallback: string): Promise<T> {
  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error(response.ok
      ? "The server returned an unreadable response. Your work is preserved; retry explicitly."
      : statusMessages[response.status] || fallback);
  }
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data
      && data.error && typeof data.error === "object" && "message" in data.error
      && typeof data.error.message === "string" ? data.error.message : undefined;
    throw new Error(message || statusMessages[response.status] || fallback);
  }
  return data as T;
}
