// condition.ts (demo) — Physical Truth Ledger vs the maintenance schedule.
//
// Run:  node --experimental-strip-types src/demo/condition.ts
//
// Shows the calendar throwing away a healthy part, the calendar keeping a worn-out
// one, a fault sealing the exact stress vector at the moment of failure (the
// proof.json black box), and tamper-evidence on the chained ledger.

import { generateKeyPairSync } from "node:crypto";
import { SoftwareTeeSigner } from "../auth/keyless.ts";
import { simulate } from "../sim/physics.ts";
import type { PowerScript } from "../sim/powerscript.ts";
import { ConditionLedger, deriveStress, calendarDecision } from "../ledger/condition.ts";
import type { LifecycleEnvelope } from "../ledger/condition.ts";

function hr(t: string) {
  console.log("\n" + "─".repeat(72) + "\n" + t + "\n" + "─".repeat(72));
}
function mkSigner(id: string): SoftwareTeeSigner {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return new SoftwareTeeSigner(id, privateKey, publicKey.export({ type: "spki", format: "pem" }).toString());
}

const ENVELOPE: LifecycleEnvelope = {
  partId: "drone.motor.vreg.0",
  maxCumulativeEnergyJ: 19000,
  maxThermalStress: 1000,
  maxCycles: 1000,
  absoluteMaxTempC: 150,
  thermalBaselineC: 60,
};
const CALENDAR_LIMIT_OPS = 200; // "replace every 200 actuations"

const gentle: PowerScript = { target: ENVELOPE.partId, ops: [{ op: "SET_CURRENT_LIMIT", amps: 5 }, { op: "RAMP", toVolts: 12.0, ms: 100 }, { op: "HOLD", ms: 200 }] };
const abusive: PowerScript = { target: ENVELOPE.partId, ops: [{ op: "SET_CURRENT_LIMIT", amps: 8 }, { op: "RAMP", toVolts: 13.0, ms: 100 }, { op: "HOLD", ms: 1000 }] };

const signer = mkSigner("workshop-sentinel-0");

console.log("AEGIS — Physical Truth Ledger (condition-witnessed lifecycle)");

// ── A: gentle use — calendar wastes a healthy part ───────────────────────────
hr("A) 300 gentle actuations — calendar says REPLACE, the part says HEALTHY");
const ledgerA = new ConditionLedger(ENVELOPE, signer);
const sampleGentle = deriveStress(simulate(gentle), ENVELOPE.thermalBaselineC);
for (let i = 0; i < 300; i++) ledgerA.record(sampleGentle);
const a = ledgerA.assess();
console.log(`calendar(${300}/${CALENDAR_LIMIT_OPS}) → ${calendarDecision(300, CALENDAR_LIMIT_OPS)}`);
console.log(`witnessed: ${a.health}  (worst budget used: ${(a.worstFraction * 100).toFixed(1)}%)`);
console.log("⇒ Kalendarz wyrzuca zdrowy podzespół. Ledger go ZACHOWUJE — oszczędność i mniej e-odpadów.");

// ── B: abusive use — calendar keeps a worn-out part ──────────────────────────
hr("B) 180 abusive actuations — calendar says KEEP, the part says RETIRE");
const ledgerB = new ConditionLedger(ENVELOPE, signer);
const sampleAbusive = deriveStress(simulate(abusive), ENVELOPE.thermalBaselineC);
for (let i = 0; i < 180; i++) ledgerB.record(sampleAbusive);
const b = ledgerB.assess();
console.log(`calendar(${180}/${CALENDAR_LIMIT_OPS}) → ${calendarDecision(180, CALENDAR_LIMIT_OPS)}`);
console.log(`witnessed: ${b.health}  (worst budget used: ${(b.worstFraction * 100).toFixed(1)}%)`);
console.log("⇒ Kalendarz trzyma zużyty podzespół do następnej daty. Ledger każe go WYCOFAĆ — zanim spali.");

// ── C: a fault — seal the stress vector at the moment of failure ─────────────
hr("C) Awaria: czarna skrzynka zapisuje wektor stresu w chwili spalenia");
const ledgerC = new ConditionLedger(ENVELOPE, signer);
for (let i = 0; i < 40; i++) ledgerC.record(sampleAbusive);
// an external fault drives a thermal runaway the sensors witness at 175°C:
const faultEntry = ledgerC.record({ energyJ: 240, thermalStress: 30, cycles: 1, peakTempC: 175 });
const c = ledgerC.assess();
console.log(`health after fault: ${c.health}`);
console.log(`proof.json (black box) entry at failure:`);
console.log(`  seq=${faultEntry.seq} peakTempC=${faultEntry.sample.peakTempC} energyJ=${faultEntry.sample.energyJ} sig=${faultEntry.sig.slice(0, 16)}…`);
console.log("⇒ To jest dowód do sprzedawcy/ubezpieczyciela: nie zgadujesz, masz podpisany wektor stresu.");

// ── D: tamper-evidence — you cannot quietly rewrite the black box ────────────
hr("D) Próba manipulacji historią ledgera");
console.log(`chain valid before tamper: ${ledgerC.verifyChain()}`);
const box = ledgerC.blackBox();
box[10].sample.energyJ = 1; // forge a past entry to hide abuse
console.log(`chain valid after tampering entry #10: ${ledgerC.verifyChain()}  (false ⇒ wykryto)`);

hr("WNIOSEK");
console.log("Stan podzespołu czytamy z DOWODU nagromadzonego stresu, nie z daty. Kalendarz");
console.log("jednocześnie marnuje zdrowe części i przepuszcza zużyte. Witnessed lifecycle robi");
console.log("odwrotnie — i zostawia sądowy, podpisany ślad każdej chwili życia maszyny.");
