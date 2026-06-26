// run.ts — the Aegis startup experiment.
//
// Four scenarios, one rail. The agent (Jarvis) keeps trying to drive a power
// regulator; the Hardware-in-the-Loop guardian decides what the metal is allowed
// to feel. Run with:  node --experimental-strip-types src/demo/run.ts

import { generateKeyPairSync } from "node:crypto";
import { Jarvis } from "../agent/jarvis.ts";
import { verify } from "../verifier/verify.ts";
import type { VerifierKey } from "../verifier/verify.ts";
import { AndroidGuardBridge } from "../verifier/androidBridge.ts";
import type { EmitResult } from "../verifier/androidBridge.ts";
import { selfCorrectionLoop } from "../agent/selfCorrect.ts";
import { simulate } from "../sim/physics.ts";
import type { HardwareEnvelope } from "../sim/physics.ts";
import type { SafetyClaim, AttestationBlock } from "../core/attest.ts";
import { ContinuousAuthority, SoftwareTeeSigner, proveContext } from "../auth/keyless.ts";
import type { ExecutionToken } from "../verifier/verify.ts";

function makeVerifierKey(): VerifierKey {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { privateKey, publicKey, publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString() };
}

function hr(title: string) {
  console.log("\n" + "─".repeat(72) + "\n" + title + "\n" + "─".repeat(72));
}

// The physical truth the guardian protects: an MCU rail that dies above 13.2 V.
const ENV: HardwareEnvelope = { rail: "mcu.vreg.0", maxVolts: 13.2, maxTempC: 95, maxCurrentA: 8 };
const CLAIM: SafetyClaim = { invariant: "PEAK_VOLTS_LE", threshold: 13.2 };

const jarvis = new Jarvis("jarvis-core");
const verifierKey = makeVerifierKey();

// Keyless authorization: the agent has a hardware-bound key (TEE stand-in); the
// authority stores only its public anchor. Every emit needs a fresh proof.
const teeKeys = generateKeyPairSync("ed25519");
const signer = new SoftwareTeeSigner("jarvis-core", teeKeys.privateKey, teeKeys.publicKey.export({ type: "spki", format: "pem" }).toString());
const authority = new ContinuousAuthority("aegis-bridge-0");
authority.registerAnchor(signer.publicAnchor());
let killed = 0;
const bridge = new AndroidGuardBridge(verifierKey.publicKeyPem, authority, () => { killed++; });

// Helper: do the per-operation challenge -> TEE-sign -> emit dance.
let clock = 1000;
function authorizedEmit(block: AttestationBlock, token: ExecutionToken | undefined, env: HardwareEnvelope): EmitResult {
  const tick = clock++;
  if (!token) return bridge.emit(block, undefined, env, undefined, tick); // denied physics -> kill path
  const challenge = bridge.requestChallenge(block, token, signer.subjectId, tick);
  const response = proveContext(signer, challenge);
  return bridge.emit(block, token, env, response, tick);
}

console.log("AEGIS — Zero-Trust Autonomous Evolution");
console.log(`Rail ${ENV.rail}: hard limit ${ENV.maxVolts} V / ${ENV.maxTempC} C / ${ENV.maxCurrentA} A`);

// ── Scenario A: safe + honest → token issued, bus energized ─────────────────
hr("SCENARIO A — Bezpieczny skrypt (powinien przejść)");
{
  const script = Jarvis.safeProfile(ENV.rail, 12.6);
  const block = jarvis.attestHonest(1, "stabilize rail at 12.6V", CLAIM, script);
  const v = verify(block, ENV, verifierKey);
  console.log(`verdict: ${v.code} — ${v.reason}`);
  console.log(`ground-truth peak: ${v.groundTruth?.peakVolts} V (diffBits=${v.diffBits})`);
  const emit = authorizedEmit(block, v.token, ENV);
  console.log(`android bridge: transmitted=${emit.transmitted} — ${emit.reason}`);
  emit.busFrames.forEach((f) => console.log("   " + f));
}

// ── Scenario B: dangerous + HONEST → hashes match, envelope blocks it ────────
hr("SCENARIO B — Skrypt niebezpieczny, atestacja UCZCIWA (envelope blokuje)");
{
  const script = Jarvis.overdriveProfile(ENV.rail, 14.8); // 14.8 V > 13.2 V limit
  const block = jarvis.attestHonest(2, "overclock rail for performance", CLAIM, script);
  const v = verify(block, ENV, verifierKey);
  console.log(`verdict: ${v.code} — ${v.reason}`);
  console.log(`ground-truth peak: ${v.groundTruth?.peakVolts} V (diffBits=${v.diffBits} → integrity OK)`);
  console.log("⇒ Atestacja jest kryptograficznie idealna, a sprzęt i tak ODMAWIA: fizyka jest niebezpieczna.");
  const emit = authorizedEmit(block, v.token, ENV);
  console.log(`android bridge: transmitted=${emit.transmitted} — ${emit.reason}`);
}

// ── Scenario C: dangerous + DECEPTIVE → independent re-sim catches the lie ────
hr("SCENARIO C — Halucynacja: kod groźny, atestacja KŁAMIE (sim-divergence blokuje)");
{
  const dangerous = Jarvis.overdriveProfile(ENV.rail, 14.8);
  const safeLookingScript = Jarvis.safeProfile(ENV.rail, 12.6);
  // Jarvis forges a safe-looking prediction lifted from a different, safe script.
  const forgedSim = simulate(safeLookingScript);
  const block = jarvis.attestDeceptive(3, "overclock rail (claimed safe)", CLAIM, dangerous, forgedSim);
  const v = verify(block, ENV, verifierKey);
  console.log(`verdict: ${v.code} — ${v.reason}`);
  console.log(`ground-truth peak: ${v.groundTruth?.peakVolts} V`);
  console.log(`⇒ Symulacja weryfikatora różni się od atestacji o ${v.diffBits} bitów (≠ 0 ⇒ odrzucone).`);
  const emit = authorizedEmit(block, v.token, ENV);
  console.log(`android bridge: transmitted=${emit.transmitted} — ${emit.reason}`);
}

// ── Scenario D: self-correction loop until the guardian relents ──────────────
hr("SCENARIO D — Pętla samonaprawy (aż atestacja przejdzie)");
{
  const reckless = Jarvis.overdriveProfile(ENV.rail, 14.8);
  const result = selfCorrectionLoop(jarvis, ENV, "reach max safe rail voltage", CLAIM, reckless, verifierKey, 10);
  for (const r of result.rounds) {
    const peak = r.peakVolts !== undefined ? `${r.peakVolts}V` : "n/a";
    console.log(`  round ${r.round}: ${r.verdictCode.padEnd(20)} peak=${peak.padEnd(8)} ${r.reason}`);
  }
  console.log(`self-correction success: ${result.success}`);
  if (result.success) {
    const emit = authorizedEmit(result.finalBlock, result.finalVerdict.token, ENV);
    console.log(`android bridge: transmitted=${emit.transmitted} — ${emit.reason}`);
    emit.busFrames.forEach((f) => console.log("   " + f));
  }
}

hr("WNIOSEK");
console.log("AI nie ma prawa dotknąć sprzętu samą deklaracją. Musi przedstawić Proof-of-Thought,");
console.log("który Strażnik niezależnie re-symuluje i porównuje co do bitu — a potem i tak");
console.log("sprawdza fizyczną kopertę bezpieczeństwa. Kłamstwo łapie WALL 1, prawdziwe");
console.log("zagrożenie łapie WALL 2. Sprzęt jest ostatnim, nieprzekupnym sędzią.");
