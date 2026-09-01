/**
 * Authorized key-programming rules for a licensed shop.
 *
 * A key job is only allowed when the customer owns / authorized the vehicle
 * on an open repair order (name + signature on file). This module does not
 * implement immobilizer bypass, stolen-vehicle cloning, rolling-code attacks,
 * or any unauthorized access.
 */

export type KeyType = "transponder" | "proximity" | "mechanical" | "smart_key";
export type KeyOperation = "identify" | "add_key" | "program_key" | "test";
export type KeyJobMode = "simulator" | "hardware";
export type KeyJobResult = "pending" | "success" | "failed" | "blocked";

export const ALLOWED_KEY_OPERATIONS: readonly KeyOperation[] = [
  "identify",
  "add_key",
  "program_key",
  "test",
];

const FORBIDDEN = [
  "bypass",
  "immobilizer_bypass",
  "clone_stolen",
  "rolling_code",
  "rolling-code",
  "theft",
  "override_immo",
];

export type RepairOrderAuth = {
  _id: string;
  customerId: string;
  vehicleId: string;
  authorizationName?: string | null;
  authorizationMethod?: string | null;
  signedAt?: string | null;
  customerSignature?: string | null;
  status?: string;
};

export class KeyAuthorizationError extends Error {
  readonly code: "UNAUTHORIZED" | "FORBIDDEN_OPERATION" | "BAD_REQUEST";
  constructor(message: string, code: KeyAuthorizationError["code"] = "UNAUTHORIZED") {
    super(message);
    this.name = "KeyAuthorizationError";
    this.code = code;
  }
}

export function isForbiddenOperation(operation: string): boolean {
  const key = operation.trim().toLowerCase().replace(/\s+/g, "_");
  return FORBIDDEN.includes(key) || FORBIDDEN.some((f) => key.includes(f));
}

export function assertAllowedOperation(operation: string): KeyOperation {
  if (isForbiddenOperation(operation)) {
    throw new KeyAuthorizationError(
      "That operation is not supported. MechPro only programs keys for a customer who owns and authorized the vehicle.",
      "FORBIDDEN_OPERATION",
    );
  }
  if (!ALLOWED_KEY_OPERATIONS.includes(operation as KeyOperation)) {
    throw new KeyAuthorizationError(
      `Unsupported key operation: ${operation}`,
      "BAD_REQUEST",
    );
  }
  return operation as KeyOperation;
}

export function isRoAuthorizedForKeys(ro: RepairOrderAuth | null | undefined): boolean {
  if (!ro) return false;
  if (ro.status === "cancelled") return false;
  const named = Boolean(ro.authorizationName && ro.authorizationName.trim());
  const signed = Boolean(ro.signedAt || ro.customerSignature);
  return named && signed;
}

export function assertKeyJobAuthorized(opts: {
  customerId: string;
  vehicleId: string;
  ro: RepairOrderAuth | null | undefined;
  operation: string;
}): { operation: KeyOperation; authorizationName: string; signedAt: string } {
  const operation = assertAllowedOperation(opts.operation);
  if (!opts.customerId || !opts.vehicleId) {
    throw new KeyAuthorizationError("Customer and vehicle are required", "BAD_REQUEST");
  }
  const ro = opts.ro;
  if (!ro) {
    throw new KeyAuthorizationError(
      "Key programming requires a repair order with customer authorization on file",
    );
  }
  if (ro.customerId !== opts.customerId) {
    throw new KeyAuthorizationError(
      "The repair order customer does not match the selected customer",
    );
  }
  if (ro.vehicleId !== opts.vehicleId) {
    throw new KeyAuthorizationError(
      "The repair order vehicle does not match the selected vehicle",
    );
  }
  if (!isRoAuthorizedForKeys(ro)) {
    throw new KeyAuthorizationError(
      "Customer must sign and authorize this repair order before keys can be programmed",
    );
  }
  return {
    operation,
    authorizationName: ro.authorizationName!.trim(),
    signedAt: ro.signedAt ?? new Date().toISOString(),
  };
}
