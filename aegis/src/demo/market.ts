// market.ts — N-Dimensional Value auction demo, integrated with Aegis.
//
// Two agents bid to "optimize an algorithm". One is faster AND cheaper in energy;
// the other is gentler on the hardware. A classic price-picker takes the cheap
// one. The Aegis-backed orchestrator instead picks the one that is mathematically
// SAFER for the rail — and disqualifies a liar and an unsafe bid along the way.
//
// Run with:  node --experimental-strip-types src/demo/market.ts

import { generateKeyPairSync } from "node:crypto";
import { Jarvis } from "../agent/jarvis.ts";
import type { VerifierKey } from "../verifier/verify.ts";
import { simulate } from "../sim/physics.ts";
import type { HardwareEnvelope } from "../sim/physics.ts";
import type { SafetyClaim } from "../core/attest.ts";
import type { PowerScript } from "../sim/powerscript.ts";
import { matchOffers, deriveValueVector } from "../market/vectorMatch.ts";
import type { AgentOffer, ValueVector } from "../market/vectorMatch.ts";

function makeVerifierKey(): VerifierKey {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { privateKey, publicKey, publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString() };
}
function fmt(v?: ValueVector): string {
  if (!v) return "—";
  return `[E=${v.energyJ}J t=${v.processingMs}ms risk=${v.errorRisk} deg=${v.hwDegradation}]`;
}

const ENV: HardwareEnvelope = { rail: "mcu.vreg.0", maxVolts: 13.2, maxTempC: 95, maxCurrentA: 8 };
const CLAIM: SafetyClaim = { invariant: "PEAK_VOLTS_LE", threshold: 13.2 };
const verifierKey = makeVerifierKey();
const jarvis = new Jarvis("orchestrated-pool");

// "Algorithm implementations" expressed as power/thermal profiles on the rail.
const aggressive: PowerScript = {
  target: ENV.rail,
  ops: [{ op: "SET_CURRENT_LIMIT", amps: 7 }, { op: "RAMP", toVolts: 12.9, ms: 100 }, { op: "HOLD", ms: 150 }],
};
const gentle: PowerScript = {
  target: ENV.rail,
  ops: [{ op: "SET_CURRENT_LIMIT", amps: 4 }, { op: "RAMP", toVolts: 11.8, ms: 100 }, { op: "HOLD", ms: 350 }],
};
const unsafe: PowerScript = {
  target: ENV.rail,
  ops: [{ op: "SET_CURRENT_LIMIT", amps: 7 }, { op: "RAMP", toVolts: 14.8, ms: 100 }, { op: "HOLD", ms: 200 }],
};

// An honest agent derives its own vector from the same trusted simulator.
const honestVector = (s: PowerScript): ValueVector => deriveValueVector(simulate(s), ENV);

const offers: AgentOffer[] = [
  { agentId: "AGENT-A(aggressive)", block: jarvis.attestHonest(10, "optimize: throughput-first", CLAIM, aggressive), claimedVector: honestVector(aggressive) },
  { agentId: "AGENT-B(gentle)", block: jarvis.attestHonest(11, "optimize: hardware-friendly", CLAIM, gentle), claimedVector: honestVector(gentle) },
  // C ships the aggressive script but LIES, claiming B's gentle vector (hides degradation).
  { agentId: "AGENT-C(liar)", block: jarvis.attestHonest(12, "optimize: 'best of both'", CLAIM, aggressive), claimedVector: honestVector(gentle) },
  // D is genuinely unsafe — Aegis envelope must reject it before scoring.
  { agentId: "AGENT-D(unsafe)", block: jarvis.attestHonest(13, "optimize: max overclock", CLAIM, unsafe), claimedVector: honestVector(unsafe) },
];

console.log("AEGIS MARKET — N-Dimensional Value Vector auction");
console.log(`Rail ${ENV.rail}: limit ${ENV.maxVolts}V / ${ENV.maxTempC}C / ${ENV.maxCurrentA}A\n`);
console.log("Offers (claimed vectors):");
for (const o of offers) console.log(`  ${o.agentId.padEnd(22)} ${fmt(o.claimedVector)}`);

const result = matchOffers(offers, ENV, verifierKey);

console.log("\nEvaluation:");
for (const e of result.evaluations) {
  const tag = e.admissible ? `ADMISSIBLE margin=${e.safetyMargin}` : `DISQUALIFIED ${e.disqualCode}`;
  console.log(`  ${e.agentId.padEnd(22)} ${tag}`);
  console.log(`      real ${fmt(e.groundVector)}  — ${e.detail}`);
}

console.log("\nPareto front: {" + result.paretoFront.join(", ") + "}");
console.log("Naive price-picker would take AGENT-A (lowest energy AND lowest time).");
console.log(`WINNER: ${result.winner ? result.winner.agentId : "none"}`);
console.log("Rationale: " + result.rationale);
