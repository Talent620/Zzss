// attest.ts — THE PRIMITIVE. The decision kernel of the whole system.
//
// A Proof-of-Thought binds, under one signature, four hashes:
//   goalHash   — what the agent intends to achieve
//   codeHash   — the exact PowerScript it wants executed
//   claimHash  — the safety property it asserts holds
//   resultHash — the simulation results it PREDICTS
//
// The signature proves *authorship*, nothing more. It does NOT prove safety,
// and a perfectly valid signature over a dangerous or hallucinated claim is
// designed to be rejected downstream. Safety is decided by the verifier
// re-deriving reality (physics.ts) and comparing it to resultHash bit-for-bit.

import { generateKeyPairSync, sign, verify, createPublicKey } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { hashOf, canonicalize } from "./canonical.ts";
import type { PowerScript } from "../sim/powerscript.ts";
import type { SimSummary } from "../sim/physics.ts";

export interface SafetyClaim {
  invariant: "PEAK_VOLTS_LE"; // "peak rail voltage stays at or below threshold"
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
  tick: number; // logical clock; no wall-clock, so attestations are reproducible
  pot: ProofOfThought;
  // Plaintext payloads travel with the block so the verifier can recompute every
  // hash AND run its own independent simulation. `claimedSim` is the agent's
  // self-reported prediction — present only to be checked, never to be trusted.
  payload: {
    goal: string;
    claim: SafetyClaim;
    script: PowerScript;
    claimedSim: SimSummary;
  };
  publicKeyPem: string;
  signature: string; // ed25519 over canonicalize(pot), hex
}

export interface AgentKey {
  agentId: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
  publicKeyPem: string;
}

export function newAgentKey(agentId: string): AgentKey {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return { agentId, privateKey, publicKey, publicKeyPem };
}

/** Pack a Proof-of-Thought and sign it. This is how the agent "asks permission". */
export function attest(
  key: AgentKey,
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
  const signature = sign(null, Buffer.from(canonicalize(pot)), key.privateKey).toString("hex");
  return {
    version: "aegis/1",
    agentId: key.agentId,
    tick,
    pot,
    payload: { goal, claim, script, claimedSim },
    publicKeyPem: key.publicKeyPem,
    signature,
  };
}

/** Authenticity check: was this exact Proof-of-Thought signed by the named key? */
export function verifySignature(block: AttestationBlock): boolean {
  try {
    const pub = createPublicKey(block.publicKeyPem);
    return verify(
      null,
      Buffer.from(canonicalize(block.pot)),
      pub,
      Buffer.from(block.signature, "hex"),
    );
  } catch {
    return false;
  }
}
