// canonical.ts — deterministic hashing for the mobile terminal.
//
// Identical semantics to aegis/src/core/canonical.ts, but uses @noble/hashes
// (pure JS) instead of node:crypto, because there is no node:crypto on a phone.
// The agent and the on-device Physics Shield MUST compute byte-identical digests,
// so this file is the single source of canonical form for both.

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

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

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

export function sha256hex(data: string): string {
  return bytesToHex(sha256(utf8ToBytes(data)));
}

export function hashOf(value: unknown): string {
  return sha256hex(canonicalize(value));
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
