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
