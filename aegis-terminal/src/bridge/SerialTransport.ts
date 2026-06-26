// SerialTransport.ts — the seam between TypeScript logic and physical wires.
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  >>> THIS IS WHERE YOU PLUG IN THE ELM327 / SERIAL LIBRARY <<<            ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// BridgeController talks ONLY to this interface. To make the app actually speak to
// hardware, implement ISerialTransport against a real library. Recommended:
//
//   • USB-Serial / OBD cable (ELM327 USB):  felHR85/UsbSerial  (Kotlin, native)
//        exposed here via NativeModules.SerialBridge (see android/.../SerialBridgeModule.kt)
//   • Bluetooth Classic SPP (ELM327 BT):    react-native-bluetooth-classic
//   • Bluetooth LE (ELM327 BLE):            react-native-ble-plx
//
// The bus transport to use is chosen per-device by PhysicsModel.bus.transport,
// so a single build can drive a USB welder and a BLE drone without code changes.

import { NativeModules } from "react-native";
import type { BusConfig } from "../plugins/schema.ts";

export interface DeviceReadings {
  deviceId: string;
  volts: number;
  tempC: number;
  currentA: number;
}

export interface ISerialTransport {
  connect(bus: BusConfig): Promise<void>;
  /** SYNC: read device identity + live physical limits/telemetry. */
  identify(): Promise<DeviceReadings>;
  /** EXEC: write authorized frames to the bus. Called ONLY by BridgeController. */
  writeFrames(frames: string[]): Promise<void>;
  disconnect(): Promise<void>;
}

/**
 * Production transport. Delegates to the native Kotlin module, which owns the
 * actual ELM327/USB/BLE handle. The native module is the real plug-in point;
 * this class is just the typed JS facade over it.
 */
export class NativeSerialTransport implements ISerialTransport {
  private native = NativeModules.SerialBridge as {
    connect(bus: BusConfig): Promise<void>;
    identify(): Promise<DeviceReadings>;
    writeFrames(frames: string[]): Promise<void>;
    disconnect(): Promise<void>;
  };

  connect(bus: BusConfig): Promise<void> {
    // TODO(plug-in): in SerialBridgeModule.kt, route `bus.transport` to felHR85
    // (usb-serial), bluetooth-classic (spp), or ble-plx (ble) and open the port.
    return this.native.connect(bus);
  }
  identify(): Promise<DeviceReadings> {
    return this.native.identify();
  }
  writeFrames(frames: string[]): Promise<void> {
    return this.native.writeFrames(frames);
  }
  disconnect(): Promise<void> {
    return this.native.disconnect();
  }
}
