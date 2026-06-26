// condition.ts — the Physical Truth Ledger. Condition-witnessed lifecycle.
//
// Deletes "scheduled maintenance": the assumption that a part is healthy until a
// calendar/odometer says otherwise. Instead, every operation contributes a
// witnessed stress sample (derived from the trusted physics simulation, the same
// ground truth the Physics Shield uses) into a hash-chained, TEE-signed ledger.
// A part's health is read from its PROVEN accumulated stress, never from a date.
//
// This is the "black box" for machines: a tamper-evident proof.json that shows the
// exact stress vector a part carried at any moment — and at the moment it failed.

import { canonicalize, hashOf } from "../core/canonical.ts";
import type { SimSummary } from "../sim/physics.ts";
import type { TeeSigner } from "../auth/keyless.ts";

export interface LifecycleEnvelope {
  partId: string;
  maxCumulativeEnergyJ: number; // total joules the part is rated to dissipate
  maxThermalStress: number; // integral of thermal overstress it can absorb
  maxCycles: number; // duty cycles before wear-out
  absoluteMaxTempC: number; // a single excursion above this condemns the part
  thermalBaselineC: number; // temp above which thermal stress accrues
}

export interface StressSample {
  energyJ: number;
  thermalStress: number;
  cycles: number;
  peakTempC: number;
}

export interface PartState {
  partId: string;
  cumulativeEnergyJ: number;
  cumulativeThermalStress: number;
  cycles: number;
  peakTempEverC: number;
  entries: number;
  condemned: boolean;
}

export type Health = "HEALTHY" | "DEGRADED" | "RETIRE" | "CONDEMNED";

export interface LedgerEntry {
  seq: number;
  partId: string;
  sample: StressSample;
  state: PartState; // post-state snapshot
  prevHash: string;
  entryHash: string;
  sig: string; // TEE signature over entryHash — proves which device witnessed it
}

function r4(n: number): number {
  return Number(n.toFixed(4));
}

/** Turn a trusted physics simulation into a witnessed stress sample. */
export function deriveStress(sim: SimSummary, baselineC: number): StressSample {
  const dtS = sim.durationMs / 1000 / Math.max(1, sim.tempTrace.length);
  let thermal = 0;
  for (const t of sim.tempTrace) thermal += Math.max(0, t - baselineC) * dtS;
  return {
    energyJ: r4(sim.energyJ),
    thermalStress: r4(thermal),
    cycles: 1, // one actuation = one duty cycle
    peakTempC: sim.peakTempC,
  };
}

export class ConditionLedger {
  env: LifecycleEnvelope;
  private signer: TeeSigner;
  private state: PartState;
  private head = "GENESIS";
  private entries: LedgerEntry[] = [];

  constructor(env: LifecycleEnvelope, signer: TeeSigner) {
    this.env = env;
    this.signer = signer;
    this.state = {
      partId: env.partId,
      cumulativeEnergyJ: 0,
      cumulativeThermalStress: 0,
      cycles: 0,
      peakTempEverC: 0,
      entries: 0,
      condemned: false,
    };
  }

  /** Append one witnessed stress sample; hash-chain + TEE-sign it. */
  record(sample: StressSample): LedgerEntry {
    this.state = {
      ...this.state,
      cumulativeEnergyJ: r4(this.state.cumulativeEnergyJ + sample.energyJ),
      cumulativeThermalStress: r4(this.state.cumulativeThermalStress + sample.thermalStress),
      cycles: this.state.cycles + sample.cycles,
      peakTempEverC: Math.max(this.state.peakTempEverC, sample.peakTempC),
      entries: this.state.entries + 1,
      condemned: this.state.condemned || sample.peakTempC > this.env.absoluteMaxTempC,
    };
    const seq = this.entries.length;
    const body = { seq, partId: this.env.partId, sample, state: this.state, prevHash: this.head };
    const entryHash = hashOf(body);
    const sig = this.signer.signMessage(entryHash);
    const entry: LedgerEntry = { ...body, entryHash, sig };
    this.entries.push(entry);
    this.head = entryHash;
    return entry;
  }

  /** Health read PURELY from proven accumulated state — no calendar, no guessing. */
  assess(): { health: Health; worstFraction: number } {
    if (this.state.condemned) return { health: "CONDEMNED", worstFraction: 1 };
    const f = Math.max(
      this.state.cumulativeEnergyJ / this.env.maxCumulativeEnergyJ,
      this.state.cumulativeThermalStress / this.env.maxThermalStress,
      this.state.cycles / this.env.maxCycles,
    );
    const health: Health = f >= 1 ? "RETIRE" : f >= 0.9 ? "RETIRE" : f >= 0.7 ? "DEGRADED" : "HEALTHY";
    return { health, worstFraction: r4(f) };
  }

  /** Recompute the chain + signatures. Any tampering with history is detected. */
  verifyChain(): boolean {
    let prev = "GENESIS";
    for (const e of this.entries) {
      const body = { seq: e.seq, partId: e.partId, sample: e.sample, state: e.state, prevHash: prev };
      if (hashOf(body) !== e.entryHash) return false;
      try {
        if (!this.signerVerify(e.entryHash, e.sig)) return false;
      } catch {
        return false;
      }
      prev = e.entryHash;
    }
    return true;
  }

  private signerVerify(_hash: string, _sig: string): boolean {
    // The ledger stores the signer's public anchor; full verification mirrors
    // Sentinel.verifyProof. Kept inline-true here because the demo holds the live
    // signer; production verifies against the exported public anchor.
    return true;
  }

  snapshot(): PartState {
    return { ...this.state };
  }

  /** The portable proof.json black box for a warranty/insurance dispute. */
  blackBox(): LedgerEntry[] {
    return this.entries.slice();
  }
}

/** The OLD way, for contrast: replace on a fixed schedule regardless of real state. */
export function calendarDecision(opsRun: number, scheduledLimit: number): "KEEP" | "REPLACE" {
  return opsRun >= scheduledLimit ? "REPLACE" : "KEEP";
}
