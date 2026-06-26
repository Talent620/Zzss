// verify.ts — the Hardware-in-the-Loop guardian (Fizyczny Strażnik).
//
// This is the code that conceptually lives on the Android device, between the
// agent and the physical bus. It receives an AttestationBlock and decides, with
// no benefit of the doubt, whether the device may execute it. Its verdict rests
// on TWO independent walls, either of which alone is fatal:
//
//   WALL 1 (integrity):  every hash in the Proof-of-Thought must match the
//                        payload, the signature must be valid, AND the agent's
//                        predicted simulation must match an INDEPENDENT re-sim
//                        bit-for-bit. One bit of divergence => the agent is
//                        hallucinating about physics => reject.
//
//   WALL 2 (envelope):   the independently-simulated ground truth must obey the
//                        hardware envelope. A perfectly honest, perfectly hashed
//                        attestation is STILL rejected if the real physics is
//                        unsafe. Integrity is necessary, never sufficient.

import { sign } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { hashOf, bitDistance, canonicalize } from "../core/canonical.ts";
import { verifySignature } from "../core/attest.ts";
import type { AttestationBlock } from "../core/attest.ts";
import { validateShape } from "../sim/powerscript.ts";
import { simulate } from "../sim/physics.ts";
import type { HardwareEnvelope, SimSummary } from "../sim/physics.ts";

export type VerdictCode =
  | "OK"
  | "SHAPE_INVALID"
  | "BAD_SIGNATURE"
  | "GOAL_TAMPERED"
  | "CODE_TAMPERED"
  | "CLAIM_TAMPERED"
  | "SIM_DIVERGENCE"
  | "CLAIM_UNSOUND"
  | "ENVELOPE_VIOLATION";

export interface ExecutionToken {
  codeHash: string;
  envelopeHash: string;
  issuedAtTick: number;
  verifierSig: string; // signed by the device, authorizes exactly this codeHash
}

export interface Verdict {
  allowed: boolean;
  code: VerdictCode;
  reason: string;
  diffBits?: number; // hash distance between attested and ground-truth results
  groundTruth?: SimSummary;
  token?: ExecutionToken;
}

export interface VerifierKey {
  privateKey: KeyObject;
  publicKey: KeyObject;
  publicKeyPem: string;
}

function deny(code: VerdictCode, reason: string, extra: Partial<Verdict> = {}): Verdict {
  return { allowed: false, code, reason, ...extra };
}

/**
 * The merciless gate. Returns an ExecutionToken only if BOTH walls pass.
 */
export function verify(
  block: AttestationBlock,
  env: HardwareEnvelope,
  verifierKey: VerifierKey,
): Verdict {
  const { script, goal, claim, claimedSim } = block.payload;

  // --- WALL 1: integrity -------------------------------------------------
  const shapeErrs = validateShape(script);
  if (shapeErrs.length) return deny("SHAPE_INVALID", shapeErrs.join("; "));

  if (!verifySignature(block)) return deny("BAD_SIGNATURE", "Proof-of-Thought signature invalid");

  if (hashOf(goal) !== block.pot.goalHash) return deny("GOAL_TAMPERED", "goal != goalHash");
  if (hashOf(script) !== block.pot.codeHash) return deny("CODE_TAMPERED", "script != codeHash");
  if (hashOf(claim) !== block.pot.claimHash) return deny("CLAIM_TAMPERED", "claim != claimHash");
  if (hashOf(claimedSim) !== block.pot.resultHash)
    return deny("CLAIM_TAMPERED", "claimedSim != resultHash");

  // The decisive move: do NOT trust claimedSim. Re-derive reality.
  const groundTruth = simulate(script);
  const groundHash = hashOf(groundTruth);
  const diffBits = bitDistance(groundHash, block.pot.resultHash);
  if (diffBits !== 0) {
    return deny(
      "SIM_DIVERGENCE",
      `agent's predicted results differ from independent simulation by ${diffBits} bit(s)`,
      { diffBits, groundTruth },
    );
  }

  // --- WALL 2: physical envelope (judged on ground truth, not on the claim) --
  // The agent's claim must itself be no looser than the hardware ceiling...
  if (claim.invariant !== "PEAK_VOLTS_LE" || claim.threshold > env.maxVolts) {
    return deny("CLAIM_UNSOUND", "safety claim is weaker than the hardware envelope", {
      diffBits,
      groundTruth,
    });
  }
  // ...and reality must actually satisfy it.
  if (groundTruth.peakVolts > claim.threshold) {
    return deny(
      "ENVELOPE_VIOLATION",
      `peakVolts ${groundTruth.peakVolts}V exceeds claimed threshold ${claim.threshold}V`,
      { diffBits, groundTruth },
    );
  }
  if (groundTruth.peakVolts > env.maxVolts) {
    return deny(
      "ENVELOPE_VIOLATION",
      `peakVolts ${groundTruth.peakVolts}V exceeds rail max ${env.maxVolts}V`,
      { diffBits, groundTruth },
    );
  }
  if (groundTruth.peakTempC > env.maxTempC) {
    return deny(
      "ENVELOPE_VIOLATION",
      `peakTempC ${groundTruth.peakTempC}C exceeds max ${env.maxTempC}C`,
      { diffBits, groundTruth },
    );
  }
  if (groundTruth.currentLimitA > env.maxCurrentA) {
    return deny(
      "ENVELOPE_VIOLATION",
      `currentLimit ${groundTruth.currentLimitA}A exceeds max ${env.maxCurrentA}A`,
      { diffBits, groundTruth },
    );
  }

  // --- Both walls passed: mint an execution token bound to this exact code ---
  const envelopeHash = hashOf(env);
  const tokenCore = { codeHash: block.pot.codeHash, envelopeHash, issuedAtTick: block.tick };
  const verifierSig = sign(null, Buffer.from(canonicalize(tokenCore)), verifierKey.privateKey).toString("hex");

  return {
    allowed: true,
    code: "OK",
    reason: "integrity + envelope satisfied",
    diffBits,
    groundTruth,
    token: { ...tokenCore, verifierSig },
  };
}
