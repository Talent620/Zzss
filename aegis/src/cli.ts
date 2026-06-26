// cli.ts — the Aegis command-line tool. A single self-contained entry that runs
// each subsystem as a live self-check. Bundled into standalone Linux/Windows
// binaries (see tools/build-binaries.sh). No top-level await: everything runs
// inside main() so it bundles cleanly to CommonJS for the SEA packager.

import { generateKeyPairSync } from "node:crypto";
import { Jarvis } from "./agent/jarvis.ts";
import { verify } from "./verifier/verify.ts";
import type { VerifierKey } from "./verifier/verify.ts";
import { AndroidGuardBridge } from "./verifier/androidBridge.ts";
import { simulate } from "./sim/physics.ts";
import type { HardwareEnvelope } from "./sim/physics.ts";
import type { SafetyClaim } from "./core/attest.ts";
import { ContinuousAuthority, SoftwareTeeSigner, proveContext } from "./auth/keyless.ts";
import { Sentinel } from "./hw/sentinel.ts";
import type { PhysicalChannel, GpsFix } from "./hw/sentinel.ts";
import { issueChallenge, verifyResponse, deviceSignEd25519 } from "./auth/challenge.ts";
import type { DeviceResponse, WitnessChallenge, VerifyContext } from "./auth/challenge.ts";
import { matchOffers, deriveValueVector } from "./market/vectorMatch.ts";
import type { AgentOffer } from "./market/vectorMatch.ts";
import { ConditionLedger, deriveStress, calendarDecision } from "./ledger/condition.ts";
import type { LifecycleEnvelope } from "./ledger/condition.ts";

const VERSION = "aegis 0.1.0";
const ENV: HardwareEnvelope = { rail: "mcu.vreg.0", maxVolts: 13.2, maxTempC: 95, maxCurrentA: 8 };
const CLAIM: SafetyClaim = { invariant: "PEAK_VOLTS_LE", threshold: 13.2 };

function mkVerifierKey(): VerifierKey {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { privateKey, publicKey, publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString() };
}
function mkSigner(id: string): SoftwareTeeSigner {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return new SoftwareTeeSigner(id, privateKey, publicKey.export({ type: "spki", format: "pem" }).toString());
}
function line(s = "") {
  console.log(s);
}

function cmdShield() {
  line("# Physics Shield — re-simulate + envelope, the bus only moves for safe code");
  const jarvis = new Jarvis("cli");
  const vk = mkVerifierKey();
  const safe = jarvis.attestHonest(1, "hold 12.6V", CLAIM, Jarvis.safeProfile(ENV.rail, 12.6));
  const danger = jarvis.attestHonest(2, "overdrive", CLAIM, Jarvis.overdriveProfile(ENV.rail, 14.8));
  line(`  safe 12.6V  -> ${verify(safe, ENV, vk).code}`);
  line(`  over 14.8V  -> ${verify(danger, ENV, vk).code}`);
}

function cmdKeyless() {
  line("# Keyless Bridge — per-operation proof, replay is dead");
  const jarvis = new Jarvis("cli");
  const vk = mkVerifierKey();
  const signer = mkSigner("cli-agent");
  const authority = new ContinuousAuthority("cli-bridge");
  authority.registerAnchor(signer.publicAnchor());
  const bridge = new AndroidGuardBridge(vk.publicKeyPem, authority);
  const block = jarvis.attestHonest(1, "hold 12.6V", CLAIM, Jarvis.safeProfile(ENV.rail, 12.6));
  const token = verify(block, ENV, vk).token!;
  const ch = bridge.requestChallenge(block, token, signer.subjectId, 100);
  const resp = proveContext(signer, ch);
  line(`  legit op     -> transmitted=${bridge.emit(block, token, ENV, resp, 100).transmitted}`);
  line(`  replay same  -> ${bridge.emit(block, token, ENV, resp, 101).reason}`);
}

function cmdWitness() {
  line("# Witness Protocol — challenge a device, replay of a captured signal is worthless");
  const phone = mkSigner("cli-phone");
  const gps: GpsFix = { lat: 52.2297, lon: 21.0122, accuracyM: 4 };
  const sentinel = new Sentinel({ signer: phone, now: () => 5000, gps: () => gps });
  const gate = generateKeyPairSync("ed25519");
  const ctx: VerifyContext = { deviceAnchorPubPem: gate.publicKey.export({ type: "spki", format: "pem" }).toString() };
  const c = issueChallenge("NFC", "gate.0", "ed25519", 5000, {});
  const good: DeviceResponse = { nonceHex: c.nonceHex, payloadHex: deviceSignEd25519(c, gate.privateKey), latencyMs: 6 };
  const consumed = new Set<string>();
  line(`  live challenge   -> ${verifyResponse(c, good, ctx, consumed, 5000).code}`);
  const cNew = issueChallenge("NFC", "gate.0", "ed25519", 5001, {});
  line(`  replay captured  -> ${verifyResponse(cNew, good, ctx, consumed, 5001).code} (fresh nonce)`);
}

function cmdMarket() {
  line("# Value Vector market — pick the SAFEST bid, not the cheapest");
  const jarvis = new Jarvis("cli");
  const vk = mkVerifierKey();
  const aggressive = { target: ENV.rail, ops: [{ op: "SET_CURRENT_LIMIT" as const, amps: 7 }, { op: "RAMP" as const, toVolts: 12.9, ms: 100 }, { op: "HOLD" as const, ms: 150 }] };
  const gentle = { target: ENV.rail, ops: [{ op: "SET_CURRENT_LIMIT" as const, amps: 4 }, { op: "RAMP" as const, toVolts: 11.8, ms: 100 }, { op: "HOLD" as const, ms: 350 }] };
  const offers: AgentOffer[] = [
    { agentId: "A(fast)", block: jarvis.attestHonest(1, "fast", CLAIM, aggressive), claimedVector: deriveValueVector(simulate(aggressive), ENV) },
    { agentId: "B(gentle)", block: jarvis.attestHonest(2, "gentle", CLAIM, gentle), claimedVector: deriveValueVector(simulate(gentle), ENV) },
  ];
  line(`  winner -> ${matchOffers(offers, ENV, vk).winner?.agentId} (safest, not cheapest)`);
}

function cmdCondition() {
  line("# Physical Truth Ledger — health from proven stress, not the calendar");
  const signer = mkSigner("cli-sentinel");
  const env: LifecycleEnvelope = { partId: "motor.0", maxCumulativeEnergyJ: 19000, maxThermalStress: 1000, maxCycles: 1000, absoluteMaxTempC: 150, thermalBaselineC: 60 };
  const gentle = { target: env.partId, ops: [{ op: "SET_CURRENT_LIMIT" as const, amps: 5 }, { op: "RAMP" as const, toVolts: 12.0, ms: 100 }, { op: "HOLD" as const, ms: 200 }] };
  const abusive = { target: env.partId, ops: [{ op: "SET_CURRENT_LIMIT" as const, amps: 8 }, { op: "RAMP" as const, toVolts: 13.0, ms: 100 }, { op: "HOLD" as const, ms: 1000 }] };
  const lg = new ConditionLedger(env, signer);
  const sg = deriveStress(simulate(gentle), env.thermalBaselineC);
  for (let i = 0; i < 300; i++) lg.record(sg);
  line(`  300 gentle: calendar=${calendarDecision(300, 200)}  witnessed=${lg.assess().health}`);
  const lb = new ConditionLedger(env, signer);
  const sa = deriveStress(simulate(abusive), env.thermalBaselineC);
  for (let i = 0; i < 180; i++) lb.record(sa);
  line(`  180 abusive: calendar=${calendarDecision(180, 200)}  witnessed=${lb.assess().health}`);
}

function main(argv: string[]) {
  const cmd = (argv[2] ?? "all").toLowerCase();
  const banner = "AEGIS — cyber-physical zero-trust toolkit";
  const runners: Record<string, () => void> = {
    shield: cmdShield,
    keyless: cmdKeyless,
    witness: cmdWitness,
    market: cmdMarket,
    condition: cmdCondition,
  };
  if (cmd === "version" || cmd === "--version" || cmd === "-v") return line(VERSION);
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    line(banner);
    line("usage: aegis <shield|keyless|witness|market|condition|all|version>");
    return;
  }
  line(banner);
  if (cmd === "all") {
    for (const key of Object.keys(runners)) {
      line("");
      runners[key]();
    }
    return;
  }
  const r = runners[cmd];
  if (!r) {
    line(`unknown command '${cmd}'. try: aegis help`);
    process.exitCode = 1;
    return;
  }
  line("");
  r();
}

main(process.argv);
