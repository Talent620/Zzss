// canonical.ts — deterministic serialization + hashing.
//
// Everything that gets hashed in Aegis passes through here, so that the agent
// and the verifier compute byte-identical digests for byte-identical meaning.
// If two parties disagree about a single field, the hashes diverge — which is
// exactly the property the Hardware-in-the-Loop verifier relies on.

import { createHash } from "node:crypto";

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = sortDeep(obj[key]);
    return out;
  }
  return value;
}

/** Stable JSON: object keys sorted recursively. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

export function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/** sha256 over the canonical form of any JSON-serializable value. */
export function hashOf(value: unknown): string {
  return sha256(canonicalize(value));
}

/** Hamming distance (in bits) between two equal-length hex digests. */
export function bitDistance(hexA: string, hexB: string): number {
  if (hexA.length !== hexB.length) return Number.POSITIVE_INFINITY;
  let bits = 0;
  for (let i = 0; i < hexA.length; i++) {
    let x = parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16);
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
  }
  return bits;
}
