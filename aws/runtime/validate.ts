/**
 * Validates handler args against the Convex `args` PropertyValidators stored
 * on each RegisteredFunction. Convex does this automatically before the
 * handler runs; we must do it before anything is exposed over HTTP.
 */
import { ConvexError } from "convex/values";

type ConvexValidator = {
  kind: string;
  isOptional?: "required" | "optional";
  isConvexValidator?: boolean;
  tableName?: string;
  value?: unknown;
  element?: ConvexValidator;
  fields?: Record<string, ConvexValidator>;
  members?: ConvexValidator[];
  key?: ConvexValidator;
  valueValidator?: ConvexValidator;
  // v.record stores value under `.value` in some versions; also check fields.
};

function isValidator(v: unknown): v is ConvexValidator {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as ConvexValidator).isConvexValidator === true &&
    typeof (v as ConvexValidator).kind === "string"
  );
}

function pathLabel(path: string): string {
  return path || "(root)";
}

function fail(path: string, expected: string, value: unknown): never {
  throw new ConvexError({
    message: `Argument validation failed at ${pathLabel(path)}: expected ${expected}, got ${describe(value)}`,
    code: "BAD_REQUEST",
  });
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function validateOne(path: string, validator: ConvexValidator, value: unknown): unknown {
  // v.optional(x) returns the same kind with isOptional === "optional".
  if (value === undefined) {
    if (validator.isOptional === "optional" || validator.kind === "any") {
      return undefined;
    }
    fail(path, validator.kind, value);
  }

  if (value === null) {
    if (validator.kind === "null" || validator.kind === "any") return null;
    if (validator.isOptional === "optional") return null;
    fail(path, validator.kind, value);
  }

  switch (validator.kind) {
    case "any":
      return value;
    case "string":
    case "id":
      if (typeof value !== "string") fail(path, validator.kind, value);
      return value;
    case "boolean":
      if (typeof value !== "boolean") fail(path, "boolean", value);
      return value;
    case "float64":
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) fail(path, "number", value);
      return value;
    case "int64":
      if (typeof value !== "bigint" && typeof value !== "number") fail(path, "int64", value);
      return value;
    case "bytes":
      if (!(value instanceof ArrayBuffer)) fail(path, "bytes", value);
      return value;
    case "null":
      if (value !== null) fail(path, "null", value);
      return value;
    case "literal":
      if (value !== validator.value) fail(path, `literal ${String(validator.value)}`, value);
      return value;
    case "array": {
      if (!Array.isArray(value)) fail(path, "array", value);
      if (!validator.element) return value;
      return value.map((item, i) => validateOne(`${path}[${i}]`, validator.element!, item));
    }
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        fail(path, "object", value);
      }
      const obj = value as Record<string, unknown>;
      const fields = validator.fields ?? {};
      const out: Record<string, unknown> = {};
      for (const [key, fieldValidator] of Object.entries(fields)) {
        const childPath = path ? `${path}.${key}` : key;
        if (!(key in obj) || obj[key] === undefined) {
          if (fieldValidator.isOptional === "optional" || fieldValidator.kind === "optional") {
            continue;
          }
          fail(childPath, fieldValidator.kind, undefined);
        }
        out[key] = validateOne(childPath, fieldValidator, obj[key]);
      }
      return out;
    }
    case "union": {
      const members = validator.members ?? [];
      const errors: string[] = [];
      for (const member of members) {
        try {
          return validateOne(path, member, value);
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err));
        }
      }
      return fail(path, `union(${members.map((m) => m.kind).join("|")})`, value);
    }
    case "record": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        fail(path, "record", value);
      }
      const valueValidator = isValidator(validator.value) ? validator.value : undefined;
      const out: Record<string, unknown> = {};
      for (const [k, entry] of Object.entries(value as Record<string, unknown>)) {
        if (validator.key) validateOne(`${path}.${k}(key)`, validator.key, k);
        out[k] = valueValidator ? validateOne(`${path}.${k}`, valueValidator, entry) : entry;
      }
      return out;
    }
    default:
      // Unknown / future validator kinds: accept rather than block deploy.
      return value;
  }
}

/**
 * `args` on a RegisteredFunction is a PropertyValidators map (`{ field: v.string() }`),
 * not a wrapped object validator.
 */
export function validateArgs(
  argsValidator: Record<string, unknown> | undefined,
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const value = input ?? {};
  if (!argsValidator || Object.keys(argsValidator).length === 0) {
    return value;
  }

  // Some definitions use `args: v.object({...})` instead of a bare field map.
  if (isValidator(argsValidator) && argsValidator.kind === "object") {
    return validateOne("", argsValidator, value) as Record<string, unknown>;
  }

  const fields: Record<string, ConvexValidator> = {};
  for (const [key, validator] of Object.entries(argsValidator)) {
    if (!isValidator(validator)) {
      throw new ConvexError({
        message: `Invalid args validator for field "${key}"`,
        code: "BAD_REQUEST",
      });
    }
    fields[key] = validator;
  }

  return validateOne("", { kind: "object", fields, isConvexValidator: true }, value) as Record<
    string,
    unknown
  >;
}
