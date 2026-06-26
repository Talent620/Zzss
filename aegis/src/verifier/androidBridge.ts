// androidBridge.ts — the physical-world gate (Android module), now KEYLESS.
//
// This stands at the very edge of the cyber-physical boundary. It owns the
// Bluetooth / diagnostic-connector handle. It energizes the bus ONLY when BOTH
// independent proofs are present for the EXACT operation in hand:
//
//   1. an ExecutionToken signed by the trusted verifier  (the Physics Shield said
//      this code is safe), AND
//   2. a fresh_challenge_response proving live possession of the agent's
//      hardware-bound key for THIS operation  (Authorization as a Verb).
//
// There are no sessions and no stored secrets. Every single packet carries a new
// cryptographic challenge-response; a captured one is worthless. Any failure —
// physics OR authorization — fires the Kill-Switch, severing the channel in the
// same breath as the refusal. The bus's default state is cold.

import { verify as edVerify, createPublicKey } from "node:crypto";
import { hashOf, canonicalize } from "../core/canonical.ts";
import type { AttestationBlock } from "../core/attest.ts";
import type { ExecutionToken } from "./verify.ts";
import type { HardwareEnvelope } from "../sim/physics.ts";
import { ContinuousAuthority } from "../auth/keyless.ts";
import type { Challenge, ChallengeResponse, OperationContext } from "../auth/keyless.ts";

export interface EmitResult {
  transmitted: boolean;
  reason: string;
  busFrames: string[];
  killed?: boolean; // true if this refusal severed the channel
}

export class AndroidGuardBridge {
  trustedVerifierPem: string;
  authority: ContinuousAuthority;
  // The Kill-Switch: severs Bluetooth/USB the instant trust is broken. In the app
  // this drops the GATT connection / closes the USB port in < 1 ms.
  private killChannels?: () => void;

  constructor(trustedVerifierPem: string, authority: ContinuousAuthority, killChannels?: () => void) {
    this.trustedVerifierPem = trustedVerifierPem;
    this.authority = authority;
    this.killChannels = killChannels;
  }

  /** Operation identity that both the token and the auth proof must agree on. */
  private contextFor(block: AttestationBlock, token: ExecutionToken): OperationContext {
    return { deviceTarget: block.payload.script.target, codeHash: token.codeHash, envelopeHash: token.envelopeHash };
  }

  /**
   * Issue a fresh, single-use, context-bound challenge for one operation. The
   * agent must answer this with its TEE key before the bus will move.
   */
  requestChallenge(block: AttestationBlock, token: ExecutionToken, subjectId: string, tick: number): Challenge {
    return this.authority.issueChallenge(subjectId, this.contextFor(block, token), tick);
  }

  private kill(reason: string, busFrames: string[] = []): EmitResult {
    this.killChannels?.(); // sever the wire NOW, do not wait for a human
    return { transmitted: false, reason, busFrames, killed: true };
  }

  emit(
    block: AttestationBlock,
    token: ExecutionToken | undefined,
    env: HardwareEnvelope,
    response: ChallengeResponse | undefined,
    tick: number,
  ): EmitResult {
    // ── Physics Shield token (is this code safe?) ──
    if (!token) return this.kill("no execution token — bus stays cold");
    const tokenCore = { codeHash: token.codeHash, envelopeHash: token.envelopeHash, issuedAtTick: token.issuedAtTick };
    let tokenSigOk = false;
    try {
      tokenSigOk = edVerify(null, Buffer.from(canonicalize(tokenCore)), createPublicKey(this.trustedVerifierPem), Buffer.from(token.verifierSig, "hex"));
    } catch {
      tokenSigOk = false;
    }
    if (!tokenSigOk) return this.kill("token signature not from trusted verifier");
    if (token.codeHash !== hashOf(block.payload.script)) return this.kill("token codeHash != script about to send");
    if (token.envelopeHash !== hashOf(env)) return this.kill("token envelope != target rail envelope");

    // ── Keyless authorization (prove you may act, right now, on THIS op) ──
    if (!response) return this.kill("no fresh challenge-response — authorization is per-operation");
    const auth = this.authority.verifyResponse(response, this.contextFor(block, token), tick);
    if (!auth.authorized) return this.kill(`authorization refused [${auth.code}] ${auth.reason}`);

    // Both proofs hold, for this exact operation, in this instant. Energize.
    const busFrames = block.payload.script.ops.map(
      (o, i) => `BT> [${block.payload.script.target}] frame#${i} ${JSON.stringify(o)}`,
    );
    return { transmitted: true, reason: "verifier token + live key-possession proof valid for this exact op", busFrames };
  }
}
