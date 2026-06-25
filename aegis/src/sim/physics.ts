// physics.ts — the trusted ground-truth oracle.
//
// Zero-Trust crux #2: the verifier NEVER believes the agent's prediction of
// what its script will do. It re-derives the physical outcome itself, here,
// with this small deterministic model that the agent does not control. The
// agent's attested results are only ever *compared* against this output.
//
// In a real deployment this is replaced by a higher-fidelity device model (or
// a hardware-in-the-loop rig), but the contract is identical: a fixed, audited
// function from PowerScript -> physical trace, independent of the agent.

import type { PowerScript } from "./powerscript.ts";

export interface HardwareEnvelope {
  maxVolts: number; // absolute do-not-exceed rail voltage
  maxTempC: number; // absolute do-not-exceed junction temp
  maxCurrentA: number; // absolute current-limit ceiling
  rail: string; // which rail this envelope governs
}

export interface SimSummary {
  samples: number;
  durationMs: number;
  peakVolts: number;
  finalVolts: number;
  peakTempC: number;
  currentLimitA: number;
  energyJ: number; // integral of V*I over the run — a trusted physical cost dimension
  trace: number[]; // voltage samples — makes the result hash sensitive to any divergence
  tempTrace: number[]; // junction-temp samples — lets the orchestrator compute hidden stress itself
}

const DT_MS = 10;
const DT_S = DT_MS / 1000;
const AMBIENT_C = 25;

function r4(n: number): number {
  return Number(n.toFixed(4));
}

/** Deterministic forward simulation of a PowerScript on a rail. */
export function simulate(script: PowerScript): SimSummary {
  let v = 0;
  let temp = AMBIENT_C;
  let currentLimit = 1; // amps, until the script sets it
  let energyJ = 0;
  const trace: number[] = [];
  const tempTrace: number[] = [];

  const step = (volts: number) => {
    v = volts;
    // crude electrothermal proxy: dissipation ~ V * I, with first-order cooling.
    const power = Math.max(0, v) * currentLimit;
    energyJ += power * DT_S;
    temp += power * 0.012 - (temp - AMBIENT_C) * 0.05;
    trace.push(r4(v));
    tempTrace.push(r4(temp));
  };

  for (const op of script.ops) {
    switch (op.op) {
      case "SET_CURRENT_LIMIT":
        currentLimit = op.amps;
        break;
      case "SET_VOLTAGE":
        step(op.volts);
        break;
      case "RAMP": {
        const steps = Math.max(1, Math.ceil(op.ms / DT_MS));
        const start = v;
        for (let i = 1; i <= steps; i++) step(start + ((op.toVolts - start) * i) / steps);
        break;
      }
      case "HOLD": {
        const steps = Math.max(1, Math.ceil(op.ms / DT_MS));
        for (let i = 0; i < steps; i++) step(v);
        break;
      }
    }
  }

  const peakVolts = trace.length ? Math.max(...trace) : 0;
  const peakTempC = tempTrace.length ? Math.max(...tempTrace) : AMBIENT_C;
  return {
    samples: trace.length,
    durationMs: trace.length * DT_MS,
    peakVolts: r4(peakVolts),
    finalVolts: r4(v),
    peakTempC: r4(peakTempC),
    currentLimitA: r4(currentLimit),
    energyJ: r4(energyJ),
    trace,
    tempTrace,
  };
}
