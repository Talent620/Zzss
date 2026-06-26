// types.ts — bridge state + event surface the UI binds to.

export type BridgeState =
  | "DISCONNECTED" // no model / no transport
  | "IDLE" // model loaded, not synced
  | "SYNCED" // device identified, live limits read
  | "ATTESTED" // an attestation exists, not yet verified
  | "VERIFIED_OK" // shield passed — EXECUTE enabled
  | "PHYSICS_VIOLATION" // shield blocked — EXECUTE disabled (grey)
  | "EXECUTING"
  | "EXECUTED";

export type LogLevel = "INFO" | "OK" | "WARN" | "BLOCK";

export interface LogLine {
  tick: number;
  level: LogLevel;
  tag: string;
  msg: string;
}

export interface BridgeSnapshot {
  state: BridgeState;
  deviceId: string | null;
  trust: "TRUSTED" | "SIM_ONLY" | null;
  canExecute: boolean; // drives the EXECUTE button's enabled/grey state
  lastVerdict: string | null;
  logs: LogLine[];
}
