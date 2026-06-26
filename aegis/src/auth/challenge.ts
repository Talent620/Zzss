// challenge.ts — the Witness challenge primitive.
//
// This is the inversion of the Interceptor (Flipper-style) paradigm. An
// interceptor CAPTURES a signal and REPLAYS bit-perfect bytes, assuming the
// physical world is dumb. The Witness does the opposite: it never copies anything.
// It FORCES the target device into a live protocol exchange — issuing a fresh,
// single-use challenge and demanding a response that only the genuine device, in
// possession of a key (or in a genuine physical state), can produce right now.
//
// Three response methods, so even a near-powerless MCU can be witnessed:
//   • "ed25519"   — device signs the nonce with its own private key (asymmetric).
//   • "ascon-mac" — device MACs the nonce with a shared symmetric key. Modelled
//                   here with HMAC-SHA256 as a stand-in for ASCON-MAC, the NIST
//                   lightweight-crypto MAC built for constrained hardware.
//   • "timing"    — device echoes the nonce within a tight latency window. Proof
//                   of *physical state/presence*, not key: a genuine device answers
//                   in microseconds-to-milliseconds; a relay or replay adds latency
//                   that cannot be hidden, so it fails the window.

import { sign, verify, createPublicKey, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { KeyObject } from "node:crypto";

export type WitnessProtocol = "NFC" | "RF433" | "RF915" | "IR" | "BLE";
export type ChallengeMethod = "ed25519" | "ascon-mac" | "timing";

export interface WitnessChallenge {
  nonceHex: string; // 256-bit, fresh, single-use, TEE-bound
  protocol: WitnessProtocol;
  targetId: string;
  method: ChallengeMethod;
  issuedAtTick: number;
  expiresAtTick: number;
  maxLatencyMs: number; // only meaningful for "timing"
}

export interface DeviceResponse {
  nonceHex: string; // which nonce the device claims to answer
  payloadHex: string; // signature / MAC over the nonce, or the echoed nonce (timing)
  latencyMs: number; // measured round-trip latency observed by the Sentinel
}

export interface VerifyContext {
  deviceAnchorPubPem?: string; // for "ed25519": the device's pinned public key
  sharedKeyHex?: string; // for "ascon-mac": the shared symmetric key
}

export type WitnessCode =
  | "VERIFIED"
  | "EXPIRED"
  | "NONCE_MISMATCH"
  | "REPLAY"
  | "BAD_RESPONSE"
  | "TOO_SLOW"
  | "UNSUPPORTED";

export interface WitnessVerdict {
  verified: boolean;
  code: WitnessCode;
  reason: string;
  latencyMs?: number;
}

/** Sentinel-side: mint a fresh challenge for a target. */
export function issueChallenge(
  protocol: WitnessProtocol,
  targetId: string,
  method: ChallengeMethod,
  tick: number,
  opts: { ttlTicks?: number; maxLatencyMs?: number } = {},
): WitnessChallenge {
  return {
    nonceHex: randomBytes(32).toString("hex"),
    protocol,
    targetId,
    method,
    issuedAtTick: tick,
    expiresAtTick: tick + (opts.ttlTicks ?? 5),
    maxLatencyMs: opts.maxLatencyMs ?? 50,
  };
}

// ── genuine-device side (used by the demo to simulate a real target) ──────────

export function deviceSignEd25519(challenge: WitnessChallenge, privateKey: KeyObject): string {
  return sign(null, Buffer.from(challenge.nonceHex, "hex"), privateKey).toString("hex");
}

export function deviceMacAscon(challenge: WitnessChallenge, sharedKeyHex: string): string {
  // Stand-in for ASCON-MAC; semantics identical: keyed tag over the nonce.
  return createHmac("sha256", Buffer.from(sharedKeyHex, "hex")).update(Buffer.from(challenge.nonceHex, "hex")).digest("hex");
}

export function deviceEchoTiming(challenge: WitnessChallenge): string {
  return challenge.nonceHex; // genuine device proves it received THIS live nonce
}

// ── Sentinel-side verification ────────────────────────────────────────────────

function hexEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/**
 * Verify a device's response to a challenge. `consumed` is the single-use nonce
 * ledger — a replayed proof (even a bit-perfect captured one) is rejected because
 * its nonce was either never issued, already burned, or simply not THIS challenge.
 */
export function verifyResponse(
  challenge: WitnessChallenge,
  response: DeviceResponse,
  ctx: VerifyContext,
  consumed: Set<string>,
  tick: number,
): WitnessVerdict {
  if (tick > challenge.expiresAtTick) return { verified: false, code: "EXPIRED", reason: "challenge expired" };
  if (response.nonceHex !== challenge.nonceHex)
    return { verified: false, code: "NONCE_MISMATCH", reason: "response answers a different (likely captured) nonce" };
  if (consumed.has(challenge.nonceHex))
    return { verified: false, code: "REPLAY", reason: "nonce already consumed — replayed response" };

  const nonceBuf = Buffer.from(challenge.nonceHex, "hex");

  if (challenge.method === "ed25519") {
    if (!ctx.deviceAnchorPubPem) return { verified: false, code: "UNSUPPORTED", reason: "no device anchor pinned" };
    let ok = false;
    try {
      ok = verify(null, nonceBuf, createPublicKey(ctx.deviceAnchorPubPem), Buffer.from(response.payloadHex, "hex"));
    } catch {
      ok = false;
    }
    if (!ok) return { verified: false, code: "BAD_RESPONSE", reason: "signature does not prove key possession" };
  } else if (challenge.method === "ascon-mac") {
    if (!ctx.sharedKeyHex) return { verified: false, code: "UNSUPPORTED", reason: "no shared key provisioned" };
    if (!hexEq(response.payloadHex, deviceMacAscon(challenge, ctx.sharedKeyHex)))
      return { verified: false, code: "BAD_RESPONSE", reason: "MAC mismatch" };
  } else if (challenge.method === "timing") {
    if (response.payloadHex !== challenge.nonceHex)
      return { verified: false, code: "BAD_RESPONSE", reason: "echo did not match the live nonce" };
    if (response.latencyMs > challenge.maxLatencyMs)
      return { verified: false, code: "TOO_SLOW", reason: `latency ${response.latencyMs}ms > ${challenge.maxLatencyMs}ms (relay/replay)`, latencyMs: response.latencyMs };
  } else {
    return { verified: false, code: "UNSUPPORTED", reason: "unknown method" };
  }

  consumed.add(challenge.nonceHex); // burn the nonce: this exchange can never repeat
  return { verified: true, code: "VERIFIED", reason: "live protocol-state proof accepted", latencyMs: response.latencyMs };
}
