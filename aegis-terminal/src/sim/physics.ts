// physics.ts — the trusted ground-truth simulator, now MODEL-DRIVEN.
//
// On the desktop, the electrothermal coefficients were hardcoded. Here they come
// from the loaded PhysicsModel, so the same simulator serves a drone regulator or
// a battery spot-welder depending only on which physics_model.json is active.
// The Physics Shield re-runs THIS simulator and never trusts the agent's
// predicted results.

import type { PowerScript } from "./powerscript.ts";
import type { PhysicsModel } from "../plugins/schema.ts";

export interface SimSummary {
  samples: number;
  durationMs: number;
  peakVolts: number;
  finalVolts: number;
  peakTempC: number;
  currentLimitA: number;
  energyJ: number;
  trace: number[];
  tempTrace: number[];
}

function r4(n: number): number {
  return Number(n.toFixed(4));
}

/** Build a deterministic simulator bound to one device model. */
export function createSimulator(model: PhysicsModel) {
  const { dtMs, ambientC, thermalGain, coolingRate } = model.thermal;
  const dtS = dtMs / 1000;

  return function simulate(script: PowerScript): SimSummary {
    let v = 0;
    let temp = ambientC;
    let currentLimit = 1;
    let energyJ = 0;
    const trace: number[] = [];
    const tempTrace: number[] = [];

    const step = (volts: number) => {
      v = volts;
      const power = Math.max(0, v) * currentLimit;
      energyJ += power * dtS;
      temp += power * thermalGain - (temp - ambientC) * coolingRate;
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
          const steps = Math.max(1, Math.ceil(op.ms / dtMs));
          const start = v;
          for (let i = 1; i <= steps; i++) step(start + ((op.toVolts - start) * i) / steps);
          break;
        }
        case "HOLD": {
          const steps = Math.max(1, Math.ceil(op.ms / dtMs));
          for (let i = 0; i < steps; i++) step(v);
          break;
        }
      }
    }

    const peakVolts = trace.length ? Math.max(...trace) : 0;
    const peakTempC = tempTrace.length ? Math.max(...tempTrace) : ambientC;
    return {
      samples: trace.length,
      durationMs: trace.length * dtMs,
      peakVolts: r4(peakVolts),
      finalVolts: r4(v),
      peakTempC: r4(peakTempC),
      currentLimitA: r4(currentLimit),
      energyJ: r4(energyJ),
      trace,
      tempTrace,
    };
  };
}

export type Simulator = ReturnType<typeof createSimulator>;
