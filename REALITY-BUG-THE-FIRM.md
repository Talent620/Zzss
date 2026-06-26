# Reality Bug Report: **The Firm**

*Civilization is running on hidden design decisions. Some are necessities. Some
are bugs — workarounds for limitations that no longer bind, never removed because
no one noticed the limitation lifted. This report hunts one bug to the root,
deletes it, and ships a 30-day patch.*

Companion to `PARADIGMS.md`, `PRIMITIVES.md`, and `ASSUMPTION-THE-CREDENTIAL.md`.
Those deleted Trust, Ownership, Currency, and the Credential. This one deletes the
thing that quietly contains all of them: **the organization as the unit of
coordination.**

---

## PHASE 1 — Reality Audit (20 assumptions humanity treats as unavoidable)

For each, the bug-hunter’s question: *law of reality, or workaround for a dead
limitation?*

1. **The firm / company** — that complex work needs a persistent legal entity.
2. **The job** — that contribution must be bundled into continuous full-time roles.
3. **The manager** — that coordination needs a human in an authority seat.
4. **The office / co-location** — that working together needs being in one place.
5. **The 9-to-5 / business day** — that effort must synchronize to one clock.
6. **The meeting** — that alignment needs synchronous human presence.
7. **The price (single scalar)** — that value must compress to one number.
8. **Intellectual property** — that ideas need artificial scarcity to be made.
9. **The contract + court** — that agreements need an external human enforcer.
10. **The credential** — that capability must be vouched for *(deleted elsewhere)*.
11. **The bank** — that idle value needs a custodial intermediary.
12. **The résumé / career** — that a working life is one legible linear narrative.
13. **The nation-state border** — that rules must be bound to territory.
14. **Representative voting every N years** — that mass preference can’t update live.
15. **The census / registry** — that the state must hold a master copy of you.
16. **The password** — that proving who you are needs a shared secret.
17. **Mass age-cohort schooling** — that learning must be batched by birth year.
18. **The standing army** — that defense needs a permanent owned force.
19. **The deed / title** — that control of a thing needs a custodial record of owner.
20. **The org chart hierarchy** — that scale requires a tree of command.

Nearly every one is a **compression for an information or coordination cost** that
computation and sensing have since collapsed. Most are bugs. The audit’s job is to
pick the *one* worth deleting first.

---

## PHASE 2 — Bug Detection (highest cost / remaining-benefit)

Select exactly one, by the ratio **(cost imposed on civilization) / (benefit
still provided)**.

| Candidate | Cost imposed | Benefit *still* provided | Ratio |
|---|---|---|---|
| The credential | High | Medium | High *(already deleted)* |
| Intellectual property | High | Low–Med | High *(addressed via provenance)* |
| Representative voting | High | Medium | High *(fails buildability — needs political coordination)* |
| The job | High | Medium | High *(a symptom of #1)* |
| **The firm** | **Very high** | **Falling fast** | **Highest** |

**Why the firm wins.** Its cost is civilizational and compounding: capital
capture, lock-in, the entire apparatus of corporate law, principal-agent waste,
"bullshit jobs," the bundling of healthcare and identity and meaning into
employment, and the concentration of nearly all coordination power into a few
thousand persistent entities. Its *remaining* benefit — *cheap coordination of
many people toward an outcome* — is precisely the thing that autonomous agents,
cheap contracting, and verifiable settlement now provide **without** the entity.
The benefit is being re-provided by other means even as the cost keeps growing.
Denominator shrinking, numerator climbing: highest ratio. And it **subsumes**
several other bugs on the list (the job, the manager, the office, the org chart
are all *consequences* of the firm). Delete the firm and four other bugs fall with
it. Selected.

---

## PHASE 3 — Root Cause Analysis

**Ronald Coase, 1937, already wrote the bug report.** Markets have transaction
costs — finding the right party, negotiating, writing the contract, monitoring
performance, enforcing the result. When those costs are high, it is cheaper to
pull the activity *inside* a single entity and direct it by authority instead of
by contract. **The firm exists exactly to the extent that using the market is
expensive.** Its size is set by where internal coordination cost meets external
transaction cost.

That is not a law of nature. It is a **workaround for the cost of coordinating
strangers.** Trace the roots:

- *Technological:* you could not cheaply discover, vet, contract with, and monitor
  a thousand independent specialists in real time. So you hired them and put them
  under one roof and one boss.
- *Biological:* human trust and oversight bandwidth is tiny (Dunbar), so hierarchy
  was the only way to stack coordination past the village.
- *Historical accident:* limited liability and the joint-stock charter — a
  17th–19th century legal hack to pool capital for ventures too big for one
  purse — fused "coordinating work" and "pooling capital" into a single object, the
  corporation, and we forgot they were ever separable.
- *Coordination constraint:* contracts could not specify or enforce themselves, so
  enforcement required courts, which required jurisdictions, which required the
  firm to be a legible, persistent, suable thing.

**Does the original purpose still hold?** No. Discovery, vetting, contracting,
monitoring, and enforcement — every term in Coase’s transaction cost — is exactly
what autonomous agents plus verifiable settlement drive toward zero. When the
market’s transaction cost approaches the firm’s internal coordination cost, the
firm’s reason to exist evaporates. The workaround outlived the limitation. **Bug
confirmed.**

---

## PHASE 4 — Delete It

Remove the firm. Not "flatten hierarchy," not "gig economy," not "remote work" —
**delete the persistent coordinating entity.** No companies, no employers, no org
charts, no payroll, no corporate persons.

**What collapses:**

- **Persistence of capability.** Where does tacit knowledge, long-horizon R&D, and
  institutional memory live, if no entity endures to hold it?
- **Liability.** Who is suable when the bridge fails, if the builder dispersed?
- **Capital aggregation.** How do you fund something huge without shares to sell?
- **Coordination at scale.** What stacks a million people’s effort toward one
  outcome without a hierarchy?
- **Identity and belonging.** Half of modern life’s structure — income, healthcare,
  status, community, meaning — is bundled into "where you work." It vanishes.

The rubble reveals the same lesson as before: the firm was a **bundle** of
separable functions — *coordinate work, pool capital, persist knowledge, carry
liability, provide belonging* — fused only because the era’s costs made unbundling
impossible. The patch is not to rebuild the entity. It is to **provide each
unbundled function directly.**

---

## PHASE 5 — Replacement Primitive: **The Convergence**

> **Coordination becomes a verb, not a noun.** Instead of a persistent entity that
> work is poured into, a **Convergence** is a transient act: capability, capital,
> and obligation *assemble* around a published outcome, execute, settle, and
> **dissolve** — leaving no entity, no owner, no residual hierarchy. The firm was a
> noun (a thing that exists). The Convergence is a verb (a thing that happens).

Mechanism: an **outcome** is published with a bounty of obligations (Obligation
Web, `PRIMITIVES.md` III). Agents — human and autonomous — with relevant
**demonstrated capability** (`ASSUMPTION-THE-CREDENTIAL.md`) self-assemble into a
**cell**, coordinate peer-to-peer toward the outcome, have their work verified as
**Witnessed Facts** (`PRIMITIVES.md` I), settle automatically on delivery, and
**disperse**. The five unbundled functions are each re-provided *without* an
entity:

- **Coordinate work** → the Convergence protocol (matching + peer coordination),
  done by agents at near-zero transaction cost — Coase’s denominator collapses.
- **Pool capital** → obligation / *telos-bonds* repaid from the outcome, **never**
  equity in a persistent thing.
- **Persist knowledge & long-horizon assets** → **Autotelic Property**
  (`PRIMITIVES.md` II) and provenance-bearing lineage hold what must endure;
  persistence is decoupled from *ownership of an entity.*
- **Carry liability** → bound to participants’ **standing**, which persists even
  though the cell dissolves; you can disperse the cell, not your history.
- **Belonging** → re-anchored to communities and the Reciprocity Graph, not to an
  employer.

It meets the requirements: **AI-agent-native** (agents are first-class cell members
and can run cells autonomously — they are *better* at the discover/contract/monitor
loop that made firms necessary); **global** (a Convergence is borderless);
**no central authority** (no entity, no platform-owner — the protocol is a
commons); and it is built to survive attack (Phase 6).

---

## PHASE 6 — Adversarial Civilization Simulation

**Year 1.** *Economist + Systems Engineer attack:* "No persistent entity means no
accumulated capability, no economies of scale, no long-term R&D, and no one to
hold tacit knowledge. Every Convergence starts from zero and the knowledge
evaporates on dissolution. Cold-start kills you."
→ **Redesign:** persistence is moved from *the entity* to the *lineage*. Tacit
knowledge and long-lived assets live in **Autotelic Property** and
provenance-bearing records that cells *use* but no one *owns*; capability persists
in participants’ standing. R&D is a telos-bond against an autotelic research asset
that endures across many Convergences. Persistence survives; ownership of a
persistent firm does not.

**Year 10.** *Hacker + Evolutionary Biologist attack:* "High-standing agents form
stable cartels — the same people keep converging together and calcify into a
de-facto firm with a new name. Reputation becomes the equity moat you tried to
delete. And inside cells, free-riders coast on others’ witnessed work."
→ **Redesign:** standing is **non-transferable and decaying**, so it reflects
*recent* witnessed outcomes, not an accumulated brand a cartel can sit on; fresher
cells out-compete calcified ones. A **betweenness-tax** (Obligation Web) treats
re-concentration of coordination power as congestion and actively redistributes
it. Free-riding fails because contribution is witnessed at the *individual* level,
not the cell level — standing accrues to who actually did the work.

**Year 50.** *Political Scientist + Intelligence Analyst attack:* "Accountability
evaporates. A dissolved cell shipped a defective bridge — who is liable?
Bad actors weaponize dissolution: take the bounty, ship garbage, vanish. And
capital still concentrates in whoever funds the Convergences — the financiers
become the new lords."
→ **Redesign:** liability binds to **standing that cannot be dissolved**;
"default-and-vanish" fails because the thing that vanishes is exactly the standing
the agent needs to ever converge again — the punishment is built into the
primitive. High-consequence outcomes (bridges, medicine) require witnessed
liveness, staked standing, and obligation-funded insurance pools before the cell
can form. Capital is structurally barred from accumulating control: it
participates as *repaid obligation*, never as ownership of the coordination layer,
so financiers earn returns but cannot become lords of a thing there is no title to.

**Year 100.** *Adversary (general) attack:* "Either it reverts — firms quietly
re-grow because humans like permanence — or it fragments into incoherence with no
vehicle for century-long projects like fusion or settling space."
→ **Redesign:** the century-long vehicle is the **Autotelic asset**, not the firm:
a fusion program is an ownerless, self-financing, self-governing asset that endures
for a hundred years while thousands of Convergences assemble and disperse around
it. Permanence is available — as a *commons that defends itself*, not as a
*company someone owns.* Reversion is resisted because re-incorporating gains you
nothing the protocol doesn’t already give you, minus the rents.

**Stable form:** Convergence protocol + standing-bound non-dissolvable liability +
Autotelic persistence for the long-lived parts + obligation/telos-bond capital that
can’t buy control + anti-calcification betweenness-tax + tiered liveness/insurance
for high-consequence work.

---

## PHASE 7 — Buildability Test (the 30-day prototype, 1–3 engineers)

Rejects everything requiring AGI, unknown physics, global revolution, world
government, or perfect humans. What survives is small and real:

**A Convergence protocol for one narrow vertical — shipping small software
deliverables — with no entity, no payroll, no LLC.**

- **Outcome + bounty (days 1–5):** a poster publishes a precise deliverable
  (a spec with automated acceptance tests) and escrows a bounty of obligations.
- **Self-assembly (days 6–12):** agents — human *and* scripted AI agents — with
  demonstrated capability in the relevant skill (reuse the credential prototype)
  opt in and form a cell; coordination is peer-to-peer, no manager seat.
- **Witnessed delivery (days 13–20):** the acceptance-test suite passing *is* the
  Witnessed Fact; verification is automatic and re-runnable by anyone.
- **Settle + dissolve (days 21–26):** on a passing witnessed result, escrow
  releases along the obligation graph; standing updates for each contributor by
  their witnessed share; the cell dissolves and leaves no entity behind.
- **Anti-calcification + liability stub (days 27–30):** standing is signed,
  non-transferable, decaying; a simple betweenness check flags re-concentration;
  liability is a staked-standing bond posted before work, slashed on a failed
  witnessed delivery.

Built only from: a matching/coordination service, programmable escrow, an
automated test-runner as the witness, and a signed append-only standing log. No
AGI — autonomous agents here are ordinary scripted workers, not general
intelligences. One to three engineers, thirty days, one vertical. The same shape
extends to any outcome whose delivery can be witnessed.

---

## Required Output (consolidated)

**1. Hidden Assumption.** That coordinating complex work requires a **firm** — a
persistent, owned, hierarchical legal entity.

**2. Why It Exists.** Coase: the firm is a workaround for the **transaction cost of
coordinating strangers** (discover, vet, contract, monitor, enforce), fused by
historical accident with the joint-stock hack for pooling capital.

**3. Why It Became Obsolete.** Every term in Coase’s transaction cost is exactly
what autonomous agents plus verifiable settlement drive toward zero. When market
coordination becomes as cheap as internal coordination, the firm’s reason to exist
evaporates. The workaround outlived its limitation.

**4. Replacement Primitive.** **The Convergence** — coordination as a transient act
(capability + capital + obligation assemble around an outcome, execute, settle,
dissolve), with the firm’s five bundled functions each re-provided directly and
without an entity.

**5. Attack Results.** Survived Years 1/10/50/100 after redesign: Year 1 forced
*lineage-not-entity persistence*; Year 10 forced *decaying non-transferable
standing + betweenness-tax* against calcification; Year 50 forced *non-dissolvable
standing-bound liability + capital that can’t buy control*; Year 100 forced
*Autotelic assets as the century-scale vehicle.*

**6. Surviving Design.** Convergence protocol + standing-bound liability + Autotelic
persistence + obligation/telos-bond capital + anti-calcification tax + tiered
liveness/insurance for high-consequence work.

**7. 30-Day Prototype.** A Convergence for small software deliverables: escrowed
outcome-bounty → self-assembling cell of demonstrated-capability agents →
acceptance-tests-as-witness → automatic obligation settlement → dissolution +
standing update, built from matching, escrow, a test-runner, and a signed standing
log. 1–3 engineers, 30 days, no AGI.

**8. Long-Term Civilization Impact.** The unit of economic life shifts from the
*organization you belong to* to the *outcomes you converge on.* The bundle the firm
welded together — work, capital, knowledge, liability, belonging — comes apart, and
each piece is held by a purpose-built commons instead of an owner. Coordination
power stops concentrating in a few thousand persistent entities and becomes a
flow that re-forms continuously around what needs doing. The century-scale things —
fusion, restoration, space — get a better vehicle than the corporation: an
ownerless asset that cannot be bought, captured, or made to outlive its purpose.

---

*Four deletions, one search. Trust, Ownership, Currency, the Credential — and now
the Firm, the container that held them all. The Convergence assembles
demonstrated-capability agents (doc 3), verifies their work as witnessed facts
(doc 2-I), settles them through the obligation web (doc 2-III), and leaves the
enduring parts as autotelic property (doc 2-II). The bug was never the firm. The
bug was believing coordination had to be a thing you own, instead of a thing that
happens.*
