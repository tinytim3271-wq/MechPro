/**
 * HTTP client for the MechPro AWS API Gateway backend.
 *
 * Speaks the Lambda contract: POST /api { path: "module:export", args }
 * with an optional Cognito ID token as Bearer auth.
 */
import { getFunctionName, type FunctionReference } from "convex/server";

export type AwsApiError = Error & { code?: string; status?: number };

export class AwsBackendClient {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => Promise<string | null>,
  ) {}

  async call<T>(
    ref: FunctionReference<any, any, any, any> | string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const path = typeof ref === "string" ? ref : getFunctionName(ref);
    const token = await this.getToken();
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (token) headers.authorization = `Bearer ${token}`;

    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api`, {
      method: "POST",
      headers,
      body: JSON.stringify({ path, args }),
    });

    let body: { value?: T; error?: string; code?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* non-JSON */
    }

    if (!res.ok) {
      const err = new Error(body.error ?? `Request failed (${res.status})`) as AwsApiError;
      err.code = body.code;
      err.status = res.status;
      throw err;
    }

    return body.value as T;
  }
}
