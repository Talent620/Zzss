// BridgeController.ts — the real-time core of the Aegis Terminal.
//
// It is the single chokepoint between the agent's intentions and the physical
// bus. Nothing reaches the wire except through exec(), and exec() refuses unless
// the Physics Shield (verify.ts) has just returned a passing verdict for the
// EXACT attestation in hand, on a TRUSTED device model.
//
// The four dashboard actions map 1:1 to methods:
//   [SYNC]   -> sync()    pull live limits / identity from the device
//   [ATTEST] -> attest()  generate the Proof-of-Thought for a planned operation
//   [VERIFY] -> verify()  local physical verification (is it safe?) -> sets canExecute
//   [EXEC]   -> exec()    transmit, but ONLY after a passing VERIFY
//
// State transitions drive the UI. After VERIFY, state is either VERIFIED_OK
// (EXECUTE enabled) or PHYSICS_VIOLATION (EXECUTE greyed + 'PHYSICS_VIOLATION'
// logged). Any edit to the planned op invalidates the verdict and re-greys EXEC.

import { createSimulator } from "../sim/physics.ts";
import type { Simulator } from "../sim/physics.ts";
import type { PowerScript } from "../sim/powerscript.ts";
import { attest } from "../core/attest.ts";
import type { AgentKey, AttestationBlock, SafetyClaim } from "../core/attest.ts";
import { verify } from "../verifier/verify.ts";
import type { Verdict } from "../verifier/verify.ts";
import type { ISerialTransport } from "./SerialTransport.ts";
import type { PhysicsModelRegistry, LoadedModel } from "../plugins/PhysicsModelRegistry.ts";
import type { BridgeState, BridgeSnapshot, LogLine, LogLevel } from "./types.ts";

export interface BridgeDeps {
  transport: ISerialTransport;
  registry: PhysicsModelRegistry;
  agentKey: AgentKey;
  onChange?: (snap: BridgeSnapshot) => void; // React subscribes here
}

export class BridgeController {
  private transport: ISerialTransport;
  private registry: PhysicsModelRegistry;
  private agentKey: AgentKey;
  private onChange?: (snap: BridgeSnapshot) => void;

  private loaded: LoadedModel | null = null;
  private simulate: Simulator | null = null;
  private state: BridgeState = "DISCONNECTED";
  private pending: AttestationBlock | null = null;
  private lastVerdict: Verdict | null = null;
  private tick = 0;
  private logs: LogLine[] = [];

  constructor(deps: BridgeDeps) {
    this.transport = deps.transport;
    this.registry = deps.registry;
    this.agentKey = deps.agentKey;
    this.onChange = deps.onChange;
  }

  // ── plugin: load a physics_model.json (drone <-> welder, no recompile) ──────
  loadModel(json: string): LoadedModel {
    const loaded = this.registry.load(json);
    this.loaded = loaded;
    this.simulate = createSimulator(loaded.model);
    this.pending = null;
    this.lastVerdict = null;
    this.state = "IDLE";
    this.log(loaded.trust === "TRUSTED" ? "OK" : "WARN", "MODEL", `${loaded.model.displayName} — ${loaded.reason}`);
    this.emit();
    return loaded;
  }

  // ── [SYNC] ─────────────────────────────────────────────────────────────────
  async sync(): Promise<void> {
    this.requireModel();
    await this.transport.connect(this.loaded!.model.bus);
    const r = await this.transport.identify();
    if (r.deviceId !== this.loaded!.model.deviceId) {
      this.log("BLOCK", "SYNC", `connected device ${r.deviceId} != loaded model ${this.loaded!.model.deviceId}`);
      this.state = "IDLE";
      this.emit();
      throw new Error("device/model mismatch");
    }
    this.invalidateVerdict();
    this.state = "SYNCED";
    this.log("OK", "SYNC", `live limits: ${r.volts}V / ${r.tempC}C / ${r.currentA}A on ${r.deviceId}`);
    this.emit();
  }

  // ── [ATTEST] ─────────────────────────────────────────────────────────────────
  attestOperation(goal: string, claim: SafetyClaim, script: PowerScript): AttestationBlock {
    this.requireModel();
    // The agent predicts results with the SAME trusted simulator (honest path).
    const claimedSim = this.simulate!(script);
    const block = attest(this.agentKey, this.loaded!.model.deviceId, this.tick++, goal, claim, script, claimedSim);
    this.pending = block;
    this.invalidateVerdict();
    this.state = "ATTESTED";
    this.log("INFO", "ATTEST", `codeHash=${block.pot.codeHash.slice(0, 12)} predicted peak=${claimedSim.peakVolts}V`);
    this.emit();
    return block;
  }

  // ── [VERIFY] — the Physics Shield runs locally; sets canExecute ──────────────
  verifyPending(): Verdict {
    this.requireModel();
    if (!this.pending) throw new Error("nothing to verify — ATTEST first");
    const verdict = verify(this.pending, this.loaded!.model, this.simulate!);
    this.lastVerdict = verdict;
    if (verdict.allowed) {
      this.state = "VERIFIED_OK";
      this.log("OK", "VERIFY", `safe: peak ${verdict.groundTruth?.peakVolts}V, diffBits=${verdict.diffBits}`);
    } else {
      this.state = "PHYSICS_VIOLATION";
      this.log("BLOCK", "VERIFY", `PHYSICS_VIOLATION [${verdict.code}] ${verdict.reason}`);
    }
    this.emit();
    return verdict;
  }

  // ── [EXEC] — the ONLY path to the bus ────────────────────────────────────────
  async exec(): Promise<void> {
    this.requireModel();
    if (!this.canExecute()) {
      this.log("BLOCK", "EXEC", "refused — no passing verdict / untrusted model / state not VERIFIED_OK");
      this.emit();
      throw new Error("EXEC blocked by Physics Shield");
    }
    const block = this.pending!;
    this.state = "EXECUTING";
    this.emit();
    const frames = block.payload.script.ops.map((o, i) => `AEGIS|${block.payload.script.target}|${i}|${JSON.stringify(o)}`);
    await this.transport.writeFrames(frames);
    this.state = "EXECUTED";
    this.log("OK", "EXEC", `transmitted ${frames.length} frame(s) to ${block.payload.script.target}`);
    this.emit();
  }

  // EXECUTE button enabled iff: shield passed, model is TRUSTED, and the verdict
  // still matches the pending op (no edits since VERIFY).
  canExecute(): boolean {
    return (
      this.state === "VERIFIED_OK" &&
      !!this.lastVerdict?.allowed &&
      !!this.loaded &&
      this.loaded.trust === "TRUSTED" &&
      !!this.pending
    );
  }

  snapshot(): BridgeSnapshot {
    return {
      state: this.state,
      deviceId: this.loaded?.model.deviceId ?? null,
      trust: this.loaded?.trust ?? null,
      canExecute: this.canExecute(),
      lastVerdict: this.lastVerdict ? `${this.lastVerdict.code}: ${this.lastVerdict.reason}` : null,
      logs: this.logs.slice(-100),
    };
  }

  // ── internals ────────────────────────────────────────────────────────────────
  private requireModel() {
    if (!this.loaded || !this.simulate) throw new Error("no physics model loaded");
  }
  private invalidateVerdict() {
    this.lastVerdict = null; // editing/syncing re-greys EXECUTE until re-verified
  }
  private log(level: LogLevel, tag: string, msg: string) {
    this.logs.push({ tick: this.tick, level, tag, msg });
  }
  private emit() {
    this.onChange?.(this.snapshot());
  }
}
