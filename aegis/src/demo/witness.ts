// witness.ts (demo) — The Witness Protocol vs the Interceptor paradigm.
//
// Run:  node --experimental-strip-types src/demo/witness.ts
//
// Shows a genuine witnessing, then the attacks that kill the Flipper-style
// capture/replay model: bit-perfect replay against a fresh challenge, intra-session
// replay, a relay attack defeated by a timing window, a weak-MCU device witnessed
// by symmetric MAC, and tamper-evidence on the time/place binding.

import { generateKeyPairSync, randomBytes } from "node:crypto";
import { Sentinel } from "../hw/sentinel.ts";
import type { PhysicalChannel, GpsFix } from "../hw/sentinel.ts";
import { SoftwareTeeSigner } from "../auth/keyless.ts";
import {
  issueChallenge,
  verifyResponse,
  deviceSignEd25519,
  deviceMacAscon,
  deviceEchoTiming,
} from "../auth/challenge.ts";
import type { DeviceResponse, WitnessChallenge, VerifyContext } from "../auth/challenge.ts";

function hr(t: string) {
  console.log("\n" + "─".repeat(72) + "\n" + t + "\n" + "─".repeat(72));
}
function mkSigner(id: string): SoftwareTeeSigner {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return new SoftwareTeeSigner(id, privateKey, publicKey.export({ type: "spki", format: "pem" }).toString());
}

// Logical clock + fixed GPS so the demo is deterministic.
let CLOCK = 5000;
const GPS: GpsFix = { lat: 52.2297, lon: 21.0122, accuracyM: 4 };
const phone = mkSigner("sentinel-phone-0");
const sentinel = new Sentinel({ signer: phone, now: () => CLOCK, gps: () => GPS });

// A genuine NFC gate with its OWN keypair (asymmetric proof of key possession).
const gateKeys = generateKeyPairSync("ed25519");
const gatePubPem = gateKeys.publicKey.export({ type: "spki", format: "pem" }).toString();
const gateCtx: VerifyContext = { deviceAnchorPubPem: gatePubPem };

// A programmable channel: we control exactly what "the device" answers, so we can
// play both the genuine device and an attacker.
class ScriptedChannel implements PhysicalChannel {
  last!: WitnessChallenge;
  responder!: (c: WitnessChallenge) => DeviceResponse;
  async transmitChallenge(c: WitnessChallenge) {
    this.last = c;
  }
  async awaitResponse(): Promise<DeviceResponse> {
    return this.responder(this.last);
  }
}
const ch = new ScriptedChannel();

console.log("AEGIS — The Witness Protocol (interception is a dead end)");
console.log(`Sentinel at ${GPS.lat},${GPS.lon}. The phone challenges; it never copies.`);

// ── 1. Genuine witnessing ────────────────────────────────────────────────────
hr("1) Genuine NFC gate answers a LIVE challenge → Physical Presence Proof");
ch.responder = (c) => ({ nonceHex: c.nonceHex, payloadHex: deviceSignEd25519(c, gateKeys.privateKey), latencyMs: 6 });
const w1 = await sentinel.witness(ch, "NFC", "gate.front.0", "ed25519", gateCtx);
console.log(`verdict: ${w1.verdict.code} — ${w1.verdict.reason}  (state=${sentinel.state})`);
console.log(`proof: target=${w1.proof?.targetId} time=${w1.proof?.time} gps=${w1.proof?.gps.lat},${w1.proof?.gps.lon}`);
console.log(`proof independently verifies: ${w1.proof ? Sentinel.verifyProof(w1.proof) : false}`);

// Attacker captures that genuine response off the air (the Flipper dream).
const captured: DeviceResponse = ch.responder(ch.last);

// ── 2. Flipper-style replay: capture once, replay against a NEW challenge ─────
hr("2) ATAK Interceptor: bit-perfect replay of the captured signal");
ch.responder = () => captured; // dumb device: always replays the captured bytes
CLOCK += 1;
const w2 = await sentinel.witness(ch, "NFC", "gate.front.0", "ed25519", gateCtx);
console.log(`verdict: ${w2.verdict.code} — ${w2.verdict.reason}`);
console.log("⇒ Fresh nonce ≠ captured nonce. Bit-perfect copy is worthless — the gate was never asked THIS question.");

// ── 3. Single-use nonce ledger: a valid response can't be used twice ─────────
hr("3) ATAK Replay (same nonce, twice) — single-use ledger");
const consumed = new Set<string>();
const c3 = issueChallenge("NFC", "gate.front.0", "ed25519", CLOCK, {});
const resp3: DeviceResponse = { nonceHex: c3.nonceHex, payloadHex: deviceSignEd25519(c3, gateKeys.privateKey), latencyMs: 6 };
const v3a = verifyResponse(c3, resp3, gateCtx, consumed, CLOCK);
const v3b = verifyResponse(c3, resp3, gateCtx, consumed, CLOCK); // exact same valid bytes
console.log(`first: ${v3a.code} · replayed: ${v3b.code} — ${v3b.reason}`);

// ── 4. Weak MCU (BMS) witnessed by symmetric MAC (ASCON stand-in) ────────────
hr("4) Weak-MCU BMS: no ed25519, witnessed by lightweight MAC");
const sharedKeyHex = randomBytes(16).toString("hex"); // 128-bit pre-shared key (ASCON-MAC sized)
const macCtx: VerifyContext = { sharedKeyHex };
CLOCK += 1;
ch.responder = (c) => ({ nonceHex: c.nonceHex, payloadHex: deviceMacAscon(c, sharedKeyHex), latencyMs: 3 });
const w4 = await sentinel.witness(ch, "BLE", "bms.pack.0", "ascon-mac", macCtx);
console.log(`verdict: ${w4.verdict.code} — ${w4.verdict.reason}`);

// ── 5. Timing method: genuine device fast, relay attack too slow ─────────────
hr("5) Timing-proof: genuine presence (fast) vs relay attack (slow)");
CLOCK += 1;
ch.responder = (c) => ({ nonceHex: c.nonceHex, payloadHex: deviceEchoTiming(c), latencyMs: 8 });
const w5ok = await sentinel.witness(ch, "IR", "sensor.bay.0", "timing", {}, { maxLatencyMs: 50 });
console.log(`genuine (8ms): ${w5ok.verdict.code}`);
CLOCK += 1;
ch.responder = (c) => ({ nonceHex: c.nonceHex, payloadHex: deviceEchoTiming(c), latencyMs: 130 }); // relayed via cloud
const w5relay = await sentinel.witness(ch, "IR", "sensor.bay.0", "timing", {}, { maxLatencyMs: 50 });
console.log(`relayed (130ms): ${w5relay.verdict.code} — ${w5relay.verdict.reason}`);

// ── 6. Tamper-evidence: move the proof in space ──────────────────────────────
hr("6) Tamper: relocate a genuine proof to a different GPS");
const tampered = { ...w1.proof!, gps: { lat: 0, lon: 0, accuracyM: 1 } };
console.log(`relocated proof still verifies? ${Sentinel.verifyProof(tampered)}  (false ⇒ time/place are sealed)`);

hr("WNIOSEK");
console.log("Sentinel nie kopiuje sygnału — wymusza ŻYWY stan protokołu. Każde wyzwanie");
console.log("jest świeże i jednorazowe, więc przechwycenie i odtworzenie (Flipper) nic nie");
console.log("daje: brama nigdy nie odpowiedziała na TO pytanie. Dowód obecności jest");
console.log("podpisany w TEE i związany z czasem+GPS — nie da się go przenieść ani podrobić.");
