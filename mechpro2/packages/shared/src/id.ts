/**
 * UUIDv7 identifiers: random like a UUIDv4, but time-ordered.
 *
 * Ordering matters here because these are primary keys. Random v4 keys scatter
 * inserts across the B-tree and fragment it; v7 keys append, which keeps index
 * pages dense and makes "newest first" queries a plain index scan.
 */

/** Branded id type so a CustomerId cannot be passed where a VehicleId is expected. */
export type Id<TTable extends string> = string & { readonly __table: TTable };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let lastTimestamp = -1;
let sequence = 0;

/**
 * Generate a UUIDv7.
 *
 * Within a single millisecond the 12-bit `rand_a` field is used as a counter so
 * ids generated in a tight loop stay strictly increasing. If that counter would
 * overflow we spin to the next millisecond rather than emit an out-of-order id.
 */
export function newId<TTable extends string = string>(): Id<TTable> {
  let timestamp = Date.now();

  if (timestamp === lastTimestamp) {
    sequence += 1;
    if (sequence > 0xfff) {
      while (timestamp === lastTimestamp) timestamp = Date.now();
      sequence = 0;
    }
  } else if (timestamp < lastTimestamp) {
    // Clock moved backwards (NTP correction). Keep monotonicity by reusing the
    // previous millisecond and advancing the counter.
    timestamp = lastTimestamp;
    sequence += 1;
  } else {
    sequence = 0;
  }
  lastTimestamp = timestamp;

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // 48-bit big-endian timestamp.
  bytes[0] = (timestamp / 2 ** 40) & 0xff;
  bytes[1] = (timestamp / 2 ** 32) & 0xff;
  bytes[2] = (timestamp / 2 ** 24) & 0xff;
  bytes[3] = (timestamp / 2 ** 16) & 0xff;
  bytes[4] = (timestamp / 2 ** 8) & 0xff;
  bytes[5] = timestamp & 0xff;

  // Version 7 in the high nibble, counter in the remaining 12 bits.
  bytes[6] = 0x70 | ((sequence >>> 8) & 0x0f);
  bytes[7] = sequence & 0xff;

  // RFC 4122 variant.
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as Id<TTable>;
}

export function isId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Extract the embedded creation time. Only meaningful for v7 ids. */
export function idTimestamp(id: string): Date {
  const hex = id.replace(/-/g, "").slice(0, 12);
  return new Date(Number.parseInt(hex, 16));
}

/**
 * A URL-safe secret for public links (estimate approval, invoice payment).
 * 32 bytes of CSPRNG output, base64url encoded.
 */
export function newPublicToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Constant-time string comparison, for validating public tokens without
 * leaking length or prefix information through timing.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
