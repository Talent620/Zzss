// _generate.ts — dev tool: emit signed physics_model.json plugins + the pinned
// trusted-publisher set. Run once:  node --experimental-strip-types src/models/_generate.ts
//
// In production these JSON files are signed on the device manufacturer's HSM and
// the publisher PUBLIC key is pinned into the app at build time / via MDM. The
// private key below is a throwaway DEMO publisher key, regenerated each run.

import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { canonicalize } from "../core/canonical.ts";
import type { PhysicsModel } from "../plugins/schema.ts";

ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));
const here = dirname(fileURLToPath(import.meta.url));

const priv = ed.utils.randomPrivateKey();
const pubHex = bytesToHex(ed.getPublicKey(priv));
const PUBLISHER = "acme-robotics";

function sign(model: PhysicsModel): PhysicsModel {
  const unsigned: PhysicsModel = { ...model };
  delete unsigned.signature;
  const sigHex = bytesToHex(ed.sign(utf8ToBytes(canonicalize(unsigned)), priv));
  return { ...model, signature: { alg: "ed25519", publisher: PUBLISHER, publicKeyHex: pubHex, sigHex } };
}

const drone: PhysicsModel = {
  schema: "aegis.physics_model/1",
  deviceId: "drone.esc.vreg.0",
  displayName: "Quadcopter ESC Voltage Regulator",
  envelope: { rail: "drone.esc.vreg.0", maxVolts: 13.2, maxTempC: 95, maxCurrentA: 8 },
  thermal: { dtMs: 10, ambientC: 25, thermalGain: 0.012, coolingRate: 0.05, degradationTempC: 60 },
  instructionSet: ["SET_CURRENT_LIMIT", "SET_VOLTAGE", "RAMP", "HOLD"],
  bus: { transport: "ble", serviceUuid: "0000fff0-0000-1000-8000-00805f9b34fb", charUuid: "0000fff1-0000-1000-8000-00805f9b34fb", framing: "aegis-frame/1" },
};

const welder: PhysicsModel = {
  schema: "aegis.physics_model/1",
  deviceId: "welder.pulse.0",
  displayName: "18650 Battery Spot Welder",
  // Totally different physics envelope: low voltage, huge pulse current, hot tips.
  envelope: { rail: "welder.pulse.0", maxVolts: 5.0, maxTempC: 120, maxCurrentA: 2000 },
  thermal: { dtMs: 5, ambientC: 25, thermalGain: 0.0006, coolingRate: 0.02, degradationTempC: 80 },
  instructionSet: ["SET_CURRENT_LIMIT", "RAMP", "HOLD"], // no bare SET_VOLTAGE on a welder
  bus: { transport: "elm327", baud: 38400, framing: "aegis-frame/1" },
};

writeFileSync(join(here, "drone_vreg.physics_model.json"), JSON.stringify(sign(drone), null, 2) + "\n");
writeFileSync(join(here, "battery_welder.physics_model.json"), JSON.stringify(sign(welder), null, 2) + "\n");
writeFileSync(join(here, "trusted-publishers.json"), JSON.stringify({ [PUBLISHER]: pubHex }, null, 2) + "\n");
console.log("wrote drone + welder models, pinned publisher:", PUBLISHER, pubHex.slice(0, 16) + "…");
