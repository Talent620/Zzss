// PhysicsModelRegistry.ts — the Plugin Architecture, with a trust boundary.
//
// A user can drop a new physics_model.json onto the phone to retarget the
// terminal (drone -> battery welder) with NO recompile. But a plugin that defines
// the safety envelope is also the perfect place to ATTACK the shield: upload a
// model with maxVolts = 9000 and every dangerous script "passes". So the registry
// treats models as untrusted input:
//
//   - A model SIGNED by a trusted publisher (ed25519) is `TRUSTED` and may drive
//     the real bus.
//   - An unsigned or wrong-signed model is loaded `SIM_ONLY`: you can simulate and
//     inspect it, but the bridge will refuse to ever transmit. The envelope of an
//     untrusted party can never authorize touching metal.

import * as ed from "@noble/ed25519";
import { hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { canonicalize } from "../core/canonical.ts";
import type { PhysicsModel, ModelSignature } from "./schema.ts";

export type ModelTrust = "TRUSTED" | "SIM_ONLY";

export interface LoadedModel {
  model: PhysicsModel;
  trust: ModelTrust;
  reason: string;
}

function basicShapeOk(m: PhysicsModel): string[] {
  const e: string[] = [];
  if (m.schema !== "aegis.physics_model/1") e.push("unknown schema");
  if (!m.deviceId) e.push("missing deviceId");
  if (!m.envelope || !(m.envelope.maxVolts > 0)) e.push("missing/invalid envelope");
  if (!m.thermal || !(m.thermal.dtMs > 0)) e.push("missing/invalid thermal model");
  if (!Array.isArray(m.instructionSet) || m.instructionSet.length === 0) e.push("empty instructionSet");
  if (!m.bus || !m.bus.transport) e.push("missing bus config");
  return e;
}

export class PhysicsModelRegistry {
  // key id -> trusted publisher public key (hex). In production these are pinned
  // at build time and/or provisioned by MDM, never editable by the app user.
  trustedPublishers: Map<string, string>;

  constructor(trustedPublishers: Record<string, string>) {
    this.trustedPublishers = new Map(Object.entries(trustedPublishers));
  }

  private verifyModelSignature(model: PhysicsModel, sig: ModelSignature): boolean {
    const pinned = this.trustedPublishers.get(sig.publisher);
    if (!pinned || pinned !== sig.publicKeyHex) return false;
    const unsigned: PhysicsModel = { ...model };
    delete unsigned.signature;
    try {
      return ed.verify(hexToBytes(sig.sigHex), utf8ToBytes(canonicalize(unsigned)), hexToBytes(sig.publicKeyHex));
    } catch {
      return false;
    }
  }

  /** Parse + classify a model loaded from disk / SAF / share intent. */
  load(json: string | PhysicsModel): LoadedModel {
    let model: PhysicsModel;
    try {
      model = typeof json === "string" ? (JSON.parse(json) as PhysicsModel) : json;
    } catch {
      throw new Error("physics_model.json is not valid JSON");
    }
    const shapeErrs = basicShapeOk(model);
    if (shapeErrs.length) throw new Error("invalid model: " + shapeErrs.join("; "));

    if (!model.signature)
      return { model, trust: "SIM_ONLY", reason: "model is unsigned — simulation only, bus disabled" };
    if (!this.verifyModelSignature(model, model.signature))
      return { model, trust: "SIM_ONLY", reason: "signature not from a pinned trusted publisher — bus disabled" };

    return { model, trust: "TRUSTED", reason: `signed by trusted publisher '${model.signature.publisher}'` };
  }
}
