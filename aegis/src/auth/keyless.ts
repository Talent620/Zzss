// keyless.ts — Authorization as a Verb. The Keyless Bridge.
//
// We delete the Shared Secret: no passwords, no API keys, no bearer tokens, no
// sessions. Nothing static exists to steal. Identity is not something you *have*
// (a key on a server) — it is something you *prove*, freshly, for one physical
// operation, in the instant you ask to perform it.
//
// Two roles:
//   • TeeSigner          — the client. Holds a hardware-bound, NON-EXTRACTABLE
//                          private key (Android Keystore / StrongBox / TEE). It
//                          never reveals the key; it only ever *signs*.
//   • ContinuousAuthority — the orchestrator (Jarvis). Stores ONLY public anchors.
//                          It has no secret about any client. To authorize an op
//                          it issues a fresh challenge bound to that exact op and
//                          demands a signature proving live possession of the key.
//
// Authorization granted this way is good for exactly ONE operation and expires
// immediately. There is no "logged-in" state to hijack.

import { sign, verify, createPublicKey, randomBytes } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { hashOf, canonicalize } from "../core/canonical.ts";

/** What binds a proof to a single physical operation (the Aegis op identity). */
export interface OperationContext {
  deviceTarget: string; // rail/device the op drives
  codeHash: string; // hash of the exact PowerScript (from the ExecutionToken)
  envelopeHash: string; // hash of the hardware envelope (from the ExecutionToken)
}

export function contextHashOf(ctx: OperationContext): string {
  return hashOf(ctx);
}

/** The only thing the authority stores about a client. Entirely public. */
export interface PublicAnchor {
  subjectId: string;
  publicKeyPem: string;
}

/** Issued fresh, per operation. Single-use, short-lived, context-bound. */
export interface Challenge {
  verifierId: string;
  subjectId: string;
  nonceHex: string; // 256-bit random; single-use
  counter: number; // per-subject monotonic; rejects reorder/replay
  contextHash: string; // ties this challenge to ONE physical operation
  issuedAtTick: number;
  expiresAtTick: number;
}

/** The fresh_challenge_response that replaces the classic password. */
export interface ChallengeResponse {
  challenge: Challenge;
  proofHex: string; // ed25519 over canonicalize(challenge), by the TEE key
  publicKeyPem: string; // the responder's public key (matched against the anchor)
}

export type AuthCode =
  | "AUTHORIZED"
  | "NO_ANCHOR"
  | "ANCHOR_MISMATCH"
  | "WRONG_VERIFIER"
  | "EXPIRED"
  | "REPLAY"
  | "STALE_COUNTER"
  | "CONTEXT_MISMATCH"
  | "BAD_PROOF";

export interface AuthResult {
  authorized: boolean;
  code: AuthCode;
  reason: string;
}

// ── client side ──────────────────────────────────────────────────────────────

/**
 * Abstraction over the hardware secure element. The PRODUCTION implementation is
 * backed by Android Keystore (StrongBox/TEE) with a non-extractable key; the JS
 * never sees private bytes — it calls a native sign(). This software stand-in has
 * the identical interface so the app swaps it for the TEE with no logic change.
 */
export interface TeeSigner {
  subjectId: string;
  publicAnchor(): PublicAnchor;
  /** Sign a per-operation challenge. The ONLY thing the key ever does. */
  signOperationProof(challenge: Challenge): string;
}

export class SoftwareTeeSigner implements TeeSigner {
  subjectId: string;
  private privateKey: KeyObject;
  private publicKeyPem: string;

  constructor(subjectId: string, privateKey: KeyObject, publicKeyPem: string) {
    this.subjectId = subjectId;
    this.privateKey = privateKey;
    this.publicKeyPem = publicKeyPem;
  }

  publicAnchor(): PublicAnchor {
    return { subjectId: this.subjectId, publicKeyPem: this.publicKeyPem };
  }

  signOperationProof(challenge: Challenge): string {
    return sign(null, Buffer.from(canonicalize(challenge)), this.privateKey).toString("hex");
  }
}

/** Client builds the fresh_challenge_response for a challenge it was handed. */
export function proveContext(signer: TeeSigner, challenge: Challenge): ChallengeResponse {
  return {
    challenge,
    proofHex: signer.signOperationProof(challenge),
    publicKeyPem: signer.publicAnchor().publicKeyPem,
  };
}

// ── orchestrator side ────────────────────────────────────────────────────────

/**
 * Holds only PUBLIC anchors. Dumping its entire state reveals no secret and grants
 * no access. It authorizes operations one at a time, never issuing a session.
 */
export class ContinuousAuthority {
  verifierId: string;
  private anchors = new Map<string, string>(); // subjectId -> publicKeyPem (PUBLIC)
  private counters = new Map<string, number>(); // subjectId -> next expected counter
  private consumedNonces = new Set<string>(); // single-use nonce ledger

  constructor(verifierId: string) {
    this.verifierId = verifierId;
  }

  registerAnchor(anchor: PublicAnchor): void {
    this.anchors.set(anchor.subjectId, anchor.publicKeyPem);
    if (!this.counters.has(anchor.subjectId)) this.counters.set(anchor.subjectId, 0);
  }

  /** What an attacker would steal: all public, all useless on its own. */
  exportState() {
    return {
      verifierId: this.verifierId,
      anchors: Object.fromEntries(this.anchors), // public keys only
      counters: Object.fromEntries(this.counters),
      note: "no private keys, no passwords, no session tokens are stored here",
    };
  }

  issueChallenge(subjectId: string, ctx: OperationContext, tick: number, ttlTicks = 5): Challenge {
    if (!this.anchors.has(subjectId)) throw new Error(`no anchor for ${subjectId}`);
    return {
      verifierId: this.verifierId,
      subjectId,
      nonceHex: randomBytes(32).toString("hex"),
      counter: this.counters.get(subjectId) ?? 0,
      contextHash: contextHashOf(ctx),
      issuedAtTick: tick,
      expiresAtTick: tick + ttlTicks,
    };
  }

  /** Verify a fresh_challenge_response against the EXACT operation it must authorize. */
  verifyResponse(resp: ChallengeResponse, expectedCtx: OperationContext, tick: number): AuthResult {
    const c = resp.challenge;
    const anchorPem = this.anchors.get(c.subjectId);
    if (!anchorPem) return { authorized: false, code: "NO_ANCHOR", reason: `unknown subject ${c.subjectId}` };
    if (resp.publicKeyPem !== anchorPem)
      return { authorized: false, code: "ANCHOR_MISMATCH", reason: "responder key != pinned anchor" };
    if (c.verifierId !== this.verifierId)
      return { authorized: false, code: "WRONG_VERIFIER", reason: "challenge not issued by this authority" };
    if (tick > c.expiresAtTick) return { authorized: false, code: "EXPIRED", reason: "challenge expired" };
    if (this.consumedNonces.has(c.nonceHex))
      return { authorized: false, code: "REPLAY", reason: "nonce already used (replayed proof)" };
    const expectedCounter = this.counters.get(c.subjectId) ?? 0;
    if (c.counter !== expectedCounter)
      return { authorized: false, code: "STALE_COUNTER", reason: `counter ${c.counter} != expected ${expectedCounter}` };
    if (c.contextHash !== contextHashOf(expectedCtx))
      return { authorized: false, code: "CONTEXT_MISMATCH", reason: "proof is for a different operation" };

    let sigOk = false;
    try {
      sigOk = verify(null, Buffer.from(canonicalize(c)), createPublicKey(resp.publicKeyPem), Buffer.from(resp.proofHex, "hex"));
    } catch {
      sigOk = false;
    }
    if (!sigOk) return { authorized: false, code: "BAD_PROOF", reason: "signature does not prove key possession" };

    // Success consumes the nonce and advances the counter — this proof can never
    // be used again, for anything.
    this.consumedNonces.add(c.nonceHex);
    this.counters.set(c.subjectId, expectedCounter + 1);
    return { authorized: true, code: "AUTHORIZED", reason: "live key possession proven for this exact operation" };
  }
}
