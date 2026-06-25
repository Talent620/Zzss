# Aegis — Zero-Trust Autonomous Evolution

> An AI may write its own skills for the physical world. The physical world will
> not run them until the AI presents a mathematical proof — independently
> re-checked — that they are safe. The hardware is the last, unbribable judge.

Aegis is the buildable instantiation of the **attestation primitive** described
in this repository's paradigm documents (`PRIMITIVES.md`, Primitive I — *The
Witnessed Fact*). It applies that primitive to the most dangerous case: an
autonomous agent that writes code which moves real voltage on real silicon.

The thesis in one line: **trust the verifier and the physics model — both small,
fixed, and audited — never the agent's output.**

## The architecture

```
agent (Jarvis)                 guardian (Android device)            metal
──────────────                 ─────────────────────────            ─────
writes PowerScript  ──►  Proof-of-Thought (attest.ts)
predicts results              { goalHash, codeHash,
                                claimHash, resultHash } signed
                                       │
                                       ▼
                          verify()  ── WALL 1: integrity ──────────────────────┐
                            • signature valid?                                  │
                            • every payload hash == its PoT hash?               │ any
                            • RE-SIMULATE the code independently and compare    │ failure
                              to resultHash  →  ≠ 0 bits ⇒ hallucination, reject│  ⇒
                                       │                                        │ bus
                          ── WALL 2: physical envelope ──────────────────────  │ stays
                            • does the *independently simulated* ground truth   │ cold
                              obey the hardware limits (V / °C / A)?            │
                                       │                                        │
                                  ExecutionToken (signed by device) ───────────┘
                                       │
                                       ▼
                          AndroidGuardBridge.emit()
                            • token signed by trusted verifier?
                            • token bound to THIS exact codeHash?
                                       │
                                       ▼
                                Bluetooth / diagnostic write  ──►  hardware
```

### Two walls, both fatal

- **WALL 1 — integrity.** The signature only proves *authorship*. The decisive
  step is that the verifier **re-runs the simulation itself** (`physics.ts`) and
  compares to the agent's attested `resultHash`. One bit of divergence means the
  agent is hallucinating about physics → rejected (`SIM_DIVERGENCE`).
- **WALL 2 — envelope.** Even a perfectly honest, perfectly hashed attestation is
  rejected if the *independently simulated* outcome breaks the hardware limit
  (`ENVELOPE_VIOLATION`). Integrity is necessary, never sufficient.

A lie is caught by WALL 1. An honest-but-dangerous skill is caught by WALL 2.

## Run it

```bash
cd aegis
npm run demo          # the four hardware-safety scenarios (src/demo/run.ts)
npm run demo:market   # the N-dimensional Value Vector auction (src/demo/market.ts)
npm run demo:keyless  # Authorization as a Verb — credential theft is dead (src/demo/keyless.ts)
npm run demo:witness  # The Witness Protocol — interception/replay is dead (src/demo/witness.ts)
```

No dependencies are required to run the demo (pure Node ≥ 22.6 with native TS
type-stripping; `npm install` is only needed for `npm run typecheck`).

### What the demo shows (one rail, 13.2 V hard limit)

| Scenario | Agent does | Guardian verdict | Bus |
| --- | --- | --- | --- |
| **A** | safe 12.6 V profile, honest attestation | `OK` | energized |
| **B** | 14.8 V overdrive, **honest** attestation | `ENVELOPE_VIOLATION` (hashes match, physics unsafe) | cold |
| **C** | 14.8 V overdrive, **forged** safe-looking attestation | `SIM_DIVERGENCE` (125-bit mismatch) | cold |
| **D** | starts reckless, runs the **self-correction loop** | rejected 3× then `OK` at 12.9 V | energized |

## Files

| File | Role |
| --- | --- |
| `src/core/attest.ts` | **the primitive** — Proof-of-Thought packing, ed25519 sign/verify |
| `src/core/canonical.ts` | deterministic hashing + bit-distance |
| `src/sim/powerscript.ts` | the closed instruction set the agent is confined to (no `eval`) |
| `src/sim/physics.ts` | the trusted ground-truth simulator the verifier re-runs |
| `src/verifier/verify.ts` | the Hardware-in-the-Loop guardian (two walls) |
| `src/market/vectorMatch.ts` | N-dimensional Value Vector auction; picks the **safest** bid, not the cheapest |
| `src/verifier/androidBridge.ts` | the physical gate; emits to the bus only with a valid token |
| `src/agent/jarvis.ts` | the agent: writes skills, attests honestly or deceptively |
| `src/agent/selfCorrect.ts` | the self-correction loop: rewrite until the guardian relents |
| `src/demo/run.ts` | the four-scenario experiment |

## What is deliberately *not* trusted

- The agent's **code** — confined to a closed DSL, never native `eval`.
- The agent's **prediction** — re-derived from scratch by the verifier.
- The agent's **signature** — proves authorship only; a signed lie is still rejected.

## Threat model & honest limits

This prototype demonstrates the *control structure*, not a hardened product. To
deploy against real silicon you would additionally need:

1. **A trustworthy physics model.** The whole guarantee reduces to "the verifier's
   simulator matches reality." Replace `physics.ts` with a validated device model
   or a real hardware-in-the-loop rig; treat the model itself as the root of trust
   to be audited and versioned (its hash is already bound into the ExecutionToken).
2. **A protected verifier.** The guardian's key and code must live in a TEE /
   secure element so a compromised app process cannot mint its own tokens.
3. **Determinism end to end.** Floating-point divergence between agent and verifier
   would surface as false `SIM_DIVERGENCE`; production should fix-point or
   tolerance-band the comparison rather than hash a raw float trace.
4. **Replay/freshness.** Tokens here are bound to code + envelope; add nonces and
   expiry so an old token cannot be re-presented.

These are the right next 30 days of work — not changes to the primitive, which is
already complete and runnable above.
