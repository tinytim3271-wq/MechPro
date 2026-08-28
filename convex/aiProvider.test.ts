import { describe, expect, test, vi } from "vitest";
import {
  isAiProviderUnavailableText,
  runWithAiModelFallback,
} from "./aiProvider";

describe("AI provider fallback", () => {
  test("uses the preferred model when it succeeds", async () => {
    const request = vi.fn().mockResolvedValue("ok");

    await expect(runWithAiModelFallback({
      primaryModel: "primary",
      fallbackModels: ["fallback"],
      request,
    })).resolves.toBe("ok");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("primary");
  });

  test("falls back after a rate limit and honors Retry-After", async () => {
    const request = vi.fn()
      .mockRejectedValueOnce({ status: 429, headers: { get: () => "1" } })
      .mockResolvedValueOnce("fallback result");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(runWithAiModelFallback({
      primaryModel: "primary",
      fallbackModels: ["fallback"],
      request,
      sleep,
    })).resolves.toBe("fallback result");
    expect(request.mock.calls).toEqual([["primary"], ["fallback"]]);
    expect(sleep).toHaveBeenCalledWith(1_000);
  });

  test("treats a gateway quota message as an unavailable result", async () => {
    const outage = "The cloud assistant is temporarily unavailable because the AI provider is rate-limited; try again after the provider quota resets.";
    const request = vi.fn().mockResolvedValueOnce(outage).mockResolvedValueOnce("ok");

    await expect(runWithAiModelFallback({
      primaryModel: "primary",
      fallbackModels: ["fallback"],
      request,
      isUnavailableResult: isAiProviderUnavailableText,
      sleep: async () => undefined,
    })).resolves.toBe("ok");
    expect(request.mock.calls).toEqual([["primary"], ["fallback"]]);
  });

  test("does not retry non-transient failures", async () => {
    const error = { status: 400 };
    const request = vi.fn().mockRejectedValue(error);

    await expect(runWithAiModelFallback({
      primaryModel: "primary",
      fallbackModels: ["fallback"],
      request,
    })).rejects.toBe(error);
    expect(request).toHaveBeenCalledTimes(1);
  });
});