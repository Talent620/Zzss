// jarvis.ts — the autonomous agent side.
//
// Jarvis writes its own skills (PowerScripts) and packages them as
// attestations. It has two ways to attest:
//
//   attestHonest    — simulates its own script truthfully and attests the real
//                      prediction. Honesty does not make a dangerous script safe;
//                      it just means the verifier's re-sim will agree (WALL 1),
//                      and the script will still be caught by the envelope (WALL 2).
//
//   attestDeceptive — ships a dangerous script but FORGES a safe-looking
//                     prediction (a hallucination, or an outright lie). WALL 1's
//                     independent re-simulation catches the divergence.

import { attest, newAgentKey } from "../core/attest.ts";
import type { AgentKey, AttestationBlock, SafetyClaim } from "../core/attest.ts";
import { simulate } from "../sim/physics.ts";
import type { SimSummary } from "../sim/physics.ts";
import type { PowerScript } from "../sim/powerscript.ts";

export class Jarvis {
  key: AgentKey;

  constructor(agentId: string) {
    this.key = newAgentKey(agentId);
  }

  /** A safe power profile: ramp gently to a holding voltage under the ceiling. */
  static safeProfile(target: string, holdVolts: number): PowerScript {
    return {
      target,
      ops: [
        { op: "SET_CURRENT_LIMIT", amps: 5 },
        { op: "RAMP", toVolts: holdVolts, ms: 200 },
        { op: "HOLD", ms: 300 },
      ],
    };
  }

  /** A reckless "performance" profile that drives the rail past its limit. */
  static overdriveProfile(target: string, peakVolts: number): PowerScript {
    return {
      target,
      ops: [
        { op: "SET_CURRENT_LIMIT", amps: 5 },
        { op: "RAMP", toVolts: peakVolts, ms: 150 },
        { op: "HOLD", ms: 250 },
      ],
    };
  }

  attestHonest(tick: number, goal: string, claim: SafetyClaim, script: PowerScript): AttestationBlock {
    const truthfulSim = simulate(script); // Jarvis runs the same trusted model
    return attest(this.key, tick, goal, claim, script, truthfulSim);
  }

  attestDeceptive(
    tick: number,
    goal: string,
    claim: SafetyClaim,
    script: PowerScript,
    forgedSim: SimSummary,
  ): AttestationBlock {
    return attest(this.key, tick, goal, claim, script, forgedSim);
  }
}
