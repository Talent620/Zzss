// attest.ts — the attestation primitive, RN port (ed25519 via @noble).
//
// A Proof-of-Thought binds, under one signature, the hashes of the agent's goal,
// its PowerScript, its safety claim, and its PREDICTED simulation. The signature
// proves authorship only — safety is decided by the on-device Physics Shield.

import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { canonicalize, hashOf } from "./canonical.ts";
import type { PowerScript } from "../sim/powerscript.ts";
import type { SimSummary } from "../sim/physics.ts";

// @noble/ed25519 needs a sha512; wire the pure-JS one once at module load.
ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

export interface SafetyClaim {
  invariant: "PEAK_VOLTS_LE";
  threshold: number;
}

export interface ProofOfThought {
  goalHash: string;
  codeHash: string;
  claimHash: string;
  resultHash: string;
}

export interface AttestationBlock {
  version: string;
  agentId: string;
  deviceId: string; // which device model this attestation targets
  tick: number;
  pot: ProofOfThought;
  payload: {
    goal: string;
    claim: SafetyClaim;
    script: PowerScript;
    claimedSim: SimSummary;
  };
  publicKeyHex: string;
  signature: string;
}

export interface AgentKey {
  agentId: string;
  privHex: string;
  pubHex: string;
}

export function newAgentKey(agentId: string): AgentKey {
  const priv = ed.utils.randomPrivateKey();
  const pub = ed.getPublicKey(priv);
  return { agentId, privHex: bytesToHex(priv), pubHex: bytesToHex(pub) };
}

export function attest(
  key: AgentKey,
  deviceId: string,
  tick: number,
  goal: string,
  claim: SafetyClaim,
  script: PowerScript,
  claimedSim: SimSummary,
): AttestationBlock {
  const pot: ProofOfThought = {
    goalHash: hashOf(goal),
    codeHash: hashOf(script),
    claimHash: hashOf(claim),
    resultHash: hashOf(claimedSim),
  };
  const sig = ed.sign(utf8ToBytes(canonicalize(pot)), hexToBytes(key.privHex));
  return {
    version: "aegis/1",
    agentId: key.agentId,
    deviceId,
    tick,
    pot,
    payload: { goal, claim, script, claimedSim },
    publicKeyHex: key.pubHex,
    signature: bytesToHex(sig),
  };
}

export function verifySignature(block: AttestationBlock): boolean {
  try {
    return ed.verify(
      hexToBytes(block.signature),
      utf8ToBytes(canonicalize(block.pot)),
      hexToBytes(block.publicKeyHex),
    );
  } catch {
    return false;
  }
}
