// verify.ts — the Physics Shield. The ONLY authority that can authorize a write
// to the data bus. Port of aegis/src/verifier/verify.ts, model-driven.
//
// Two walls, either fatal:
//   WALL 1 (integrity): signature valid, every payload hash matches its PoT hash,
//     and the agent's predicted sim matches an INDEPENDENT re-simulation
//     bit-for-bit. One bit of divergence => reject (the agent is hallucinating).
//   WALL 2 (envelope): the independently simulated ground truth must obey the
//     loaded device envelope. An honest, perfectly hashed attestation is STILL
//     rejected if the real physics is unsafe.
//
// There are no secrets and no network here — verification is a pure function of
// (attestation, model). That is what lets it run on-device, offline, every time.

import { hashOf, bitDistance } from "../core/canonical.ts";
import { verifySignature } from "../core/attest.ts";
import type { AttestationBlock } from "../core/attest.ts";
import { validateShape } from "../sim/powerscript.ts";
import type { Simulator, SimSummary } from "../sim/physics.ts";
import type { PhysicsModel } from "../plugins/schema.ts";

export type VerdictCode =
  | "OK"
  | "WRONG_DEVICE"
  | "SHAPE_INVALID"
  | "BAD_SIGNATURE"
  | "GOAL_TAMPERED"
  | "CODE_TAMPERED"
  | "CLAIM_TAMPERED"
  | "SIM_DIVERGENCE"
  | "CLAIM_UNSOUND"
  | "ENVELOPE_VIOLATION";

export interface Verdict {
  allowed: boolean;
  code: VerdictCode;
  reason: string;
  diffBits?: number;
  groundTruth?: SimSummary;
}

function deny(code: VerdictCode, reason: string, extra: Partial<Verdict> = {}): Verdict {
  return { allowed: false, code, reason, ...extra };
}

/** Pure verification against a loaded device model. No I/O. */
export function verify(block: AttestationBlock, model: PhysicsModel, simulate: Simulator): Verdict {
  const env = model.envelope;
  const { script, goal, claim, claimedSim } = block.payload;

  if (block.deviceId !== model.deviceId)
    return deny("WRONG_DEVICE", `attestation targets ${block.deviceId}, loaded model is ${model.deviceId}`);

  // WALL 1 — integrity
  const shapeErrs = validateShape(script, model.instructionSet);
  if (shapeErrs.length) return deny("SHAPE_INVALID", shapeErrs.join("; "));
  if (!verifySignature(block)) return deny("BAD_SIGNATURE", "Proof-of-Thought signature invalid");
  if (hashOf(goal) !== block.pot.goalHash) return deny("GOAL_TAMPERED", "goal != goalHash");
  if (hashOf(script) !== block.pot.codeHash) return deny("CODE_TAMPERED", "script != codeHash");
  if (hashOf(claim) !== block.pot.claimHash) return deny("CLAIM_TAMPERED", "claim != claimHash");
  if (hashOf(claimedSim) !== block.pot.resultHash)
    return deny("CLAIM_TAMPERED", "claimedSim != resultHash");

  const groundTruth = simulate(script); // re-derive reality, do not trust the agent
  const diffBits = bitDistance(hashOf(groundTruth), block.pot.resultHash);
  if (diffBits !== 0)
    return deny("SIM_DIVERGENCE", `predicted results differ from on-device simulation by ${diffBits} bit(s)`, {
      diffBits,
      groundTruth,
    });

  // WALL 2 — physical envelope, judged on ground truth
  if (claim.invariant !== "PEAK_VOLTS_LE" || claim.threshold > env.maxVolts)
    return deny("CLAIM_UNSOUND", "safety claim is weaker than the hardware envelope", { diffBits, groundTruth });
  if (groundTruth.peakVolts > claim.threshold)
    return deny("ENVELOPE_VIOLATION", `peakVolts ${groundTruth.peakVolts}V exceeds claimed ${claim.threshold}V`, {
      diffBits,
      groundTruth,
    });
  if (groundTruth.peakVolts > env.maxVolts)
    return deny("ENVELOPE_VIOLATION", `peakVolts ${groundTruth.peakVolts}V exceeds rail max ${env.maxVolts}V`, {
      diffBits,
      groundTruth,
    });
  if (groundTruth.peakTempC > env.maxTempC)
    return deny("ENVELOPE_VIOLATION", `peakTempC ${groundTruth.peakTempC}C exceeds max ${env.maxTempC}C`, {
      diffBits,
      groundTruth,
    });
  if (groundTruth.currentLimitA > env.maxCurrentA)
    return deny("ENVELOPE_VIOLATION", `current ${groundTruth.currentLimitA}A exceeds max ${env.maxCurrentA}A`, {
      diffBits,
      groundTruth,
    });

  return { allowed: true, code: "OK", reason: "integrity + envelope satisfied", diffBits, groundTruth };
}
