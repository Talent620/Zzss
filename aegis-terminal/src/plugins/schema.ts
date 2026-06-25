// schema.ts — the Plugin contract. A PhysicsModel is the hot-swappable unit that
// turns this generic terminal into a terminal for ONE specific device.
//
// Swapping a drone ESC for a battery spot-welder = loading a different
// physics_model.json. No recompile. The model carries everything the Physics
// Shield needs: the hardware safety envelope, the electrothermal coefficients the
// simulator runs, the instruction set the device accepts, the bus it speaks, and
// a manufacturer signature that authorizes it to drive real metal.

export type OpName = "SET_CURRENT_LIMIT" | "SET_VOLTAGE" | "RAMP" | "HOLD";

export type BusTransport = "usb-serial" | "bluetooth-spp" | "ble" | "elm327";

export interface HardwareEnvelope {
  maxVolts: number;
  maxTempC: number;
  maxCurrentA: number;
  rail: string;
}

export interface ThermalModel {
  dtMs: number;
  ambientC: number;
  thermalGain: number; // °C per (V*A) per step
  coolingRate: number; // first-order cooling coefficient
  degradationTempC: number; // temp above which wear accrues
}

export interface BusConfig {
  transport: BusTransport;
  baud?: number; // for usb-serial / elm327
  serviceUuid?: string; // for ble
  charUuid?: string; // for ble
  framing: string; // frame codec id the native bridge must implement
}

export interface ModelSignature {
  alg: "ed25519";
  publisher: string; // key id in the terminal's trusted-publisher set
  publicKeyHex: string;
  sigHex: string; // ed25519 over canonicalize(model-without-signature)
}

export interface PhysicsModel {
  schema: "aegis.physics_model/1";
  deviceId: string;
  displayName: string;
  envelope: HardwareEnvelope;
  thermal: ThermalModel;
  instructionSet: OpName[];
  bus: BusConfig;
  signature?: ModelSignature; // absent => SIM-ONLY (may never drive the bus)
}
