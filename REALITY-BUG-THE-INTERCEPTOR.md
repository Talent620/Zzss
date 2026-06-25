# Reality Bug Report: **The Interceptor**

*Companion to the running `aegis/` prototype. Deleted in code: `aegis/src/auth/challenge.ts`
and `aegis/src/hw/sentinel.ts`, demonstrated by `npm run demo:witness`.*

The previous reports deleted Trust, Ownership, Currency, the Credential, the Firm,
the Price, and the Shared Secret. This one deletes the assumption that hides inside
every "hacking tool" you can buy: that to interact with the physical world you must
**capture, store, and replay its signals.**

---

## 1. Hidden Assumption

That a physical protocol — NFC, RF, infrared, a garage remote, a key fob — is a
**recording to be copied.** The Interceptor paradigm (the Flipper Zero being its
folk hero) treats the world as a tape: sniff the bytes, store them, replay them
bit-perfect, and the lock opens. The physical device is assumed to be *dumb* — a
playback machine that cannot tell a live counterpart from a recording of one.

---

## 2. Why It Exists

Replay works because most physical protocols were designed for an era when the
**emitter was cheap and the verifier was dumb.** A 433 MHz garage remote, a 125 kHz
prox card, an IR blaster — these send a *static* code outward and hope nobody is
listening. There was no room in the silicon (and no threat model in the designer's
head) for a live cryptographic exchange, so "presence" was encoded as "knows the
fixed code." Capture the fixed code, and you *are* present, forever.

The Interceptor is not a sophisticated attack. It is the **logical endpoint of a
world built from static, replayable signals.** It is a hack that exploits a design
assumption — that broadcasting a constant is the same as being there.

---

## 3. Why Copying Signals Is a Dead End

Bit-perfect replication is a dead end for one structural reason: **it proves the
past, not the present.** A captured signal is evidence that the genuine device
emitted something, once, somewhere. It is not, and can never be, evidence that the
genuine device is *here, now, and willing.* As soon as the verifier is allowed to
ask a fresh question, the recording has no answer.

Everything the Interceptor world does to patch this — rolling codes, longer keys,
encrypted payloads — is still inside the same frame: the device *emits* and the
attacker *captures*. Rolling codes raise the cost of replay; they do not change its
nature. The frame itself — *the world is a tape* — is the bug. You cannot fix a tape
by recording it better.

---

## 4. Replacement Primitive — The Verified Witness

Invert the direction of trust. The phone stops being a **receiver that copies** and
becomes a **Sentinel that interrogates.** It never clones anything. It *forces the
target into a live protocol state* and demands a fresh proof that only the genuine
device can produce in the moment.

```
INTERCEPTOR (dead)                       VERIFIED WITNESS (the primitive)
─────────────────                        ──────────────────────────────
device emits a fixed code     →          Sentinel issues a FRESH challenge
attacker captures the bytes   →          device must answer THIS nonce, live
attacker replays the bytes    →          answer = proof of key/state, right now
"presence" = knows the code              "presence" = solved the live challenge
proves the PAST                          proves the PRESENT
```

Three witnessing methods, so even near-powerless hardware can be witnessed
(`challenge.ts`):

- **`ed25519`** — the device signs the nonce with its own private key. Asymmetric
  proof of key possession; the Sentinel needs only the device's *public* anchor.
- **`ascon-mac`** — the device MACs the nonce with a shared symmetric key (modelled
  with HMAC as a stand-in for **ASCON-MAC**, NIST's lightweight-crypto standard for
  constrained MCUs). For a BMS or sensor too small for public-key math.
- **`timing`** — the device echoes the live nonce within a tight latency window.
  This proves *physical state/presence* rather than key possession: a genuine
  device answers in microseconds-to-milliseconds; a **relay** (forwarding the
  challenge to a real device elsewhere) or a **replay** adds latency that cannot be
  hidden, and fails the window.

The result of a successful exchange is not "the door opens." It is a **Physical
Presence Proof** (`sentinel.ts`): a record, signed inside the phone's **TEE**,
binding `{ time, gps, challengeResult, AegisSignature }`. It uses the *same*
hardware root of trust as the keyless bridge (`keyless.ts`) — one TEE key for the
whole system. The proof says: *device X was genuinely present, at this time, at this
place, and proved it live to this phone.* No captured-and-replayed signal can
manufacture that.

---

## 5. Adversarial Destruction (and the mitigations, in code)

`npm run demo:witness` runs every one of these:

| Attacker | Attack | Result | Mitigation |
| --- | --- | --- | --- |
| **Hacker** | capture a genuine response, replay bit-perfect against the next session | `NONCE_MISMATCH` | every challenge carries a fresh, TEE-bound nonce; the gate was never asked *this* question |
| **Hacker** | replay a valid response within the same nonce | `REPLAY` | single-use nonce ledger burns each nonce on first acceptance |
| **Systems Engineer** | the end device is too weak for ed25519 | *witnessed anyway* | `ascon-mac` (lightweight symmetric MAC) or the `timing` proof-of-state path |
| **Relay attacker** | forward the challenge to a real device elsewhere, relay the answer back | `TOO_SLOW` | timing window: relay latency (130 ms) blows past the threshold (50 ms) |
| **Forger** | take a genuine proof and relocate it in space/time | proof fails verification | `time` + `gps` are inside the TEE-signed body; changing either breaks the AegisSignature |

The Interceptor's entire toolkit — sniff, store, replay, relay — is defeated not by
out-running it but by **removing the thing it operates on.** There is no static
signal to capture, because the Sentinel never asks the same question twice.

---

## 6. The 'Verified Witness' Flow — from challenge to authorization

```
        ┌──────────┐
        │  IDLE    │   operator taps "witness target"
        └────┬─────┘
             │ Sentinel mints a FRESH, single-use, TEE-bound nonce
             ▼
        ┌──────────────┐   transmitChallenge() over NFC / RF / IR / BLE
        │  CHALLENGED  │ ───────────────────────────────────────────────►  TARGET DEVICE
        └────┬─────────┘                                                    (state machine)
             │ awaitResponse(timeout)                                            │
             │ ◄─────────────────────────────────────────────────────────  solves live:
             │   DeviceResponse { nonceHex, payloadHex, latencyMs }          ed25519 sig /
             ▼                                                                ascon MAC / echo
     ┌───────────────────────── verifyResponse() ─────────────────────────┐
     │  expired?            → EXPIRED                                       │
     │  nonce ≠ challenge?  → NONCE_MISMATCH   (captured/old signal)        │
     │  nonce consumed?     → REPLAY           (single-use ledger)          │
     │  method check:                                                      │
     │     ed25519  → signature valid against device public anchor?         │
     │     ascon-mac→ MAC matches shared key?                               │
     │     timing   → echo == nonce AND latency ≤ window?  (relay = slow)   │
     └───────┬──────────────────────────────────────────────┬─────────────┘
             │ pass                                          │ fail
             ▼                                               ▼
       ┌───────────┐                                   ┌───────────┐
       │ VERIFIED  │                                   │ REJECTED  │  (no proof; nothing trusted)
       └────┬──────┘                                   └───────────┘
            │ sealProof(): bind { time, gps, result } and TEE-SIGN it
            ▼
   ┌──────────────────────────────────────────────────────────┐
   │  PHYSICAL PRESENCE PROOF                                   │
   │  { targetId, protocol, method, nonce, result:"VERIFIED",  │
   │    time, gps, witnessDeviceId, AegisSignature }           │  ← anyone can verifyProof()
   └──────────────────────────────────────────────────────────┘
            │
            ▼  feeds the same trust fabric as the rest of Aegis:
   authorization (keyless.ts) · the Physical Truth Ledger · supply-chain checks
```

---

## 7. Long-Term Impact — the era of Witnessing

When devices are witnessed instead of intercepted, three things change.

**The clone economy collapses.** An entire category of attack and an entire category
of product — the universal copier, the replay box, the cloned fob — lose their
premise. You cannot clone a thing whose identity is a *live cryptographic act* rather
than a *static emission.* The Flipper is not out-gunned; it is out of a job, because
there is no recording that means anything.

**Physical presence becomes provable, and therefore admissible.** A Physical Presence
Proof is portable evidence that *this specific device proved itself, here, now.* That
turns "were you there / was this genuine" from a matter of trust into a matter of
signature. It is what lets the workshop's `Physical Truth Ledger` be a court-grade
black box, what lets a `Trust-Free Supply Chain` check answer "is this flight
controller genuine?" by challenging the part's own secure element instead of reading
a sticker, and what lets autonomous `Energy-Swarm` devices recognize each other
without a human in the loop.

**Interaction replaces impersonation as the default.** The deepest shift is
philosophical: the Interceptor world assumes the physical world is *dumb and
spoofable*; the Witness world assumes every endpoint can be made to *prove its own
state in real time.* Security stops being a wall you hope holds and becomes a
question you can always ask again, a microsecond from now.

The honest caveat: witnessing pushes the root of trust into the device's secure
element and the integrity of the Sentinel's TEE and clock. A compromised secure
element, a device with no crypto at all (where only the weaker `timing` proof
applies), or a forged-but-validly-signed challenger remain the real frontier — which
is exactly why the timing path, attested device integrity, and signed monotonic time
are the next work. But the defining attack of the wireless age — *capture and
replay* — is gone, because we stopped treating the world as a tape and started
treating it as a counterparty that can answer.

---

*Eight deletions, one search. Trust, Ownership, Currency, the Credential, the Firm,
the Price, the Secret — and now the Interceptor. The phone stops being a thing that
listens and copies, and becomes a thing that asks and verifies. You no longer steal
the world's signals. You witness its truth — freshly, every time, or not at all.*
