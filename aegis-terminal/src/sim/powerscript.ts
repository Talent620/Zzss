// powerscript.ts — the closed instruction set the agent may speak to a device.
// Same DSL as the desktop Aegis, but the *allowed* ops are now gated per-device
// by the loaded PhysicsModel.instructionSet (a welder may forbid SET_VOLTAGE
// steps that a drone permits, etc.).

import type { OpName } from "../plugins/schema.ts";

export type Op =
  | { op: "SET_CURRENT_LIMIT"; amps: number }
  | { op: "SET_VOLTAGE"; volts: number }
  | { op: "RAMP"; toVolts: number; ms: number }
  | { op: "HOLD"; ms: number };

export interface PowerScript {
  target: string;
  ops: Op[];
}

const MAX_OPS = 64;
const MAX_MS = 60_000;

function finite(n: unknown): boolean {
  return typeof n === "number" && Number.isFinite(n);
}

/** Structural + per-model instruction-set validation. */
export function validateShape(script: PowerScript, allowed: OpName[]): string[] {
  const errs: string[] = [];
  const allow = new Set(allowed);
  if (!script || typeof script !== "object") return ["script is not an object"];
  if (typeof script.target !== "string" || !script.target) errs.push("missing target");
  if (!Array.isArray(script.ops)) return [...errs, "ops is not an array"];
  if (script.ops.length === 0) errs.push("ops is empty");
  if (script.ops.length > MAX_OPS) errs.push(`too many ops (>${MAX_OPS})`);

  script.ops.forEach((o, i) => {
    if (!o || typeof o !== "object" || !allow.has((o as Op).op as OpName)) {
      errs.push(`op[${i}]: instruction not permitted by this device model`);
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
