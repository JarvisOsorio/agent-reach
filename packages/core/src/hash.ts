import { createHash } from "node:crypto";

/**
 * Stable JSON stringify: sorts object keys recursively.
 * Used for integrity hashes — not for human display.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortKeys(obj[key]);
  }
  return out;
}

export function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/** Hash a receipt body with integrityHash stripped/omitted. */
export function hashReceiptBody(
  body: Omit<import("./types.js").ConversionReceipt, "integrityHash"> & {
    integrityHash?: string;
  },
): string {
  const { integrityHash: _drop, ...rest } = body;
  return sha256Hex(canonicalJson(rest));
}

/** Hash an export bundle with integrityHash stripped. */
export function hashExportBody(
  body: Omit<import("./types.js").ExportBundle, "integrityHash"> & {
    integrityHash?: string;
  },
): string {
  const { integrityHash: _drop, ...rest } = body;
  return sha256Hex(canonicalJson(rest));
}

export function verifyIntegrityHash(expected: string, actual: string): boolean {
  if (expected.length !== actual.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  return mismatch === 0;
}
