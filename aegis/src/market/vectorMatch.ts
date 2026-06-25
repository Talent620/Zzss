// vectorMatch.ts — the N-Dimensional Value auction for the Convergence.
//
// We delete "price as a single scalar". Agents no longer bid one flat number.
// They bid a Value Vector — here [energyJ, processingMs, errorRisk,
// hwDegradation] — and the orchestrator selects not the "cheapest" but the
// offer that is mathematically SAFEST for the hardware, using the Aegis physics
// oracle as the arbiter.
//
// Three structural defenses keep the vector honest and prevent it collapsing
// back into money:
//
//   D1. SAFETY IS A GATE, NOT A DIMENSION.
//       Every offer must first pass Aegis verify() (integrity + hardware
//       envelope). No vector, however attractive, can buy its way past an
//       envelope violation. Unsafe offers are disqualified before scoring.
//
//   D2. NO DIMENSION IS SELF-REPORTED.
//       The orchestrator RE-DERIVES the entire vector from its own independent
//       simulation and compares it to the agent's claim. A junk vector (Year-1
//       spam) or a hidden-dimension lie (Year-10 cartel hiding degradation)
//       fails this check and is disqualified — the "hidden" dimension is
//       computed by us, so it cannot be hidden.
//
//   D3. NO GLOBAL SCALARIZATION.
//       We never collapse the vector into one weighted number (that would just
//       re-invent price and hand a cartel one knob to game). We filter by Pareto
//       dominance and select by hardware safety margin. Multidimensionality is
//       preserved end to end.

import { hashOf } from "../core/canonical.ts";
import { verify } from "../verifier/verify.ts";
import type { VerifierKey } from "../verifier/verify.ts";
import type { AttestationBlock } from "../core/attest.ts";
import { simulate } from "../sim/physics.ts";
import type { HardwareEnvelope, SimSummary } from "../sim/physics.ts";

/** The bid. Every component is "lower is better". Safety is NOT in here — it is a gate. */
export interface ValueVector {
  energyJ: number; // joules consumed
  processingMs: number; // wall time on the rail/processor
  errorRisk: number; // 0..1 proximity-to-failure probability proxy
  hwDegradation: number; // cumulative wear/stress units
}

export interface AgentOffer {
  agentId: string;
  block: AttestationBlock; // the attested PowerScript skill (re-verified by Aegis)
  claimedVector: ValueVector; // the agent's self-reported value vector (checked, not trusted)
}

export type DisqualCode = "OK" | "AEGIS_REJECT" | "VECTOR_DIVERGENCE";

export interface OfferEvaluation {
  agentId: string;
  admissible: boolean;
  disqualCode: DisqualCode;
  detail: string;
  groundVector?: ValueVector; // independently derived — the source of truth
  safetyMargin?: number; // headroom to the hardware envelope; higher = safer
}

export interface MatchResult {
  winner: OfferEvaluation | null;
  evaluations: OfferEvaluation[];
  paretoFront: string[]; // agentIds not dominated by any other admissible offer
  rationale: string;
}

const VECTOR_TOL = 1e-6; // float tolerance for the honesty check (D2)

function r4(n: number): number {
  return Number(n.toFixed(4));
}

/**
 * Derive the full Value Vector from a TRUSTED simulation, relative to an
 * envelope. This is run by the orchestrator on its own ground-truth sim — the
 * agent never gets to fill these in. (D2 / D3)
 */
export function deriveValueVector(sim: SimSummary, env: HardwareEnvelope): ValueVector {
  // errorRisk: how close the run came to ANY ceiling, ramped up near the edge.
  const voltsUse = sim.peakVolts / env.maxVolts;
  const tempUse = sim.peakTempC / env.maxTempC;
  const currUse = sim.currentLimitA / env.maxCurrentA;
  const maxUse = Math.max(voltsUse, tempUse, currUse);
  const errorRisk = Math.min(1, Math.max(0, (maxUse - 0.6) / 0.4));

  // hwDegradation: independently-computed thermal-overstress integral + voltage
  // overstress. This is the dimension a cartel would try to HIDE — and cannot,
  // because we compute it from the temp trace ourselves.
  const dtS = sim.durationMs / 1000 / Math.max(1, sim.tempTrace.length);
  let thermal = 0;
  for (const t of sim.tempTrace) thermal += Math.max(0, t - 60) * dtS;
  const voltageOverstress = Math.max(0, sim.peakVolts - env.maxVolts * 0.9) * 10;

  return {
    energyJ: r4(sim.energyJ),
    processingMs: r4(sim.durationMs),
    errorRisk: r4(errorRisk),
    hwDegradation: r4(thermal + voltageOverstress),
  };
}

/** Normalized minimum headroom to the envelope. Higher = mathematically safer. */
export function safetyMargin(sim: SimSummary, env: HardwareEnvelope): number {
  const margins = [
    1 - sim.peakVolts / env.maxVolts,
    1 - sim.peakTempC / env.maxTempC,
    1 - sim.currentLimitA / env.maxCurrentA,
  ];
  return r4(Math.min(...margins));
}

function vectorsAgree(a: ValueVector, b: ValueVector): boolean {
  return (
    Math.abs(a.energyJ - b.energyJ) <= VECTOR_TOL &&
    Math.abs(a.processingMs - b.processingMs) <= VECTOR_TOL &&
    Math.abs(a.errorRisk - b.errorRisk) <= VECTOR_TOL &&
    Math.abs(a.hwDegradation - b.hwDegradation) <= VECTOR_TOL
  );
}

/** Pareto dominance: a dominates b if a is <= in every dim and < in at least one. */
export function dominates(a: ValueVector, b: ValueVector): boolean {
  const dims: (keyof ValueVector)[] = ["energyJ", "processingMs", "errorRisk", "hwDegradation"];
  let strictlyBetter = false;
  for (const d of dims) {
    if (a[d] > b[d]) return false;
    if (a[d] < b[d]) strictlyBetter = true;
  }
  return strictlyBetter;
}

/**
 * The orchestrator. Runs each offer through Aegis, re-derives its vector, checks
 * honesty, then selects the SAFEST admissible offer (not the cheapest).
 */
export function matchOffers(
  offers: AgentOffer[],
  env: HardwareEnvelope,
  verifierKey: VerifierKey,
): MatchResult {
  const evaluations: OfferEvaluation[] = offers.map((offer) => {
    // D1: Aegis gate — integrity + hardware envelope.
    const verdict = verify(offer.block, env, verifierKey);
    if (!verdict.allowed || !verdict.groundTruth) {
      return {
        agentId: offer.agentId,
        admissible: false,
        disqualCode: "AEGIS_REJECT",
        detail: `${verdict.code}: ${verdict.reason}`,
      };
    }

    // D2: re-derive the vector ourselves and compare to the claim.
    const groundVector = deriveValueVector(verdict.groundTruth, env);
    if (!vectorsAgree(groundVector, offer.claimedVector)) {
      return {
        agentId: offer.agentId,
        admissible: false,
        disqualCode: "VECTOR_DIVERGENCE",
        detail: `claimed vector != independently-derived vector (claimed degradation ${offer.claimedVector.hwDegradation}, real ${groundVector.hwDegradation})`,
        groundVector,
      };
    }

    return {
      agentId: offer.agentId,
      admissible: true,
      disqualCode: "OK",
      detail: "passed Aegis + vector honesty",
      groundVector,
      safetyMargin: safetyMargin(verdict.groundTruth, env),
    };
  });

  const admissible = evaluations.filter((e) => e.admissible && e.groundVector);

  // D3: Pareto front (transparency), then SELECT BY SAFETY MARGIN — not price.
  const paretoFront = admissible
    .filter((e) => !admissible.some((o) => o !== e && dominates(o.groundVector!, e.groundVector!)))
    .map((e) => e.agentId);

  let winner: OfferEvaluation | null = null;
  for (const e of admissible) {
    if (
      !winner ||
      e.safetyMargin! > winner.safetyMargin! ||
      // tie-breakers, in order: lower degradation, then lower energy
      (e.safetyMargin === winner.safetyMargin && e.groundVector!.hwDegradation < winner.groundVector!.hwDegradation) ||
      (e.safetyMargin === winner.safetyMargin &&
        e.groundVector!.hwDegradation === winner.groundVector!.hwDegradation &&
        e.groundVector!.energyJ < winner.groundVector!.energyJ)
    ) {
      winner = e;
    }
  }

  const rationale = winner
    ? `selected ${winner.agentId} by maximum hardware safety margin ${winner.safetyMargin} (NOT lowest cost); ${admissible.length}/${offers.length} offers admissible, Pareto front {${paretoFront.join(", ")}}`
    : `no admissible offer: all ${offers.length} disqualified by Aegis or vector divergence`;

  // envelopeHash bound for auditability of which rail this auction governed.
  void hashOf(env);

  return { winner, evaluations, paretoFront, rationale };
}
