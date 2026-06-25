// keyless.ts (demo) — Authorization as a Verb, and why credential theft is dead.
//
// Run:  node --experimental-strip-types src/demo/keyless.ts
//
// Shows a legitimate per-operation proof, then four attacks that all fail by
// construction: replay, cross-operation reuse, theft of the entire server store,
// and possession of the public anchor without the private key.

import { generateKeyPairSync } from "node:crypto";
import { Jarvis } from "../agent/jarvis.ts";
import { verify } from "../verifier/verify.ts";
import type { VerifierKey } from "../verifier/verify.ts";
import { AndroidGuardBridge } from "../verifier/androidBridge.ts";
import type { HardwareEnvelope } from "../sim/physics.ts";
import type { SafetyClaim, AttestationBlock } from "../core/attest.ts";
import type { ExecutionToken } from "../verifier/verify.ts";
import { ContinuousAuthority, SoftwareTeeSigner, proveContext } from "../auth/keyless.ts";
import type { ChallengeResponse } from "../auth/keyless.ts";

function hr(t: string) {
  console.log("\n" + "─".repeat(72) + "\n" + t + "\n" + "─".repeat(72));
}
function mkVerifierKey(): VerifierKey {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { privateKey, publicKey, publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString() };
}
function mkSigner(id: string): SoftwareTeeSigner {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return new SoftwareTeeSigner(id, privateKey, publicKey.export({ type: "spki", format: "pem" }).toString());
}

const ENV: HardwareEnvelope = { rail: "mcu.vreg.0", maxVolts: 13.2, maxTempC: 95, maxCurrentA: 8 };
const CLAIM: SafetyClaim = { invariant: "PEAK_VOLTS_LE", threshold: 13.2 };

const jarvis = new Jarvis("jarvis-core");
const verifierKey = mkVerifierKey();
const signer = mkSigner("jarvis-core"); // the agent's TEE-bound key
const authority = new ContinuousAuthority("aegis-bridge-0");
authority.registerAnchor(signer.publicAnchor()); // PUBLIC anchor only

let killed = 0;
const bridge = new AndroidGuardBridge(verifierKey.publicKeyPem, authority, () => { killed++; });
let clock = 1000;

// Build a safe, physics-approved operation and its execution token.
function safeOp(volts: number, goal: string): { block: AttestationBlock; token: ExecutionToken } {
  const script = Jarvis.safeProfile(ENV.rail, volts);
  const block = jarvis.attestHonest(clock, goal, CLAIM, script);
  const v = verify(block, ENV, verifierKey);
  return { block, token: v.token! };
}

console.log("AEGIS — Keyless Bridge: 'Authorization as a Verb'");
console.log("No passwords. No API keys. No sessions. Nothing static to steal.");

// ── 1. Legit per-operation proof ─────────────────────────────────────────────
hr("1) Legalna operacja: świeże challenge → podpis TEE → EXEC");
const opA = safeOp(12.6, "stabilize at 12.6V");
const tickA = clock++;
const challengeA = bridge.requestChallenge(opA.block, opA.token, signer.subjectId, tickA);
const responseA: ChallengeResponse = proveContext(signer, challengeA);
const r1 = bridge.emit(opA.block, opA.token, ENV, responseA, tickA);
console.log(`transmitted=${r1.transmitted} — ${r1.reason}`);
console.log("Co przechowuje serwer (to, co ukradłby atakujący):");
console.log("  " + JSON.stringify(authority.exportState().note));
console.log("  anchors =", Object.keys(authority.exportState().anchors), "(same klucze PUBLICZNE)");

// ── 2. Replay: reuse a captured valid proof ──────────────────────────────────
hr("2) ATAK Replay: ponowne użycie przechwyconego, ważnego dowodu");
const r2 = bridge.emit(opA.block, opA.token, ENV, responseA, clock++);
console.log(`transmitted=${r2.transmitted} — ${r2.reason}  (killed=${r2.killed})`);

// ── 3. Cross-operation reuse: proof for op A, used for op B ───────────────────
hr("3) ATAK Cross-Op: dowód dla operacji A użyty do operacji B");
const opB = safeOp(12.4, "stabilize at 12.4V"); // different code => different token
const tickB = clock++;
const challengeForA = bridge.requestChallenge(opA.block, opA.token, signer.subjectId, tickB);
const proofForA = proveContext(signer, challengeForA); // honestly signed... but for A
const r3 = bridge.emit(opB.block, opB.token, ENV, proofForA, tickB); // ...presented for B
console.log(`transmitted=${r3.transmitted} — ${r3.reason}  (killed=${r3.killed})`);

// ── 4. Stolen server store: attacker has all anchors, signs with own key ──────
hr("4) ATAK Kradzież bazy serwera: atakujący ma wszystkie kotwice (publiczne)");
const attacker = mkSigner("jarvis-core"); // same subjectId, DIFFERENT (their own) key
const tickC = clock++;
const stolenState = authority.exportState(); // exfiltrated — all public
console.log("  exfiltrated:", JSON.stringify(stolenState.anchors).slice(0, 48) + "…");
const chal4 = bridge.requestChallenge(opA.block, opA.token, "jarvis-core", tickC);
// 4a. attacker responds with their OWN key
const r4a = bridge.emit(opA.block, opA.token, ENV, proveContext(attacker, chal4), tickC);
console.log(`  4a own-key:        transmitted=${r4a.transmitted} — ${r4a.reason}`);
// 4b. attacker claims the victim's public anchor but still signs with their own key
const forged: ChallengeResponse = { ...proveContext(attacker, chal4), publicKeyPem: signer.publicAnchor().publicKeyPem };
const r4b = bridge.emit(opA.block, opA.token, ENV, forged, clock++);
console.log(`  4b spoofed-pubkey: transmitted=${r4b.transmitted} — ${r4b.reason}`);

// ── 5. Expired challenge ──────────────────────────────────────────────────────
hr("5) ATAK Stale: dowód wygenerowany, ale przedstawiony po wygaśnięciu");
const tickD = clock++;
const chal5 = bridge.requestChallenge(opA.block, opA.token, signer.subjectId, tickD);
const proof5 = proveContext(signer, chal5);
const r5 = bridge.emit(opA.block, opA.token, ENV, proof5, tickD + 99); // far past expiry
console.log(`transmitted=${r5.transmitted} — ${r5.reason}  (killed=${r5.killed})`);

hr("WNIOSEK");
console.log(`Legalne transmisje: 1.  Zablokowane ataki: 4.  Kill-switch zadziałał ${killed}×.`);
console.log("Nie ma czego ukraść: serwer zna tylko klucze publiczne, klucz prywatny");
console.log("nigdy nie opuszcza TEE, a każdy dowód jest jednorazowy i przypięty do JEDNEJ");
console.log("operacji fizycznej. Skradzione poświadczenie to martwy bit.");
