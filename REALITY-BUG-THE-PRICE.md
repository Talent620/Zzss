# Reality Bug Report: **Price as a Single Scalar**

*Fifth deletion. Companion to `REALITY-BUG-THE-FIRM.md`, `PRIMITIVES.md`, and the
running `aegis/` prototype. Where the firm report deleted the container of
coordination, this one deletes the **language** coordination speaks in.*

This bug is not described in the abstract — it is **deleted in running code**.
The replacement primitive ships as `aegis/src/market/vectorMatch.ts`, wired
directly into the Aegis verifier, and is demonstrated by `npm run demo:market`.

---

## 1. Hidden Assumption

That the terms of an exchange must compress to **one number**. A task is worth
`$15.00`. A trade clears at a price. Infinite-dimensional reality — energy spent,
scarce material consumed, compute occupied, failure risk incurred, hardware worn,
time elapsed, externality emitted — is projected down onto a single scalar, and
the scalar is treated as if it *were* the value.

---

## 2. Why It Exists

Price is a **lossy compression codec for value**, and like every codec it was
chosen for the decoder of its era. The decoders were a biological brain that
cannot hold a twelve-dimensional comparison in working memory, and a paper ledger
that has room for one column of figures. Against those constraints, collapsing
value to one fungible number was not a mistake — it was the only thing that
*fit*. A single scalar is totally ordered (you can always say which is bigger),
instantly comparable, and addable across a market. That tractability is the whole
benefit, and it was indispensable for as long as the decoder was a human mind.

Money is the same move applied to storage and transfer: erase every dimension so
value can travel and accumulate. Price erases dimensions so value can be
*compared*. They are one compression, performed twice.

---

## 3. Why It Became Obsolete

The decoder changed. In the Convergence (`REALITY-BUG-THE-FIRM.md`), the parties
negotiating a task are **autonomous agents**, not biological brains, exchanging
structured data, not haggling across a counter. For that decoder, scalar price is
no longer a convenience — it is **catastrophic bandwidth loss**. The agent on the
other side could have received the full vector — *this job costs 18.5 J, 250 ms,
0.94 risk, 10.2 wear-units* — and reasoned over all of it. Instead we hand it
`$0.002` and throw the other eleven dimensions in the bin, then act surprised when
the cheapest bid quietly maximized a hidden dimension we compressed away.

Worse, scalarization is the **attack surface itself**. The moment everything
reduces to one knob, there is exactly one knob to game. Every "race to the bottom,"
every externality, every hidden risk is the same failure: a dimension that
mattered got a weight of zero in someone's collapse-to-price, and the market, being
blind to it, rewarded its destruction. The compression didn't just lose
information — it lost *exactly the information needed to not get exploited.*

The constraint that forced the compression (a single-column decoder) is gone. The
compression is still running. That is the bug.

---

## 4. Replacement Primitive — The N-Dimensional Value Vector

Delete scalar price from the Convergence. Agents bid **value vectors**. In the
prototype the rail-control vector is:

```
ValueVector = [ energyJ, processingMs, errorRisk, hwDegradation ]   // all "lower is better"
```

The orchestrator does **not** re-collapse this into a weighted sum (that would
merely re-invent price with extra steps and hand the cartel its one knob back). It
keeps every dimension live, end to end, and selects with a rule that scalar price
cannot express: **pick the bid that is mathematically safest for the hardware,
not the cheapest** — adjudicated by the Aegis physics oracle.

Requirements met: it is **AI-agent-native** (vectors are how agents already think),
**global** (no shared currency required — dimensions are physical units), needs
**no central authority** (the verifier is a commons-able protocol, not a
priced exchange), and — per Phase 3 below — it is built to survive the attacks
that killed scalar markets.

---

## 5. Attack Results (Adversarial Sim)

**Year 1 — junk-vector flooding.** Agents spam the auction with fantasy bids:
*"0 energy, 0 ms, 0 risk, 0 wear."* In a self-reported scalar market this is just
"lying about your price," and it works until reputation slowly catches up.
→ **Defended structurally (D2).** No dimension is ever taken from the bidder. The
orchestrator **re-derives the entire vector from its own independent simulation**
(`deriveValueVector` over the Aegis ground-truth sim) and compares it to the
claim. A junk vector fails the honesty check instantly and is disqualified
(`VECTOR_DIVERGENCE`) — the same move that catches a hallucinated attestation in
Aegis WALL 1, now applied to the bid. *Demonstrated:* `AGENT-C` ships a real
script but claims a gentle vector; the orchestrator computes the true degradation
(10.2, not the claimed 0) and throws the bid out.

**Year 10 — single-dimension cartels.** A bloc of agents agrees to compete only on
the visible dimension everyone watches — *processing time* — while quietly
externalizing a hidden one, *hardware degradation*. They win every auction by
being fastest, and the rails wear out invisibly.
→ **Defended structurally (D2 + D3).** The "hidden" dimension is computed by the
orchestrator from the **temperature trace the simulator produces**, not reported by
the agent, so it cannot be hidden — there is nowhere to put it. And because the
selection rule is **Pareto-dominance plus hardware safety margin, never a single
weighted score (D3)**, there is no lone knob for the cartel to optimize. To "win"
they would have to actually be safest on the rail, which is the outcome we wanted.
*Demonstrated:* `AGENT-A` is faster and lower-energy — a scalar/price market takes
it — but it runs the rail to a 0.0227 safety margin, so the orchestrator passes it
over for `AGENT-B` at 0.1061.

**The safety gate (D1) — the wall above all dimensions.** Before any scoring, every
offer must pass Aegis `verify()`: integrity **and** the hardware envelope. No
vector, however attractive, buys a path past an envelope violation. *Demonstrated:*
`AGENT-D` offers the most "compute" but drives the rail to 14.8 V; it never reaches
the auction floor (`AEGIS_REJECT`). **Safety is a gate, not a tradeable dimension.**

---

## 6. Surviving Design

```
agents ──► ValueVector bids ──►            ORCHESTRATOR (vectorMatch.ts)
                                 ┌──────────────────────────────────────────┐
                                 │ D1  Aegis verify(): integrity + envelope  │ unsafe / lying-about-sim
                                 │      → disqualify (AEGIS_REJECT)          │ ───────────────► out
                                 │ D2  re-derive vector from trusted sim;    │ claim ≠ reality
                                 │      compare to claim                     │ ───────────────► out (VECTOR_DIVERGENCE)
                                 │ D3  Pareto filter, then select by         │
                                 │      hardware SAFETY MARGIN (not cost)    │
                                 └──────────────────────────────────────────┘
                                                   │
                                                   ▼
                                      winner = mathematically safest admissible bid
```

Three defenses, each fatal on its own: **(D1)** safety is a gate above the vector;
**(D2)** every dimension is independently re-derived, so nothing is self-reported;
**(D3)** no global scalarization, so the vector never collapses back into a price a
cartel can game. The prototype typechecks clean and runs on Node ≥ 22.6 with no
runtime dependencies.

Files: `aegis/src/market/vectorMatch.ts` (the auction), `aegis/src/sim/physics.ts`
(extended to emit `energyJ`, `durationMs`, and a temperature trace as trusted
dimensions), `aegis/src/demo/market.ts` (the four-bidder demonstration).

---

## 7. 30-Day Prototype

Already built and runnable:

```bash
cd aegis && npm run demo:market
```

Two agents bid to "optimize an algorithm," expressed as two power/thermal profiles
on a regulated rail. Agent A is faster and lower-energy; Agent B is gentler on the
silicon. A naive price-picker takes A. The Aegis-backed orchestrator re-simulates
both, derives their true vectors, disqualifies a liar (C) and an unsafe bid (D),
and awards the work to **B — the safer bid — explicitly not the cheaper one.** The
next 30 days harden it the same way Aegis must be hardened: a validated device
model as the dimension oracle, tolerance-banded (not bit-exact) vector comparison
for floating-point determinism, and standing/slashing on `VECTOR_DIVERGENCE` so a
caught liar pays in reputation across the Convergence.

---

## 8. Long-Term Civilization Impact — Removing Classical Money from Machine Systems

When machines stop pricing things, three layers shift.

**Externalities lose their hiding place.** Every cost that scalar money let an
actor shove off its own books — wear, risk, energy, heat, depletion — becomes a
*named dimension that the counterparty computes for itself.* You cannot externalize
what the other side independently measures. The structural pathology of the priced
economy — that the ledger literally cannot see what it destroys — does not get
regulated away; it becomes **unrepresentable**, because there is no single number
left to hide the damage inside.

**Coordination gets its bandwidth back.** Machine economies stop arguing about *how
much* and start negotiating about *what shape*: trading energy for time, risk for
durability, latency for wear, along a Pareto surface no scalar could express. Whole
classes of optimization that were invisible to price — "cheapest that also never
endangers the hardware," "fastest within a wear budget" — become first-class, sayable
goals. This is the same unlock as deleting the firm: a constraint we mistook for the
nature of value turns out to have been a property of the *decoder*, and removing it
widens what can be coordinated at all.

**Value re-pluralizes.** Money's deepest effect was making everything commensurable —
one axis along which a forest, an hour, and a risk could all be ranked. Removing the
single scalar from machine exchange means there is **no universal axis** by which one
kind of value silently dominates another; safety simply is not on the same line as
speed, and cannot be bought with it. Power stops concentrating wherever the single
number pools, because there is no single number to pool. The market keeps clearing —
it just clears in the shape of the real trade-off instead of the shadow of it.

The risk is real and worth stating: multidimensional clearing is harder, can be
gamed by *which* dimensions get measured, and a lazy implementation will quietly
re-scalarize (a fixed weight vector **is** a price). The discipline that keeps it
honest is exactly D1–D3: measure the dimensions yourself, never collapse them to one
number, and put safety on a wall above the trade entirely.

---

*Five deletions, one search. Trust, Ownership, Currency, the Credential, the Firm —
and now the Price itself. The first four removed who and what you must defer to. The
fifth removes the **language** of deference: the flat number that told a brain and a
ledger "this is all you need to know." Machines need to know more than that. So we
let them say more than that — and we built the gate that makes them prove it.*
