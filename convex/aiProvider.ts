type RetryableAiError = {
  status?: unknown;
  headers?: { get?: (name: string) => string | null };
};

type AiFallbackOptions<T> = {
  primaryModel: string;
  fallbackModels?: string[];
  request: (model: string) => Promise<T>;
  isUnavailableResult?: (result: T) => boolean;
  sleep?: (milliseconds: number) => Promise<void>;
};

const MAX_RETRY_DELAY_MS = 2_000;
const DEFAULT_RETRY_DELAY_MS = 400;

export function isAiProviderUnavailableText(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    (normalized.includes("rate-limit") || normalized.includes("rate limit") || normalized.includes("quota")) &&
    (normalized.includes("unavailable") || normalized.includes("try again") || normalized.includes("reset"))
  );
}

export function isRetryableAiError(error: unknown): boolean {
  const status = (error as RetryableAiError | null)?.status;
  return status === 408 || status === 409 || status === 429 || (typeof status === "number" && status >= 500);
}

function retryDelay(error: unknown, attempt: number): number {
  const retryAfter = (error as RetryableAiError | null)?.headers?.get?.("retry-after");
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(retryAfterSeconds * 1_000, MAX_RETRY_DELAY_MS);
  }
  return Math.min(DEFAULT_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

export async function runWithAiModelFallback<T>({
  primaryModel,
  fallbackModels = [],
  request,
  isUnavailableResult,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}: AiFallbackOptions<T>): Promise<T> {
  const models = [...new Set([primaryModel, ...fallbackModels])];
  let lastError: unknown;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];
    try {
      const result = await request(model);
      if (!isUnavailableResult?.(result)) return result;
      lastError = new Error("AI provider returned an unavailable response");
    } catch (error) {
      if (!isRetryableAiError(error)) throw error;
      lastError = error;
    }

    if (modelIndex < models.length - 1) {
      await sleep(retryDelay(lastError, modelIndex));
    }
  }

  throw lastError ?? new Error("AI provider unavailable");
}