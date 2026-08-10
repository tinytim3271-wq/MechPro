/**
 * A typed error taxonomy.
 *
 * The original threw bare `Error("Not authenticated")` strings, which meant the
 * API could not distinguish "you are logged out" from "that record is not
 * yours" from "that part is out of stock" — they all surfaced identically. Each
 * case here carries a stable code and an explicit `expose` flag so internal
 * details never reach a client by accident.
 */

export const ErrorCode = {
  Unauthenticated: "UNAUTHENTICATED",
  Forbidden: "FORBIDDEN",
  NotFound: "NOT_FOUND",
  Conflict: "CONFLICT",
  Validation: "VALIDATION",
  RateLimited: "RATE_LIMITED",
  PaymentRequired: "PAYMENT_REQUIRED",
  InvalidTransition: "INVALID_TRANSITION",
  InsufficientStock: "INSUFFICIENT_STOCK",
  Upstream: "UPSTREAM_FAILURE",
  Internal: "INTERNAL",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  readonly code: ErrorCode;
  /** Whether `message` is safe to show a client. */
  readonly expose: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    options: { expose?: boolean; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.expose = options.expose ?? true;
    this.details = options.details;
  }

  /** The shape sent over the wire. Never includes `cause` or a stack. */
  toClient(): { code: ErrorCode; message: string; details?: Record<string, unknown> } {
    return {
      code: this.code,
      message: this.expose ? this.message : "Something went wrong.",
      ...(this.expose && this.details ? { details: this.details } : {}),
    };
  }
}

export const errors = {
  unauthenticated: (message = "You need to sign in to do that.") =>
    new AppError(ErrorCode.Unauthenticated, message),

  forbidden: (message = "You do not have access to that.") =>
    new AppError(ErrorCode.Forbidden, message),

  /**
   * Used for records that exist but belong to another tenant, as well as those
   * that genuinely do not exist. Callers must not be able to tell the
   * difference, or the API becomes an existence oracle for other shops' data.
   */
  notFound: (what = "That record") =>
    new AppError(ErrorCode.NotFound, `${what} could not be found.`),

  conflict: (message: string, details?: Record<string, unknown>) =>
    new AppError(ErrorCode.Conflict, message, { details }),

  validation: (message: string, details?: Record<string, unknown>) =>
    new AppError(ErrorCode.Validation, message, { details }),

  rateLimited: (message = "Too many requests. Please slow down.") =>
    new AppError(ErrorCode.RateLimited, message),

  paymentRequired: (message = "An active subscription is required.") =>
    new AppError(ErrorCode.PaymentRequired, message),

  invalidTransition: (from: string, to: string) =>
    new AppError(
      ErrorCode.InvalidTransition,
      `Cannot change status from ${from} to ${to}.`,
      { details: { from, to } },
    ),

  insufficientStock: (partName: string, requested: number, available: number) =>
    new AppError(
      ErrorCode.InsufficientStock,
      `Not enough ${partName} in stock: ${requested} requested, ${available} available.`,
      { details: { partName, requested, available } },
    ),

  upstream: (service: string, cause?: unknown) =>
    new AppError(ErrorCode.Upstream, `${service} is unavailable right now.`, {
      cause,
    }),

  internal: (message: string, cause?: unknown) =>
    new AppError(ErrorCode.Internal, message, { expose: false, cause }),
} as const;

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
