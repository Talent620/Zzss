// androidBridge.ts — the physical-world gate (Android module).
//
// This stands at the very edge of the cyber-physical boundary. It owns the
// Bluetooth / diagnostic-connector handle. It will translate a PowerScript into
// real bus traffic ONLY when handed an ExecutionToken that (a) is signed by the
// verifier it trusts, and (b) is bound to the exact codeHash about to be sent.
//
// Defense in depth: even if a caller hands it a block that "looks fine", with no
// valid token the bridge never energizes the bus. The hardware's last word is
// always "show me the verifier's signature for THIS code, or nothing moves."

import { verify as edVerify, createPublicKey } from "node:crypto";
import { hashOf, canonicalize } from "../core/canonical.ts";
import type { AttestationBlock } from "../core/attest.ts";
import type { ExecutionToken } from "./verify.ts";
import type { HardwareEnvelope } from "../sim/physics.ts";

export interface EmitResult {
  transmitted: boolean;
  reason: string;
  busFrames: string[]; // what would have gone onto the wire
}

export class AndroidGuardBridge {
  trustedVerifierPem: string;

  constructor(trustedVerifierPem: string) {
    this.trustedVerifierPem = trustedVerifierPem;
  }

  emit(block: AttestationBlock, token: ExecutionToken | undefined, env: HardwareEnvelope): EmitResult {
    if (!token) return { transmitted: false, reason: "no execution token — bus stays cold", busFrames: [] };

    // 1. token must be signed by the verifier we trust
    const tokenCore = {
      codeHash: token.codeHash,
      envelopeHash: token.envelopeHash,
      issuedAtTick: token.issuedAtTick,
    };
    let sigOk = false;
    try {
      sigOk = edVerify(
        null,
        Buffer.from(canonicalize(tokenCore)),
        createPublicKey(this.trustedVerifierPem),
        Buffer.from(token.verifierSig, "hex"),
      );
    } catch {
      sigOk = false;
    }
    if (!sigOk) return { transmitted: false, reason: "token signature not from trusted verifier", busFrames: [] };

    // 2. token must authorize the EXACT code we are about to transmit
    if (token.codeHash !== hashOf(block.payload.script))
      return { transmitted: false, reason: "token codeHash != script about to send", busFrames: [] };

    // 3. token must be for the rail/envelope we are driving
    if (token.envelopeHash !== hashOf(env))
      return { transmitted: false, reason: "token envelope != target rail envelope", busFrames: [] };

    // Authorized: serialize ops to bus frames (mocked Bluetooth/diagnostic write).
    const busFrames = block.payload.script.ops.map(
      (o, i) => `BT> [${block.payload.script.target}] frame#${i} ${JSON.stringify(o)}`,
    );
    return { transmitted: true, reason: "verifier-signed token valid for this exact code", busFrames };
  }
}
