# Primitive Discovery — The Adversarial Pass

*Three primitives, each forced through simulation, destruction by six adversaries,
and redesign. Only what survived the attacks is written below.*

This is the hardened sequel to `PARADIGMS.md`. That document mapped where to dig.
This one takes the three deepest candidates and tries to **kill them** — as an
adversary, an economist, a hacker, an evolutionary biologist, a political
scientist, and a systems engineer — then redesigns each until it stops dying. The
required-output schema at the end of each section describes the *surviving*
design, not the naive one.

A note on discipline: each primitive removes a **different** load-bearing
assumption — **Trust**, **Ownership**, **Currency** — because three solutions to
the same removal is one idea, not three. And each is chosen because its enabling
constraint was *computational*, and that constraint has only just lifted. That is
the signature of a real primitive: it was *impossible* until now, not merely
*undone* until now.

---

# Primitive I — The Witnessed Fact

### Assumption Removed: **Trust**

> *What becomes possible if no one ever had to be trusted to tell the truth about
> the physical world?*

### Core Mechanism

A **fact** is a claim about physical state — *this water is potable, this field
was planted, this container is sealed, this labor occurred* — attested by N
**physically independent** witnesses. Independence is not assumed; it is a
protocol requirement computed from hardware roots-of-trust, spatial entropy,
manufacturer diversity, and sensing modality. Ten cameras from one vendor in one
room are *one* witness. Ten different instruments, makers, and vantage points are
ten.

Each attestation is weighted by **standing**: a non-transferable, decay-prone
*right to be believed*, earned by past correctness and **burned** when a witness
is proven wrong. A fact finalizes when corroborating standing crosses a threshold
*and* survives a challenge window in which anyone may stake standing on a
contradicting attestation. Challenges resolve by escalating, randomized physical
**re-measurement**; the losing side's standing is destroyed. Witnesses must
periodically answer **active-sensing nonces** — measurement challenges only a true
observer at that place and time could answer — so copying the consensus fails.

There is no registry and no certifier. "Truth" is the moving equilibrium of a
continuous adversarial game played over a content-addressed gossip layer. The
protocol never claims certainty; it publishes its own **confidence**, derived from
witness diversity and challenge history.

### Why Existing Systems Cannot Evolve Into It

A certifier — a lab, a brand, a ratings agency, an oracle — is economically a
*monopoly on belief that monetizes being the bottleneck.* Its revenue **is** the
centralization. You cannot incrementally decentralize it, because every step
toward decentralization deletes its business model. The incentive gradient points
exactly the wrong way. The Witnessed Fact is not a better certifier; it is the
*deletion of the certifier role* — a different category of thing, reachable only
by starting from the assumption that no one is trusted.

### The Gauntlet (Simulation → Destruction → Redesign)

**50-year simulation.** Physical reality becomes a queryable substrate.
Insurance pays claims that prove themselves. Supply chains assert their own
provenance. Science becomes re-runnable by strangers. Journalism cites reality
instead of sources. Environmental markets price what is measured, not what is
declared.

**Then the adversaries attacked:**

- **Hacker:** "I spoof sensors — GPS, deepfaked instrument streams, supply-chain
  implants in witness hardware. I Sybil the mesh with cheap devices."
- **Economist:** "Standing becomes a bribery market. High-standing witnesses form
  a cartel and sell reality off-protocol. The rich buy the truth."
- **Evolutionary biologist:** "Sensor monoculture gives you correlated failure.
  And parasitic witnesses free-ride — they copy consensus and never measure."
- **Political scientist:** "States capture the mesh inside their borders. Minority
  reports get suppressed. We get reality-sovereignty wars."
- **Systems engineer:** "Momentary, unrepeatable facts can't be re-measured. What
  is finality under network partition?"
- **Adversary (general):** "I don't need to break it everywhere — just where the
  contract I care about reads from."

**Redesign that survived each attack:**

- *Spoofing/Sybil* → physical-diversity is a hard constraint plus hardware
  attestation plus randomized re-measurement across modalities. An attacker must
  now defeat many independent physics at the same instant, not one feed. Cheap
  Sybils share a manufacturer/location signature and collapse to a single witness.
- *Bribery cartel* → standing is **non-transferable**, so bribery must be paid in
  some *other* medium off-protocol — which makes it an unenforceable prisoner's
  dilemma: take the bribe, attest the truth anyway, and the briber cannot punish
  you (they have no hold on your standing), while a **counter-bounty** pays you to
  report the bribe. The thing of value cannot be delivered, so the market for lies
  does not clear.
- *Parasitism* → active-sensing nonces; a copier cannot answer a measurement only
  a real observer could, and loses standing for trying.
- *Monoculture* → diversity is *rewarded* in the finalization weighting;
  correlated witnesses are discounted automatically.
- *State capture* → a captured region simply produces **low-diversity, hence
  low-confidence** facts, which the protocol labels as such. Capture cannot forge
  high confidence; it can only reveal itself as a region the protocol does not
  believe. Reality-sovereignty becomes *visible* instead of hidden.
- *Unrepeatable facts* → tiered finality. Ephemeral events get "witnessed" status
  with honest, capped confidence; only repeatable states reach "proven." The
  protocol never launders uncertainty into certainty.
- *Targeted attack* → contracts read **confidence**, not a binary; a low-diversity
  fact carries low confidence and high-value contracts can require a diversity
  floor before acting.

### Emergent Behaviors

A market for *being right* rather than for *being authoritative*. Whistleblowing
becomes economically dominant (counter-bounties). A long-tail of hyper-local
witnesses monetizing standing in places no certifier ever served. "Confidence" as
a new public signal woven into every downstream system.

### New Industries Enabled

Self-proving supply chains; insurer-less risk pools; re-runnable science as a
service; environmental and biodiversity markets with real collateral; an evidentiary
layer for courts and journalism; autonomous machines that trust the world directly.

### Risks

A confidence-scoring monoculture (one scoring implementation becoming a de-facto
authority — mitigated by plural, competing scorers). Chilling effects if standing
becomes a social credit analog (mitigated by scope-limiting standing to factual
domains, never to persons). Physical-world denial-of-measurement attacks.

### Minimal Prototype

One verifiable claim type — *cold-chain integrity for a shipment* — attested by
three heterogeneous sensor classes from different owners, with a public challenge
window and standing slashing. Ship it for a single perishable-goods corridor.

### 5-Year Roadmap

Y1: single-claim prototype + slashing game live on one corridor. Y2: heterogeneous
witness SDK; third-party witnesses join. Y3: challenge/re-measurement market;
first insurer prices off witnessed facts. Y4: multi-domain (provenance,
environmental); confidence API standardized. Y5: open gossip layer, no privileged
operator; the original team can walk away without the network dying.

### 20-Year Civilization Impact

"Trusted third party" joins "switchboard operator" as an extinct profession for an
entire class of facts. The cost of verifying physical reality falls toward zero,
which — like the cost of copying information falling toward zero — reorganizes
every system built on the old scarcity.

---

# Primitive II — Autotelic Property

### Assumption Removed: **Ownership**

> *What becomes possible if some things could exist as their own end, owned by no
> one, not even collectively?*

### Core Mechanism

A class of asset is wrapped in a **self-stead**: a null-owner construct holding
the asset's title such that no principal — individual, company, state, or
membership — possesses the right to **alienate** it (sell, mortgage, withdraw the
corpus). The self-stead receives the asset's income, funds its own upkeep, and is
operated by a **rotating, sortition-selected** swarm of steward-agents bound to a
published **charter** (the asset's *telos*).

Stewards are paid in **revocable standing**, never equity. They can never acquire
the asset. Every decision is challengeable by a **watcher** class rewarded for
catching charter violations. The asset is never *bought*; it can only be
**re-chartered** by a supermajority of its **stakeholders-of-record** — those whose
material, *measured* causal exposure to the asset is established as Witnessed
Facts (Primitive I), not self-declared.

A forest, an aquifer, a road, an orbital, a dataset — each becomes its own
principal, financed by what it produces, accountable to those it affects, owned by
nobody.

### Why Existing Systems Cannot Evolve Into It

Every corporation and trust has a **residual claimant** — a shareholder, a
beneficiary — *for whom the entity is instrumental.* Remove the residual claimant
and a corporation ceases to be a corporation; you have destroyed the thing it
exists to serve. Autotelic property is the entity *as its own residual claimant.*
That is not a governance tweak; it is a different ontological category, reachable
only by removing ownership at the root rather than redistributing it.

### The Gauntlet

**50-year simulation.** Infrastructure maintains itself from its own cashflow.
Watersheds litigate and fund their own restoration. Public goods stop depending on
the precarious goodwill of budgets. A new, slower kind of capital appears that
finances things it can never own.

**The adversaries attacked:**

- **Adversary/Hacker:** "Whoever controls the steward-agents *is* the owner.
  Capture the code or the selection randomness and I own it in all but name."
- **Economist:** "No equity means no investor. It can't raise capital to get
  built. Diffuse stakeholders free-ride on upkeep. It starves."
- **Biologist:** "A fixed charter can't anticipate environmental change. The asset
  optimizes a stale telos straight into maladaptation."
- **Political scientist:** "Who defines 'stakeholders-of-record'? Entryists
  organize, capture the charter, and loot it legally."
- **Systems engineer:** "How do you upgrade the mandate without a privileged key —
  which is just ownership wearing a hat?"

**Redesign that survived:**

- *Capture* → the decisive insight: **with no alienation right, the payoff to
  capture collapses.** A captured steward swarm still cannot sell or withdraw the
  corpus — only mis-operate it, briefly, inside a challenge window, before watchers
  slash and rotation replaces it. **Capture degrades from theft to vandalism**, a
  vastly smaller prize. Layer on separation of powers (quorum across disjoint trust
  domains), randomness sourced from the Witnessed-Fact layer, and watcher
  bounties, and the expected value of an attack goes negative.
- *Capital starvation* → autotelic assets raise via **obligation** (Primitive III)
  and **pre-purchased witnessed output** — the watershed pre-sells future
  water-quality credits; the road pre-sells throughput. A new financing species,
  *telos bonds*: patient capital repaid from cashflow, never with ownership.
- *Maladaptation* → charters specify **values and constraints, not actions**, and
  mandate periodic re-chartering triggered by Consequence-Layer signals. The telos
  is a heading; stewards continuously re-plot the course.
- *Stakeholder capture* → materiality is **computed from measured causal impact**,
  not claimed. Entryism requires manufacturing real, witnessed exposure, which is
  expensive and self-defeating.
- *Upgrade-as-ownership* → mandate changes run through the same re-chartering
  supermajority, a timelock, and a watcher veto. **No privileged key exists**; the
  upgrade path is itself ownerless.

### Emergent Behaviors

Assets that *negotiate* on their own behalf. A class of human work — stewardship —
paid in reputation rather than ownership. Capital that competes on patience.
Public goods that can no longer be quietly privatized because there is no one to
sell them.

### New Industries Enabled

Self-financing infrastructure; ecosystem restoration as a solvent activity;
telos-bond underwriting; steward-agent design and auditing; watcher/bounty
markets; perpetual archives and datasets that fund their own preservation.

### Risks

Steward-class cultural capture (slow ideological drift rather than a hack —
mitigated by sortition and rotation). Charter ambiguity litigated into
de-facto ownership. Under-maintenance if cashflow and telos diverge. Legal
recognition lag (the slowest constraint — see roadmap).

### Minimal Prototype

A single small **community well** wrapped as a self-stead: income from witnessed
water delivery, upkeep auto-funded, three rotating stewards paid in standing,
downstream households as measured stakeholders-of-record. No legal personhood
required at first — implemented as a binding multi-party mandate over an escrow.

### 5-Year Roadmap

Y1: well/escrow prototype; charter language v0. Y2: telos-bond instrument piloted;
watcher bounties live. Y3: second asset class (a community microgrid) to prove
generality. Y4: legal-wrapper partnerships in one favorable jurisdiction granting
limited asset personhood. Y5: open self-stead standard; a handful of assets
running with the founding team fully removed.

### 20-Year Civilization Impact

The commons stops being the thing that gets enclosed and becomes a *self-defending
economic organism.* A category of conflict — over who owns the river, the road,
the archive — is dissolved rather than won, because the answer becomes *no one, and
here is how it takes care of itself.*

---

# Primitive III — The Obligation Web

### Assumption Removed: **Currency / Money**

> *What becomes possible if value could circulate without ever being made
> fungible?*

### Core Mechanism

The settlement medium is the **specific commitment**, recorded in a web of
obligations and cleared by **multilateral netting** rather than by a fungible
token. *I owe you a day of care; you owe the clinic a repair; the clinic owes me
data-stewardship* — the system finds **cycles** in the obligation graph and cancels
them automatically, the way an inter-bank clearing house nets payments, except the
units never collapse into one currency. Value circulates as **matched
specificity**.

There is no single unit of account. Commensurability, where needed, comes from a
**reference basket** of witnessed real quantities (kilowatt-hours, care-hours,
liters) — a *measuring rod*, not a *medium of exchange.* Obligations count toward
standing only once **discharged and witnessed** (Primitive I). Defaults are
absorbed by standing decay, collateralized future-obligations, and
obligation-funded community insurance pools — never by a court. A "price" is
replaced by a continuously recomputed **matching** over a graph of needs and
capacities.

### Why Existing Systems Cannot Evolve Into It

Money's entire function is to **erase specificity** so value can travel. Banking,
fintech, and crypto are all fungibility machines, optimizing the exact quantity
the Obligation Web preserves. You cannot evolve a fungibility machine into a
specificity-preserving one; the objective is inverted. Barter — the historical
alternative — failed for one reason: **matching did not scale.** That was a
*computational* limit, and it has only just been lifted. This is the first moment
in history the Obligation Web is even physically plausible.

### The Gauntlet

**50-year simulation.** The work markets never priced — care, restoration,
stewardship, raising the next generation — becomes **legible** and circulates.
Communities run dense reciprocity at metropolitan scale because memory now scales.
Mutual-aid stops being charity and becomes infrastructure.

**The adversaries attacked:**

- **Economist:** "Re-fungibilization is inevitable. High-standing IOUs become
  quasi-money; you've reinvented banking with extra steps. And with no unit of
  account, you can't compute trade-offs — the calculation problem kills you."
- **Hacker:** "Obligation laundering. Fake cycles. Sybil obligations to farm
  standing. Default and vanish."
- **Biologist:** "Freeloaders and defectors win iterated games once you pass
  Dunbar scale. Cooperation collapses."
- **Political scientist:** "Whoever sits at high-betweenness nodes becomes the new
  banker, and 'owe me, or else' becomes informal coercion."
- **Systems engineer:** "Planet-scale graph matching is NP-hard. Latency and
  partial information make optimal clearing impossible."

**Redesign that survived:**

- *Re-fungibilization* → **don't ban it; out-compete it.** The protocol attaches
  consequence-objects and provenance to obligations, making specificity *cheaper
  to keep than to erase.* A laundered, abstracted IOU sheds the contextual value
  (a "care-hour" carries witnessed verification a bare token cannot), so for the
  obligations people most care about, the fungible shadow-instrument is **strictly
  dominated.** Shadow money may exist at the margins; it loses where it matters.
- *Calculation problem* → the **reference basket** restores commensurability
  without a medium. You can compare and trade off against a rod of real witnessed
  quantities without minting a coin that then accretes power.
- *Laundering / Sybil / fake cycles* → standing accrues only on **discharge +
  witnessing**; fake cycles fail witnessing; Sybil obligations require real
  discharge to build standing, defeating their own purpose.
- *Freeloaders at scale* → the Dunbar ceiling was a **memory** constraint, now
  lifted; standing decay, reciprocity radius, and locality keep iterated-game
  cooperation stable far past it.
- *New bankers at high-betweenness nodes* → betweenness is continuously measured
  and treated as **congestion, a fault to be corrected**: high-betweenness nodes
  draw heavier watcher scrutiny and a standing-tax that redistributes clearing
  power. Coercion is reportable for counter-bounty (Primitive I again).
- *NP-hard matching* → stop seeking the optimum. Use **local, anytime, approximate
  clearing**, exactly as real markets do — greedy good-enough matches, improved
  continuously. Planetary optimality was never required for usefulness.

### Emergent Behaviors

Care and restoration become first-class economic acts. Default risk becomes a
*social*, locally-priced signal rather than a credit score sold by a bureau.
"Wealth" splits into two visible quantities — *standing* (trustworthiness) and
*matched capacity* (what you can actually get done) — that money had blurred into
one.

### New Industries Enabled

Reciprocity-clearing infrastructure; non-monetary insurance pools; care and
eldercare commons; disaster-response webs that self-assemble from pre-committed
obligations; the financing rail for Autotelic Property (Primitive II); a labor
economy for everything markets never priced.

### Risks

A persistent shadow currency re-centralizing power (bounded, not banned). Coercive
local obligation cultures (mitigated by exit, reciprocity radius, and reporting
bounties). Reference-basket capture (mitigated by plural baskets). Cold-start
liquidity: a sparse graph has few cycles to net.

### Minimal Prototype

A single neighborhood **time-and-care web**: discharge-witnessed obligations
(verified help delivered), automatic cycle-netting weekly, standing decay, one
insurance pool. Roughly 150 households — start *inside* Dunbar to prove the
mechanics, then show they hold past it.

### 5-Year Roadmap

Y1: neighborhood care-web with witnessed discharge and cycle-netting. Y2:
reference-basket commensurability; insurance pool live. Y3: inter-neighborhood
clearing (cross the Dunbar boundary deliberately); betweenness-tax tested. Y4:
finance an Autotelic asset through the web (compose II+III). Y5: open clearing
protocol, plural baskets, founding operator removed.

### 20-Year Civilization Impact

A second economy grows *beside* the monetary one — not replacing money for
commodities, but finally giving the priceless work a circulatory system. The
measure of a life's contribution stops being the single number in an account and
becomes a *shape* in a graph: what you tended, whom you tended, what still holds
because of you.

---

# The Graveyard (did not survive STEP 5)

Honesty about the discard pile is part of the method. Notable casualties:

- **Forkable Minds / evolutionary intelligence** — survived the biologist and the
  economist but **failed the systems engineer and the adversary**: no proposed
  selection pressure resisted degenerating into a reward-hacked monoculture, and
  the substrate that would prevent runaway collapse is itself an unsolved safety
  problem. *Promising, not yet viable. Returned to the bench.*
- **Universal reputation as a single substrate** — collapsed under the political
  scientist: any global, cross-domain reputation score converges on a social-credit
  capture surface. Survives **only** when scoped narrowly (standing-for-facts in
  Primitive I), never as a general primitive.
- **Pure gift economy without standing** — died to the biologist on the first
  attack (unpunished defection dominates). It only lives once obligation and
  witnessed discharge are added — at which point it *is* Primitive III.

The asymmetry is the lesson: most "civilizational" ideas are products, or
romances, in disguise. Three survived a serious attempt to kill them. That
scarcity is the signal that they are primitives.

---

# Why these three compose into one substrate

They were not chosen independently. Each repairs the others' fatal flaw:

- **Autotelic Property** is captured the instant its stewards lie about the asset —
  so it **needs Witnessed Fact** to make stewardship verifiable.
- **Autotelic Property** cannot raise equity by construction — so it **needs the
  Obligation Web** to finance itself without an owner.
- **The Obligation Web** is gamed by fake and laundered obligations — so it
  **needs Witnessed Fact** to make discharge real before it counts.
- **Witnessed Fact** needs a non-monetary motive for witnesses so reality cannot
  simply be bought — which is **standing**, the native currency-that-is-not-a-
  currency of the **Obligation Web.**

Trust, ownership, and money were always the same knot tied three ways. Cut all
three at once and what is left standing is a single new layer of reality: a world
that can **prove what is true, take care of itself, and circulate value** — with no
one trusted, no one owning, and nothing priced.

That is not a better present. It is the next one.
