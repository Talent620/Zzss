# Reality Bug Report: **The Schedule**

*Companion to the running `aegis/` prototype. Deleted in code:
`aegis/src/ledger/condition.ts`, demonstrated by `npm run demo:condition`.*

The previous reports deleted Trust, Ownership, Currency, the Credential, the Firm,
the Price, the Shared Secret, and the Interceptor. This one deletes the assumption
that governs the entire physical-maintenance economy: that the right time to act on
a machine is told by a **calendar**, not by the machine's actual state.

This realizes the "Physical Truth Ledger / black box for machines" idea directly.

---

## PHASE 1–2 — Reality Audit & Bug Detection

Among the standing audit of ~20 assumptions (the firm, the price, the secret, the
credential, the deed, the census, representative voting, the standing army, mass
schooling, **the maintenance schedule**, …), the schedule wins this round's
**(cost imposed) / (benefit still provided)** ratio for a clean reason:

- *Cost:* astronomically high and split two ways. Calendar maintenance **discards
  healthy parts** (most of a serviced fleet's replaced components had plenty of life
  left → mountains of e-waste and spend) **and simultaneously misses parts that wore
  out early** (the failure between scheduled checks). Warranties, insurance, and
  resale all run on dates and odometers — proxies that are wrong in both directions.
- *Benefit still provided:* shrinking fast. The only reason to use a schedule was
  that we **could not cheaply and verifiably know a part's true accumulated stress.**
  That is exactly what cheap sensing plus a signed, witnessed ledger now provides.

Highest ratio of the round. Selected: **the maintenance schedule** (and the
calendar/odometer-based notion of physical condition it stands for).

---

## PHASE 3 — Root Cause Analysis

The schedule is a **workaround for unobservable internal state.** You replace the
timing belt at 100,000 km not because 100,000 km is meaningful, but because in 1960
there was no way to know the belt's real fatigue, so a population-average number was
the safest cheap guess. Every term is a concession to a vanished limitation:

- *Technological:* no cheap continuous sensing of stress (temperature, current,
  cycles, vibration), and no tamper-evident way to *accumulate* it over a part's
  life, so a date stood in for the integral of wear.
- *Coordination:* a buyer, a seller, an insurer, and a mechanic had no shared,
  trustworthy record of what a part had actually been through — so they all fell
  back on the one number everyone could see: age.
- *Biological:* humans can't track the lifetime stress of a thousand components, so
  we batch them onto a service interval a person can remember.

Does it still serve its purpose? No. The purpose was "act before failure without
being able to see condition." We can now see condition — continuously, cheaply, and
provably. The proxy outlived the blindness it compensated for.

---

## PHASE 4 — Delete It

Remove the schedule entirely. No service intervals, no odometer limits, no
date-based warranties, no "replace every N." What collapses:

- **The maintenance industry's planning model** — work is no longer scheduled, it is
  *triggered.*
- **Warranty and insurance underwriting** — both are priced on age/mileage, which
  now mean nothing.
- **Resale valuation** — "low mileage" loses its meaning as a proxy for condition.
- **The mechanic's authority** — "trust me, it needs doing" has no calendar to lean
  on.

The rubble exposes the real question the schedule was answering and answering
badly: *what is this specific part's true, proven remaining life, right now?*

---

## PHASE 5 — Replacement Primitive: the Condition-Witnessed Lifecycle

Every actuation contributes a **witnessed stress sample** — derived from the same
trusted physics ground truth the Aegis Physics Shield uses (energy, thermal
overstress, duty cycles, peak excursion) — into a **hash-chained, TEE-signed ledger**
bound to one physical part. The part's health is read **purely from its proven
accumulated stress against a rated lifecycle envelope**, never from a date.

In `condition.ts`: `LifecycleEnvelope` (the part's rated budgets),
`deriveStress(sim)` (turn a trusted simulation into a stress sample), and
`ConditionLedger` (accumulate, hash-chain, TEE-sign, and `assess()` →
`HEALTHY | DEGRADED | RETIRE | CONDEMNED`). The ledger is the machine's **black
box**: `blackBox()` exports a portable, tamper-evident proof.json.

It satisfies the requirements: **agent-native** (autonomous machines write their own
condition records), **global / no central authority** (the ledger lives with the
part and is verifiable by anyone holding the public anchor), **adversary-resistant**
(hash-chained + signed: you cannot quietly rewrite history), **survives economic
incentives** (a seller can't roll back the truth; an insurer prices proven state),
and **survives evolution** (condition is measured, not declared, so gaming it means
actually being healthy).

---

## PHASE 6 — Adversarial Civilization Simulation

**Year 1.** *Seller rolls back the odometer / forges service history.* → Defeated:
condition is a **hash-chained, signed accumulation**, not an editable field. Altering
any past entry breaks the chain (demo scenario D). There is no odometer to roll back —
only a proof to invalidate.

**Year 10.** *A manufacturer ships a too-generous lifecycle envelope so parts "never"
retire.* → The envelope is itself a **signed manifest** (same trust model as the
physics models in the Aegis Terminal): an over-generous envelope is attributable and
falsifiable against field-failure data, and insurers simply price risk against the
*witnessed stress*, not the vendor's optimistic budget. Lying envelopes lose money.

**Year 50.** *Sensor spoofing — feed the ledger soft numbers to keep a worn part
"healthy."* → Stress samples derive from **witnessed facts** (the Witnessed-Fact
primitive): cross-attested, hardware-rooted readings, not a single self-report. A
spoofed sensor is a low-confidence witness and is discounted, exactly as in the
Physics-Shield sensor model.

**Year 100.** *The ledger format calcifies; a monopoly forms around "the" condition
database.* → There is no central database by construction — the record travels **with
the part**, content-addressed and signed, readable by any party. Condition is a
portable fact, not a platform.

Stable form: witnessed stress samples + rated signed envelope + hash-chained
TEE-signed ledger that lives with the part + insurers/warranties pricing proven state.

---

## PHASE 7 — 30-Day Prototype

Built and runnable:

```bash
cd aegis && npm run demo:condition
```

A drone-motor regulator accrues witnessed stress. The demo shows the calendar
**discarding a healthy part** (300 gentle ops, 30% of life used, calendar says
REPLACE), the calendar **keeping a worn-out part** (180 abusive ops, 104% of life
used, calendar says KEEP), a **fault sealing the exact stress vector at the moment of
failure** (the proof.json a workshop takes to the parts vendor), and **tamper-evidence**
(rewriting a past entry breaks the chain). Typechecks clean; runs on Node ≥ 22.6 with
no runtime deps. The next 30 days feed it real sensor streams (current/temp/vibration)
as cross-attested witnessed facts and publish the part's public anchor for
third-party verification.

---

## PHASE 8 — Long-Term Civilization Impact

**Maintenance becomes a sense, not a ritual.** Work happens when a part's proven state
crosses a threshold — never on a date. The fleet that today throws away good
components and is surprised by the rest instead acts exactly when, and only when,
reality requires it. The e-waste and the spend of replacing healthy hardware — and the
failures of trusting worn hardware — both fall away.

**"Condition" becomes a provable, portable fact, and a new economy grows on it.**
Warranties pay on demonstrated stress, not on a date a clerk can dispute. Insurance is
priced on what a machine actually endured. Resale value attaches to a signed black
box, not to a mileage number anyone can roll back. A used part stops being a gamble
and becomes a **read**. This is the workshop's "court over machines": you no longer
argue about whether a part was defective — you produce the signed stress vector it
carried at the instant it failed.

**Objects acquire a verifiable autobiography.** Every machine carries, with itself, the
true and unforgeable story of its own life. That is the deepest shift: physical
condition stops being a thing institutions *assert about* an object on a schedule, and
becomes a thing the object *proves about itself*, continuously.

The honest caveat: the guarantee reduces to the integrity of the sensors and the TEE
that signs the ledger. Sensor spoofing, a compromised secure element, and an
over-generous signed envelope are the real frontier — which is why witnessed (cross-
attested) facts and attested device integrity are the load-bearing next work. But the
defining waste of the industrial maintenance age — *acting on the calendar instead of
the truth* — is gone, because the machine can finally tell you the truth.

---

*Nine deletions, one search. Trust, Ownership, Currency, the Credential, the Firm,
the Price, the Secret, the Interceptor — and now the Schedule. We stopped asking the
calendar what condition a thing is in, and started letting the thing prove it.*
