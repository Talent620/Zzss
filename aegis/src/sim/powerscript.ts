// powerscript.ts — the ONLY language the agent is allowed to speak to hardware.
//
// Zero-Trust crux #1: the agent never ships native code that the device runs.
// It ships a PowerScript — a tiny, closed instruction set that a *trusted*,
// human-audited interpreter (the simulator) and the *trusted* Android bridge
// both understand. The agent's creativity is confined to choosing ops and
// numbers; it can never reach past this DSL to the metal. There is no `eval`.

export type Op =
  | { op: "SET_CURRENT_LIMIT"; amps: number }
  | { op: "SET_VOLTAGE"; volts: number }
  | { op: "RAMP"; toVolts: number; ms: number }
  | { op: "HOLD"; ms: number };

export interface PowerScript {
  target: string; // hardware rail address, e.g. "mcu.vreg.0"
  ops: Op[];
}

const ALLOWED = new Set(["SET_CURRENT_LIMIT", "SET_VOLTAGE", "RAMP", "HOLD"]);
const MAX_OPS = 64;
const MAX_MS = 60_000;

function finite(n: unknown): boolean {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Structural gate. Rejects anything that is not a well-formed PowerScript over
 * the closed instruction set, before any simulation is attempted. This is a
 * shape check only — physical safety is decided later, by the simulator.
 */
export function validateShape(script: PowerScript): string[] {
  const errs: string[] = [];
  if (!script || typeof script !== "object") return ["script is not an object"];
  if (typeof script.target !== "string" || !script.target) errs.push("missing target");
  if (!Array.isArray(script.ops)) return [...errs, "ops is not an array"];
  if (script.ops.length === 0) errs.push("ops is empty");
  if (script.ops.length > MAX_OPS) errs.push(`too many ops (>${MAX_OPS})`);

  script.ops.forEach((o, i) => {
    if (!o || typeof o !== "object" || !ALLOWED.has((o as Op).op)) {
      errs.push(`op[${i}]: unknown or malformed instruction`);
      return;
    }
    switch (o.op) {
      case "SET_CURRENT_LIMIT":
        if (!finite(o.amps) || o.amps <= 0) errs.push(`op[${i}]: bad amps`);
        break;
      case "SET_VOLTAGE":
        if (!finite(o.volts) || o.volts < 0) errs.push(`op[${i}]: bad volts`);
        break;
      case "RAMP":
        if (!finite(o.toVolts) || o.toVolts < 0) errs.push(`op[${i}]: bad toVolts`);
        if (!finite(o.ms) || o.ms <= 0 || o.ms > MAX_MS) errs.push(`op[${i}]: bad ms`);
        break;
      case "HOLD":
        if (!finite(o.ms) || o.ms <= 0 || o.ms > MAX_MS) errs.push(`op[${i}]: bad ms`);
        break;
    }
  });
  return errs;
}
