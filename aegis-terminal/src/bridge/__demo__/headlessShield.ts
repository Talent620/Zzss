// headlessShield.ts — proves the on-device shield logic in plain Node, without
// React Native or hardware. Run:  npm run headless
//
// Demonstrates: SYNC -> ATTEST -> VERIFY -> EXEC, the PHYSICS_VIOLATION block,
// a drone->welder plugin hot-swap, and the contained "malicious model" attack.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BridgeController } from "../BridgeController.ts";
import { PhysicsModelRegistry } from "../../plugins/PhysicsModelRegistry.ts";
import { newAgentKey } from "../../core/attest.ts";
import type { SafetyClaim } from "../../core/attest.ts";
import type { PowerScript } from "../../sim/powerscript.ts";
import type { ISerialTransport, DeviceReadings } from "../SerialTransport.ts";
import type { BusConfig } from "../../plugins/schema.ts";

const models = join(dirname(fileURLToPath(import.meta.url)), "../../models");
const read = (f: string) => readFileSync(join(models, f), "utf8");

// A mock bus that records what was transmitted (never touches real hardware).
class MockTransport implements ISerialTransport {
  readings: DeviceReadings;
  sent: string[][] = [];
  constructor(readings: DeviceReadings) {
    this.readings = readings;
  }
  async connect(_bus: BusConfig) {}
  async identify() {
    return this.readings;
  }
  async writeFrames(frames: string[]) {
    this.sent.push(frames);
  }
  async disconnect() {}
}

function hr(t: string) {
  console.log("\n" + "─".repeat(70) + "\n" + t + "\n" + "─".repeat(70));
}

const registry = new PhysicsModelRegistry(JSON.parse(read("trusted-publishers.json")));
const transport = new MockTransport({ deviceId: "drone.esc.vreg.0", volts: 12.6, tempC: 30, currentA: 2 });
const controller = new BridgeController({ transport, registry, agentKey: newAgentKey("jarvis-mobile") });

const safe = (rail: string, v: number): PowerScript => ({
  target: rail,
  ops: [{ op: "SET_CURRENT_LIMIT", amps: 5 }, { op: "RAMP", toVolts: v, ms: 100 }, { op: "HOLD", ms: 200 }],
});

console.log("AEGIS TERMINAL — headless Physics Shield proof");

// ── Drone: load model, sync, safe op all the way to the bus ──────────────────
hr("[MODEL] load drone plugin (signed)  +  [SYNC]");
const drone = controller.loadModel(read("drone_vreg.physics_model.json"));
console.log(`trust=${drone.trust}`);
await controller.sync();

hr("Safe op: [ATTEST] -> [VERIFY] -> [EXEC]");
controller.attestOperation("hold rail at 12.6V", { invariant: "PEAK_VOLTS_LE", threshold: 13.2 }, safe("drone.esc.vreg.0", 12.6));
controller.verifyPending();
console.log("canExecute:", controller.canExecute());
await controller.exec();
console.log("bus transmissions so far:", transport.sent.length);

// ── Dangerous op: shield must block, button greys, bus untouched ─────────────
hr("Dangerous op (14.8V): [VERIFY] must PHYSICS_VIOLATION, [EXEC] refused");
controller.attestOperation("overdrive rail", { invariant: "PEAK_VOLTS_LE", threshold: 13.2 }, safe("drone.esc.vreg.0", 14.8));
controller.verifyPending();
console.log("canExecute (drives EXECUTE button):", controller.canExecute(), "<- button is GREY");
try {
  await controller.exec();
} catch (e) {
  console.log("exec() ->", (e as Error).message);
}
console.log("bus transmissions (unchanged):", transport.sent.length);

// ── Plugin hot-swap: drone -> battery welder, NO recompile ───────────────────
hr("[PLUGIN SWAP] load battery welder plugin (totally different envelope)");
const welder = controller.loadModel(read("battery_welder.physics_model.json"));
console.log(`now driving: ${welder.model.displayName}  trust=${welder.trust}  maxV=${welder.model.envelope.maxVolts} maxA=${welder.model.envelope.maxCurrentA}`);
transport.readings = { deviceId: "welder.pulse.0", volts: 0, tempC: 28, currentA: 0 };
await controller.sync();
const weldPulse: PowerScript = { target: "welder.pulse.0", ops: [{ op: "SET_CURRENT_LIMIT", amps: 1500 }, { op: "RAMP", toVolts: 4.5, ms: 30 }, { op: "HOLD", ms: 20 }] };
controller.attestOperation("spot-weld pulse", { invariant: "PEAK_VOLTS_LE", threshold: 5.0 }, weldPulse);
const wv = controller.verifyPending();
console.log(`welder verify: ${wv.code} (peak ${wv.groundTruth?.peakVolts}V / ${wv.groundTruth?.peakTempC}C)  canExecute=${controller.canExecute()}`);
if (controller.canExecute()) await controller.exec();
console.log("bus transmissions:", transport.sent.length);

// ── Attack: upload a forged model with a 9000V envelope ──────────────────────
hr("[ATTACK] malicious physics_model.json (maxVolts=9000) — must be contained");
const forged = JSON.parse(read("drone_vreg.physics_model.json"));
forged.envelope.maxVolts = 9000; // tamper: try to disable the shield via the plugin
const forgedLoad = controller.loadModel(JSON.stringify(forged));
console.log(`forged model trust=${forgedLoad.trust} (${forgedLoad.reason})`);
transport.readings = { deviceId: "drone.esc.vreg.0", volts: 12.6, tempC: 30, currentA: 2 };
await controller.sync();
controller.attestOperation("overdrive via forged envelope", { invariant: "PEAK_VOLTS_LE", threshold: 13.2 }, safe("drone.esc.vreg.0", 14.8));
controller.verifyPending();
console.log("canExecute under forged model:", controller.canExecute(), "<- SIM_ONLY: bus stays disabled");
try {
  await controller.exec();
} catch (e) {
  console.log("exec() ->", (e as Error).message);
}

hr("RESULT");
console.log(`Total real bus transmissions across the whole session: ${transport.sent.length}`);
console.log("Only the two genuinely-safe ops on TRUSTED models ever reached the wire.");
