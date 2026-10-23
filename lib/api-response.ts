export async function readApiResponse(
  response: Response,
  fallback: string,
): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body !== null &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string" &&
      body.error.trim()
        ? body.error
        : response.status === 429
          ? "Too many requests. Please try again shortly."
          : fallback;
    throw new Error(message);
  }
  if (body === null) throw new Error(fallback);
  return body;
}
