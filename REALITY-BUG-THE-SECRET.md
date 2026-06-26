# Reality Bug Report: **The Shared Secret**

*Companion to `REALITY-BUG-THE-FIRM.md`, `REALITY-BUG-THE-PRICE.md`, and the
running `aegis/` prototype. This one is deleted in code: `aegis/src/auth/keyless.ts`,
wired into `aegis/src/verifier/androidBridge.ts`, demonstrated by
`npm run demo:keyless`.*

The previous reports deleted Trust, Ownership, Currency, the Credential, the Firm,
and the Price. This one deletes the thing that still guards every door between
them: **the secret you must know to be let in.**

---

## 1. Hidden Assumption

That **authorization requires knowing something** — a password, a PIN, an API key,
a bearer token, a session cookie, a private key kept in a file. Access is "a secret
you hold." Prove you hold it once, and you are *in*: logged in, holding a session,
trusted until logout. Identity becomes a **noun** — a thing you *have*.

---

## 2. Why It Exists

The shared secret is a **workaround for the cost of proving identity continuously.**
Cryptographic proof was, historically, far too expensive to perform on every single
action. So we did the cheap thing: prove identity *once*, expensively, at the door
(type the password), then issue a cheap stand-in — a session, a token, a cookie —
that says "this party already proved themselves." For the rest of the interaction,
everyone just trusts the stand-in.

Every term of that bargain is a concession to the era's constraints:

- *Computational:* per-message public-key signatures were too slow/costly to do
  on everything, so we amortized one authentication over a long session.
- *Hardware:* there was no cheap, ubiquitous secure element to hold a
  non-extractable key and sign continuously, so secrets had to be *known* (and
  therefore *stored*, *typed*, *transmitted*, *copied*).
- *Architectural:* servers needed something on file to check you against — a
  password hash, a key, a token — so the secret had to live on **both** sides.

That last one is the whole vulnerability in one sentence: **to verify a secret, the
verifier must store something about it.** And anything stored can be stolen.

---

## 3. Why It Became Obsolete

Both constraints lifted. Modern phones ship a **TEE / StrongBox secure element**
that holds a non-extractable private key and signs in microseconds. ed25519
verification is trivially cheap. We can now afford to prove identity **on every
single command** instead of once per session — the exact thing the shared secret
was invented to avoid.

Once continuous proof is affordable, the entire apparatus of stored secrets is not
just unnecessary, it is **pure liability**:

- Password databases, key vaults, token stores — all exist only because we couldn't
  prove identity continuously. They are the single richest target in computing, and
  they exist for a reason that no longer holds.
- A session is a window of *unverified trust* — minutes or hours where the system
  assumes you are still you because you were, once. Session hijacking, token theft,
  replay, and "stolen API key" breaches are all attacks on that window. The window
  itself is the bug.

The workaround outlived its cause. Delete it.

---

## 4. Replacement Primitive — Authorization as a Verb (the Keyless Bridge)

Identity stops being something you *have* and becomes something you *do*, freshly,
in the instant you ask to act. There is no login, no session, no stored secret on
either side. There is only a continuous stream of one-shot proofs.

```
                         ContinuousAuthority (Jarvis / the bridge)
                         stores ONLY public anchors — no secret about anyone
   agent (TEE)  ───────────────────────┬───────────────────────────────────
   non-extractable                     │  per operation:
   private key                         │  1. authority issues a FRESH challenge:
        │                              │       { nonce, counter, contextHash,
        │   2. TEE signs the challenge │         expiry }  bound to THIS op
        │      (the only thing the     │       (codeHash + envelopeHash of the
        │       key ever does)         │        Aegis-approved operation)
        ▼                              │  3. authority verifies the signature
   fresh_challenge_response  ──────────┘     against the public anchor, consumes
   (replaces the password)                   the nonce, advances the counter
                                             → AUTHORIZED for ONE op, then gone
```

Two properties make it a primitive, not a feature:

- **Continuous Cryptographic Posture.** Every command carries a *new* ed25519
  signature from the secure element. Authorization is not a state you enter; it is
  a thing you re-prove continuously. There is no "logged in."
- **Context-Bound Authorization.** The challenge embeds the **Aegis operation
  identity** (`codeHash` + `envelopeHash` from the Physics-Shield ExecutionToken).
  The agent is never "authorized" in general — it is *authorized only for this one
  physical operation, which has already passed the safety envelope.* A proof for one
  op is meaningless for any other.

In `keyless.ts`: `TeeSigner` (the client, a non-extractable hardware key —
`SoftwareTeeSigner` is the demo stand-in with the identical interface), and
`ContinuousAuthority` (the orchestrator, holding only `PublicAnchor`s). Each emit in
`androidBridge.ts` now demands a `fresh_challenge_response` **on top of** the
verifier token — and any failure trips the **Kill-Switch**, severing the
Bluetooth/USB channel in the same instant as the refusal.

---

## 5. Attack Results — why credential theft is *structurally* dead

`npm run demo:keyless` runs these live. Every one fails by construction, not by
policy:

| Attack | What the thief does | Result | Why |
| --- | --- | --- | --- |
| **Replay** | captures a valid proof, resends it | `REPLAY` | the nonce is single-use and already consumed; the counter has advanced |
| **Cross-operation** | takes a real proof for op A, presents it for op B | `CONTEXT_MISMATCH` | the proof's `contextHash` is bound to A's code+envelope; B's differs |
| **Steal the whole server store** | exfiltrates the authority's entire state | useless | it contains only **public anchors** — "no private keys, no passwords, no session tokens are stored here" |
| **Have the public anchor, sign with own key** | claims the victim's identity | `ANCHOR_MISMATCH` / `BAD_PROOF` | without the non-extractable private key, no valid signature can be produced |
| **Use a stale proof** | presents a proof after its window | `EXPIRED` | challenges live for a few ticks and die |

The deep reason there is nothing to steal:

1. **The verifier stores no secret.** A classic system must keep *something* to
   check you against (a hash, a key, a token) — and that store is the prize. The
   `ContinuousAuthority` keeps only public keys. Dumping its entire memory grants an
   attacker exactly the access that public keys grant: none.
2. **The private key never moves.** It is generated inside the TEE and is
   non-extractable. It is never typed, transmitted, copied, or stored on a server.
   There is no wire it travels on and no database it sits in. You cannot steal what
   never leaves the silicon.
3. **A captured proof is a dead bit.** Even a perfect man-in-the-middle who records
   a valid `fresh_challenge_response` holds something that authorizes *one already-
   approved operation* for a few hundred milliseconds — single-use, expiring,
   context-locked. There is no session behind it to ride into.

Credential theft presumes a credential that is (a) stored somewhere and (b) reusable
once taken. Continuous Proof has neither property. The attack class doesn't get
mitigated — it loses its target.

---

## 6. Surviving Design

`fresh_challenge_response` = `{ challenge, proofHex, publicKeyPem }`, verified each
emit against five independent gates, every one fatal: pinned-anchor match, this-
authority, not-expired, nonce-unconsumed, counter-monotonic, context-bound, and a
valid signature. Success consumes the nonce and advances the counter, so the proof
can never be used again, for anything. Any failure fires the Kill-Switch.

This composes with the rest of Aegis: the **ExecutionToken** says *the code is safe*
(Physics Shield), and the **challenge-response** says *you may act on this exact safe
op, right now, and you can prove it this instant*. Neither alone moves the bus.

---

## 7. 30-Day Prototype

Built and runnable:

```bash
cd aegis && npm run demo:keyless
```

Demonstrates the legitimate per-operation proof plus replay, cross-op, stolen-store,
spoofed-anchor, and expired attacks — all blocked, Kill-Switch firing on each. The
next 30 days move `SoftwareTeeSigner` onto a real **Android Keystore StrongBox** key
(same interface, native `sign()`), and harden the clock (monotonic, signed time) so
expiry can't be rewound. The Aegis Terminal app already abstracts the signer behind
an interface, exactly as it abstracts the serial wire — drop-in.

---

## 8. Long-Term Civilization Impact

When authorization becomes a verb, three things change.

**The credential-breach era ends.** The recurring catastrophe of the password
age — the leaked database, the stolen key, the hijacked session, the phished token —
is not patched; it is *deprived of its object.* You cannot have a "stolen credentials"
breach in a system that holds no credentials. The single largest category of computer
crime loses its target surface.

**Trust stops being a window and becomes a pulse.** Today, "authenticated" is a
duration — a session you are inside, vulnerable for as long as it lasts. With
continuous proof, trust exists only at the instant of action and nowhere between. A
compromised channel grants nothing, because there is no standing authority flowing
through it — only one-shot, context-locked proofs that expire as fast as they appear.

**Identity binds to physical presence, not to knowledge.** Because the key lives in
the secure element of a specific device, "who authorized this" stops meaning "who
knew the secret" (which could be anyone who phished it) and starts meaning "which
physical object was present and proved itself." This is what turns the phone from a
screen into the **Aegis Sentinel** — a cryptographic key to physical truth. It is
what lets a workshop run unattended overnight (`Energy-Swarm Ownership`: devices
authorized per-operation by their own keys, not by a logged-in human), what makes the
`Physical Truth Ledger` admissible (every actuation carries a live proof of *which
device, at which instant, under which value-vector*), and what powers
`Trust-Free Supply Chain` checks (a part proves its identity by signing a live
challenge from its secure element, not by wearing an "Original" sticker).

The honest caveat: this moves the entire root of trust into the secure element and
the integrity of the device that holds it. A compromised TEE, a malicious-but-signed
challenger, or a rolled-back clock are the real remaining threats — which is why the
hardening list (StrongBox keys, signed monotonic time, attested device integrity) is
the actual next work. But the *class* of attack that has defined insecurity for fifty
years — the stolen secret — is gone, because we stopped keeping secrets to steal.

---

*Seven deletions, one search. Trust, Ownership, Currency, the Credential, the Firm,
the Price — and now the Secret. Each removed something we mistook for a law of
reality and found to be a workaround for a vanished limitation. The Secret was the
last noun standing in the way: the idea that to be trusted you must **hold**
something. You don't. You prove it, freshly, every time you act — or the wire goes
cold.*
