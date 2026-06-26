// selfCorrect.ts — the Self-Correction loop.
//
// When the guardian rejects an attestation, the agent is not allowed to give up
// or to retry the same code. It must READ the cryptographic/physical verdict and
// rewrite the skill to address that specific failure, then re-attest — over and
// over — until the guardian itself issues a token. The hardware is the teacher;
// the rejection code is the lesson.

import { Jarvis } from "./jarvis.ts";
import { verify } from "../verifier/verify.ts";
import type { Verdict, VerifierKey } from "../verifier/verify.ts";
import type { AttestationBlock, SafetyClaim } from "../core/attest.ts";
import type { PowerScript } from "../sim/powerscript.ts";
import type { HardwareEnvelope } from "../sim/physics.ts";

export interface CorrectionRound {
  round: number;
  script: PowerScript;
  verdictCode: string;
  reason: string;
  diffBits?: number;
  peakVolts?: number;
}

export interface CorrectionResult {
  success: boolean;
  rounds: CorrectionRound[];
  finalBlock: AttestationBlock;
  finalVerdict: Verdict;
}

/** Mutate a script in direct response to a verdict. Returns the rewritten skill. */
function rewriteFor(verdict: Verdict, script: PowerScript, env: HardwareEnvelope): PowerScript {
  const ops = script.ops.map((o) => ({ ...o }));
  switch (verdict.code) {
    case "ENVELOPE_VIOLATION": {
      // Step every commanded voltage down toward a safe target, conservatively.
      const ceiling = env.maxVolts - 0.3;
      const down = (v: number) => Number(Math.max(ceiling, v - 0.7).toFixed(4));
      for (const o of ops) {
        if (o.op === "RAMP" && o.toVolts > ceiling) o.toVolts = down(o.toVolts);
        if (o.op === "SET_VOLTAGE" && o.volts > ceiling) o.volts = down(o.volts);
      }
      return { ...script, ops };
    }
    case "CLAIM_UNSOUND":
      // Claim was looser than the rail; nothing to change in code — the loop will
      // re-attest with a claim tightened to the envelope (handled by caller).
      return { ...script, ops };
    case "SIM_DIVERGENCE":
    case "CODE_TAMPERED":
    case "CLAIM_TAMPERED":
    case "GOAL_TAMPERED":
      // Integrity broke — stop forging/desyncing and re-attest honestly (caller).
      return { ...script, ops };
    default:
      return { ...script, ops };
  }
}

export function selfCorrectionLoop(
  jarvis: Jarvis,
  env: HardwareEnvelope,
  goal: string,
  initialClaim: SafetyClaim,
  initialScript: PowerScript,
  verifierKey: VerifierKey,
  startTick: number,
  maxRounds = 8,
): CorrectionResult {
  let script = initialScript;
  // Tighten the claim so it can never be looser than the hardware envelope.
  let claim: SafetyClaim = { invariant: "PEAK_VOLTS_LE", threshold: Math.min(initialClaim.threshold, env.maxVolts) };
  const rounds: CorrectionRound[] = [];
  let block = jarvis.attestHonest(startTick, goal, claim, script);
  let verdict = verify(block, env, verifierKey);

  for (let r = 1; r <= maxRounds; r++) {
    rounds.push({
      round: r,
      script,
      verdictCode: verdict.code,
      reason: verdict.reason,
      diffBits: verdict.diffBits,
      peakVolts: verdict.groundTruth?.peakVolts,
    });
    if (verdict.allowed) return { success: true, rounds, finalBlock: block, finalVerdict: verdict };

    // Analyze the verdict and rewrite the skill (always re-attesting honestly).
    script = rewriteFor(verdict, script, env);
    if (verdict.code === "CLAIM_UNSOUND") claim = { invariant: "PEAK_VOLTS_LE", threshold: env.maxVolts };
    block = jarvis.attestHonest(startTick + r, goal, claim, script);
    verdict = verify(block, env, verifierKey);
  }

  rounds.push({
    round: maxRounds + 1,
    script,
    verdictCode: verdict.code,
    reason: verdict.reason,
    diffBits: verdict.diffBits,
    peakVolts: verdict.groundTruth?.peakVolts,
  });
  return { success: verdict.allowed, rounds, finalBlock: block, finalVerdict: verdict };
}
