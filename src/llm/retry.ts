const RETRY_DELAYS_MS = [2_000, 4_000, 8_000];

export async function withRetries<T>(
  label: string,
  call: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !isRetryableError(err)) {
        throw err;
      }
      process.stdout.write(
        `[retry: ${label} failed (${summarizeError(err)}); retrying in ${delay / 1000}s]\n`,
      );
      await sleep(delay);
    }
  }
}

function isRetryableError(err: unknown): boolean {
  const e = err as Record<string, unknown>;
  const status = Number(e.status ?? e.statusCode);
  if (status === 429 || (status >= 500 && status <= 599)) return true;

  const code = stringField(e.code);
  if (
    [
      "ETIMEDOUT",
      "ECONNRESET",
      "ECONNREFUSED",
      "ENOTFOUND",
      "EAI_AGAIN",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_HEADERS_TIMEOUT",
      "UND_ERR_SOCKET",
    ].includes(code)
  ) {
    return true;
  }

  const type = stringField(e.type) || stringField((e.error as Record<string, unknown> | undefined)?.type);
  if (["overloaded_error", "rate_limit_error"].includes(type)) return true;

  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    message.includes("connection error") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("temporarily unavailable") ||
    message.includes("overloaded") ||
    message.includes("rate limit")
  );
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function summarizeError(err: unknown): string {
  if (err instanceof Error && err.message) return oneLine(err.message, 120);
  return oneLine(String(err), 120);
}

function oneLine(s: string, cap: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > cap ? flat.slice(0, cap - 1) + "..." : flat;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
