// sentinel.ts — The Sentinel. A phone that WITNESSES physical devices instead of
// intercepting them.
//
// The target (an NFC reader, an RF gate, a BMS) is modelled as a PROTOCOL STATE
// MACHINE. The Sentinel drives it through a live challenge/response and, only if
// the device proves possession of its key (or its genuine physical state), emits a
// Physical Presence Proof: a TEE-signed record binding {time, gps, challengeResult,
// AegisSignature}. The proof says "device X was genuinely here, now, and proved it
// to this phone" — something no captured-and-replayed signal can ever manufacture.

import { canonicalize } from "../core/canonical.ts";
import {
  issueChallenge,
  verifyResponse,
} from "../auth/challenge.ts";
import type {
  ChallengeMethod,
  DeviceResponse,
  VerifyContext,
  WitnessChallenge,
  WitnessProtocol,
  WitnessVerdict,
} from "../auth/challenge.ts";
import type { TeeSigner } from "../auth/keyless.ts";
import { verify as edVerify, createPublicKey } from "node:crypto";

export type SentinelState = "IDLE" | "CHALLENGED" | "VERIFIED" | "REJECTED" | "TIMEOUT";

export interface GpsFix {
  lat: number;
  lon: number;
  accuracyM: number;
}

/** The NFC / RF / IR seam. Plug real radios in here (like SerialTransport for the bus). */
export interface PhysicalChannel {
  // TODO(plug-in): NFC -> android.nfc, RF -> SDR/CC1101, IR -> ConsumerIrManager.
  transmitChallenge(challenge: WitnessChallenge): Promise<void>;
  awaitResponse(timeoutMs: number): Promise<DeviceResponse>;
}

/** The witness record. Anyone can later verify it with verifyProof(). */
export interface PhysicalPresenceProof {
  v: "aegis.witness/1";
  targetId: string;
  protocol: WitnessProtocol;
  method: ChallengeMethod;
  challengeNonceHex: string;
  challengeResult: "VERIFIED";
  latencyMs: number;
  time: number; // logical/real timestamp of the witnessing
  gps: GpsFix;
  witnessDeviceId: string; // the phone's TEE subject id
  proofPubPem: string; // the phone's TEE public key
  aegisSignature: string; // TEE signature over canonicalize(everything above)
}

export interface SentinelEnv {
  signer: TeeSigner; // the phone's TEE key — produces the AegisSignature
  now: () => number; // time source (logical in tests; SystemClock in app)
  gps: () => GpsFix; // location source
}

export class Sentinel {
  private env: SentinelEnv;
  private consumed = new Set<string>(); // single-use nonce ledger (TEE-bound)
  state: SentinelState = "IDLE";

  constructor(env: SentinelEnv) {
    this.env = env;
  }

  /**
   * One witnessing exchange against a target device, end to end.
   * IDLE -> CHALLENGED -> (VERIFIED | REJECTED | TIMEOUT).
   */
  async witness(
    channel: PhysicalChannel,
    protocol: WitnessProtocol,
    targetId: string,
    method: ChallengeMethod,
    ctx: VerifyContext,
    opts: { ttlTicks?: number; maxLatencyMs?: number; timeoutMs?: number } = {},
  ): Promise<{ verdict: WitnessVerdict; proof?: PhysicalPresenceProof }> {
    const tick = this.env.now();
    const challenge = issueChallenge(protocol, targetId, method, tick, opts);
    this.state = "CHALLENGED";

    await channel.transmitChallenge(challenge);

    let response: DeviceResponse;
    try {
      response = await channel.awaitResponse(opts.timeoutMs ?? 1000);
    } catch {
      this.state = "TIMEOUT";
      return { verdict: { verified: false, code: "BAD_RESPONSE", reason: "no response (timeout)" } };
    }

    const verdict = verifyResponse(challenge, response, ctx, this.consumed, this.env.now());
    if (!verdict.verified) {
      this.state = "REJECTED";
      return { verdict };
    }

    this.state = "VERIFIED";
    return { verdict, proof: this.sealProof(challenge, verdict) };
  }

  /** Bind the verified result to time + place and TEE-sign it. */
  private sealProof(challenge: WitnessChallenge, verdict: WitnessVerdict): PhysicalPresenceProof {
    const body: Omit<PhysicalPresenceProof, "aegisSignature"> = {
      v: "aegis.witness/1",
      targetId: challenge.targetId,
      protocol: challenge.protocol,
      method: challenge.method,
      challengeNonceHex: challenge.nonceHex,
      challengeResult: "VERIFIED",
      latencyMs: verdict.latencyMs ?? 0,
      time: this.env.now(),
      gps: this.env.gps(),
      witnessDeviceId: this.env.signer.subjectId,
      proofPubPem: this.env.signer.publicAnchor().publicKeyPem,
    };
    // The AegisSignature is produced by the SAME TEE key used to authorize bus
    // writes (keyless.ts) — one hardware root of trust for the whole system. It
    // covers time + gps + challengeResult, so the proof cannot be relocated in
    // time or space without breaking the signature.
    const aegisSignature = this.env.signer.signMessage(canonicalize(body));
    return { ...body, aegisSignature };
  }

  /** Anyone, later, can verify a Physical Presence Proof is authentic + untampered. */
  static verifyProof(proof: PhysicalPresenceProof): boolean {
    const { aegisSignature, ...body } = proof;
    try {
      return edVerify(null, Buffer.from(canonicalize(body)), createPublicKey(proof.proofPubPem), Buffer.from(aegisSignature, "hex"));
    } catch {
      return false;
    }
  }
}
