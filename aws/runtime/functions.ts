/**
 * Function registration and references.
 *
 * Replaces convex/_generated/server (query, mutation, action, ...) and
 * convex/_generated/api (the `api` / `internal` proxies). Ported modules keep
 * their existing source; only their import specifiers are redirected here, so
 * `export const listCustomers = query({ args, handler })` still works verbatim.
 *
 * Convex's `anyApi` is a Proxy that turns property access into a function path,
 * which is why `internal.email.sendInvoiceEmail` type-checks without any
 * generated code. The same trick is used here, and the resulting path is what
 * the registry looks up.
 */

export type FunctionKind = "query" | "mutation" | "action";

export type RegisteredFunction = {
  kind: FunctionKind;
  isPublic: boolean;
  args?: Record<string, unknown>;
  returns?: unknown;
  handler: (ctx: never, args: never) => unknown;
};

type ValidatorJson =
  | { type: "null" | "number" | "bigint" | "boolean" | "string" | "bytes" | "any" }
  | { type: "literal"; value: unknown }
  | { type: "id"; tableName: string }
  | { type: "array"; value: ValidatorJson }
  | { type: "record"; keys: ValidatorJson; values: ValidatorField }
  | { type: "object"; value: Record<string, ValidatorField> }
  | { type: "union"; value: ValidatorJson[] };

type ValidatorField = { fieldType: ValidatorJson; optional: boolean };
type ConvexValidator = { json: ValidatorJson; isOptional: "optional" | "required" };

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function validationError(scope: string, path: string, expected: string, value: unknown): never {
  throw new Error(
    `Validation failed for ${scope} at ${path}: expected ${expected}, received ${describeValue(value)}`,
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateJson(value: unknown, validator: ValidatorJson, scope: string, path: string): void {
  switch (validator.type) {
    case "any":
      return;
    case "null":
      if (value !== null) validationError(scope, path, "null", value);
      return;
    case "number":
      if (typeof value !== "number") validationError(scope, path, "number", value);
      return;
    case "bigint":
      if (typeof value !== "bigint") validationError(scope, path, "bigint", value);
      return;
    case "boolean":
      if (typeof value !== "boolean") validationError(scope, path, "boolean", value);
      return;
    case "string":
      if (typeof value !== "string") validationError(scope, path, "string", value);
      return;
    case "bytes":
      if (!(value instanceof ArrayBuffer)) validationError(scope, path, "bytes", value);
      return;
    case "id":
      if (typeof value !== "string") validationError(scope, path, `id(${validator.tableName})`, value);
      return;
    case "literal":
      if (!Object.is(value, validator.value)) validationError(scope, path, "literal", value);
      return;
    case "array":
      if (!Array.isArray(value)) validationError(scope, path, "array", value);
      value.forEach((item, index) => validateJson(item, validator.value, scope, `${path}[${index}]`));
      return;
    case "object":
      validateObject(value, validator.value, scope, path);
      return;
    case "record":
      if (!isObject(value)) validationError(scope, path, "record", value);
      for (const [key, item] of Object.entries(value)) {
        validateJson(key, validator.keys, scope, `${path}.${key} (key)`);
        validateJson(item, validator.values.fieldType, scope, `${path}.${key}`);
      }
      return;
    case "union":
      for (const member of validator.value) {
        try {
          validateJson(value, member, scope, path);
          return;
        } catch {
          // Try the next union member before reporting the union as a whole.
        }
      }
      validationError(scope, path, "union member", value);
  }
}

function validateObject(
  value: unknown,
  fields: Record<string, ValidatorField>,
  scope: string,
  path: string,
): void {
  if (!isObject(value)) validationError(scope, path, "object", value);
  for (const key of Object.keys(value)) {
    if (!(key in fields)) validationError(scope, `${path}.${key}`, "no extra field", value[key]);
  }
  for (const [key, field] of Object.entries(fields)) {
    if (!(key in value)) {
      if (!field.optional) validationError(scope, `${path}.${key}`, field.fieldType.type, undefined);
      continue;
    }
    validateJson(value[key], field.fieldType, scope, `${path}.${key}`);
  }
}

export function validateArguments(fn: RegisteredFunction, args: Record<string, unknown>): void {
  if (!fn.args) return;
  const fields = Object.fromEntries(
    Object.entries(fn.args).map(([name, value]) => {
      const validator = value as ConvexValidator;
      return [
        name,
        { fieldType: validator.json, optional: validator.isOptional === "optional" },
      ];
    }),
  );
  validateObject(args, fields, "arguments", "args");
}

export function validateReturnValue(fn: RegisteredFunction, value: unknown): void {
  if (!fn.returns) return;
  validateJson(value, (fn.returns as ConvexValidator).json, "return value", "return");
}

/** Marker so a reference can be told apart from a plain object at runtime. */
const PATH = Symbol.for("mechpro.functionPath");

export type FunctionReference = { [PATH]: string };

export function referencePath(ref: unknown): string {
  if (typeof ref === "string") return ref;
  const path = (ref as FunctionReference | undefined)?.[PATH];
  if (!path) throw new Error("Not a function reference");
  return path;
}

/**
 * Builds "module:function" paths from property access, matching Convex.
 * Nested directories become slash-separated, e.g. internal.foo.bar.baz ->
 * "foo/bar:baz".
 */
function makeReferenceProxy(prefix: string[] = []): FunctionReference {
  const target = Object.assign(() => undefined, {}) as unknown as FunctionReference;
  return new Proxy(target, {
    get(_t, prop: string | symbol): unknown {
      if (prop === PATH) {
        if (prefix.length < 2) {
          throw new Error(`Incomplete function reference: ${prefix.join(".")}`);
        }
        const fn = prefix[prefix.length - 1];
        const mod = prefix.slice(0, -1).join("/");
        return `${mod}:${fn}`;
      }
      if (typeof prop === "symbol") return undefined;
      return makeReferenceProxy([...prefix, prop]);
    },
  }) as unknown as FunctionReference;
}

export const api = makeReferenceProxy() as unknown as Record<string, never>;
export const internal = makeReferenceProxy() as unknown as Record<string, never>;

// ─── Registry ────────────────────────────────────────────────────────────────

const registry = new Map<string, RegisteredFunction>();

/**
 * Registers every exported function of a module under "moduleName:exportName".
 * Called by the generated loader once per module at cold start.
 */
export function registerModule(moduleName: string, exports: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(exports)) {
    if (isRegistered(value)) {
      registry.set(`${moduleName}:${name}`, value);
    }
  }
}

function isRegistered(value: unknown): value is RegisteredFunction {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    "handler" in value &&
    typeof (value as RegisteredFunction).handler === "function"
  );
}

export function lookup(ref: unknown): RegisteredFunction {
  const path = referencePath(ref);
  const fn = registry.get(path);
  if (!fn) throw new Error(`Function not found: ${path}`);
  return fn;
}

export function lookupPublic(path: string): RegisteredFunction {
  const fn = registry.get(path);
  // Internal functions are reachable from other server functions but must never
  // be callable over HTTP, which is what the client router uses this for.
  if (!fn || !fn.isPublic) throw new Error(`Function not found: ${path}`);
  return fn;
}

export function registeredPaths(): string[] {
  return [...registry.keys()];
}

// ─── Definition helpers (drop-in for convex/_generated/server) ───────────────

type Definition<Ctx, Args, Result> = {
  args?: Record<string, unknown>;
  returns?: unknown;
  handler: (ctx: Ctx, args: Args) => Result;
};

function define(kind: FunctionKind, isPublic: boolean) {
  return <Ctx, Args, Result>(def: Definition<Ctx, Args, Result>): RegisteredFunction => ({
    kind,
    isPublic,
    args: def.args,
    returns: def.returns,
    handler: def.handler as RegisteredFunction["handler"],
  });
}

export const query = define("query", true);
export const internalQuery = define("query", false);
export const mutation = define("mutation", true);
export const internalMutation = define("mutation", false);
export const action = define("action", true);
export const internalAction = define("action", false);

/** Convex httpAction wrapper; the single /stripe-webhook route uses this. */
export function httpAction(
  handler: (ctx: unknown, request: Request) => Promise<Response>,
): (ctx: unknown, request: Request) => Promise<Response> {
  return handler;
}
