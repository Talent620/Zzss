# Aegis Terminal — Android Physical Terminal for the Aegis Physics Shield

A React Native (TypeScript) app that turns a phone into the **only sanctioned
gateway** between an AI agent and real hardware (a drone ESC, a battery spot
welder, an ECU). Every command is gated by an on-device **Physics Shield** — the
same two-wall verifier as the desktop `aegis/` core — that re-simulates the
operation locally and refuses to transmit anything unsafe. **The phone is the
last, offline, unbribable judge.**

> Built in TypeScript on purpose: the on-device shield is the *same code path* as
> `aegis/src/verifier/verify.ts`, not a reimplementation that could drift from it.

## Proven before it ships

The shield logic runs headlessly with no phone and no hardware:

```bash
cd aegis-terminal
npm install
npm run headless     # node --experimental-strip-types src/bridge/__demo__/headlessShield.ts
```

It demonstrates SYNC → ATTEST → VERIFY → EXEC, the `PHYSICS_VIOLATION` block, a
drone→welder **plugin hot-swap**, and a contained **malicious-model attack**.
Result: across the whole session, *only the two genuinely-safe ops on trusted
models ever reach the bus.*

## The four dashboard actions

| Button | Method | What it does (operator-facing) |
| --- | --- | --- |
| **[SYNC]** | `controller.sync()` | Connect and read the device's live physical limits/telemetry (voltage, temperature, current) and confirm the connected device matches the loaded model. |
| **[ATTEST]** | `controller.attestOperation()` | Generate the cryptographic **Proof-of-Thought** for the planned operation: hashes of the goal, the code, the safety claim, and the predicted simulation, signed by the agent. |
| **[VERIFY]** | `controller.verifyPending()` | Run the **Physics Shield locally** — *is this safe?* Re-simulates the operation and checks it against the device envelope. Sets `canExecute`. |
| **[EXEC]** | `controller.exec()` | Transmit to the bus — but **only** after a passing VERIFY on a trusted model. This is the single code path to the wire. |

If VERIFY fails, the **EXECUTE button goes grey** (`canExecute === false`) and the
log shows **`PHYSICS_VIOLATION`** with the verdict code. Editing the plan or
re-syncing invalidates the verdict and re-greys EXECUTE until you VERIFY again.

## Architecture

```
            ┌──────────────────────── React Native (TS) ────────────────────────┐
   agent ──►│ App.tsx ─ useBridge ─ DiagnosticDashboard (SYNC/ATTEST/VERIFY/EXEC)│
            │                              │                                     │
            │                     BridgeController.ts  ← the single chokepoint   │
            │            ┌─────────────────┼─────────────────┐                   │
            │   verify.ts (Physics Shield) │   PhysicsModelRegistry (plugins)    │
            │   physics.ts (sim, model-driven)   attest.ts (PoT, ed25519)        │
            │                              │                                     │
            │                     SerialTransport.ts (ISerialTransport)          │
            └──────────────────────────────┼────────────────────────────────────┘
                                            │  NativeModules.SerialBridge
            ┌──────────────────────────────┼────────────────────────────────────┐
            │  SerialBridgeModule.kt   ◄── PLUG IN ELM327 / USB-SERIAL / BT HERE  │
            └──────────────────────────────┼────────────────────────────────────┘
                                            ▼
                              Bluetooth / USB-Serial / OBD bus ──► hardware
```

Only `BridgeController.exec()` calls `transport.writeFrames()`, and it refuses
unless `canExecute()` is true (shield passed **and** model is `TRUSTED`).

## Plugin Architecture — retarget without recompiling

A device is described entirely by a **`physics_model.json`** (`src/plugins/schema.ts`):
its safety envelope, electrothermal coefficients, allowed instruction set, bus
config, and a **manufacturer signature**. Swapping a drone for a battery welder is
loading a different JSON — no APK rebuild.

```
src/models/drone_vreg.physics_model.json      maxV 13.2 / 95°C / 8A   · BLE
src/models/battery_welder.physics_model.json  maxV 5.0 / 120°C / 2000A · ELM327/USB
```

**Trust boundary (critical):** the model defines the safety envelope, so an
attacker who could upload an arbitrary model could disable the shield. The
`PhysicsModelRegistry` therefore:

- accepts a model **signed by a pinned trusted publisher** as `TRUSTED` (may drive the bus);
- loads any **unsigned or wrong-signed** model as `SIM_ONLY` — you can simulate and
  inspect it, but `exec()` will never transmit. The headless attack demo shows a
  forged `maxVolts: 9000` model being contained exactly this way.

Regenerate the bundled demo models (and the pinned publisher key) with:

```bash
node --experimental-strip-types src/models/_generate.ts
```

## >>> Where to plug in the ELM327 / Serial library <<<

Two clearly-marked seams:

1. **JS facade** — `src/bridge/SerialTransport.ts` (`NativeSerialTransport`). No
   change needed unless you add transports.
2. **Native owner of the wire** — `android/app/src/main/java/com/aegisterminal/SerialBridgeModule.kt`.
   Implement `connect / identify / writeFrames / disconnect` against your library,
   routed by `bus.transport`:

   | `bus.transport` | Library to wire in |
   | --- | --- |
   | `usb-serial`, `elm327` (USB/OBD cable) | **felHR85/UsbSerial** (`com.felhr.usbserial`) |
   | `bluetooth-spp` (ELM327 BT Classic) | **react-native-bluetooth-classic**, or `BluetoothSocket` on SPP UUID `00001101-…` |
   | `ble` (ELM327 BLE) | **react-native-ble-plx**, write to `serviceUuid`/`charUuid` |

   **Safety contract:** expose no bus-write method other than `writeFrames()`, and
   never add a "raw write" escape hatch — it would bypass the shield.

Permissions are already declared in `AndroidManifest.xml` (Bluetooth legacy +
`BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT` for Android 12+, USB host, USB-attach intent
filter via `res/xml/usb_device_filter.xml`). There is deliberately **no INTERNET
permission** — the shield is fully offline.

## Project layout

```
aegis-terminal/
├─ index.js · app.json · babel.config.js · metro.config.js · tsconfig.json
├─ android/app/src/main/
│  ├─ AndroidManifest.xml                 # BT + USB permissions
│  ├─ res/xml/usb_device_filter.xml       # USB VID/PID allowlist
│  └─ java/com/aegisterminal/
│     ├─ SerialBridgeModule.kt            # ◄── ELM327 / serial plug-in point
│     ├─ SerialBridgePackage.kt · MainApplication.kt · MainActivity.kt
└─ src/
   ├─ core/        canonical.ts · attest.ts          (hashing + Proof-of-Thought)
   ├─ sim/         powerscript.ts · physics.ts        (closed DSL + model-driven sim)
   ├─ verifier/    verify.ts                          (the Physics Shield: two walls)
   ├─ plugins/     schema.ts · PhysicsModelRegistry.ts (signed model plugins)
   ├─ bridge/      BridgeController.ts ·  SerialTransport.ts · types.ts
   │               __demo__/headlessShield.ts          (runnable proof)
   ├─ models/      *.physics_model.json · trusted-publishers.json
   └─ ui/          App.tsx · DiagnosticDashboard.tsx · hooks/useBridge.ts
```

## Build notes

This repo contains the **app source, the custom native module, the manifest, and
the full TypeScript core** — i.e. the parts that are specific to Aegis. To turn it
into a buildable APK, drop these into an `npx @react-native-community/cli init`
scaffold (RN 0.75) of the same name, or add the standard Gradle wrapper
(`android/build.gradle`, `settings.gradle`, `gradlew`). The `metro.config.js` here
already handles the `.ts` import specifiers the portable core uses.

`npm run headless` and the core typecheck (`tsc -p tsconfig.headless.json`) both
pass today and validate the security-critical logic without needing the Android
toolchain.

## Honest limits / next 30 days

Same hardening list as the desktop Aegis, plus mobile specifics:

1. **Protected verifier + keys.** Run the shield and hold the agent/verifier keys
   in the Android **StrongBox/TEE**, so a compromised JS bundle can't mint frames.
2. **Validated device models.** The guarantee reduces to "the model's physics
   matches reality" — models must be manufacturer-validated and signed on an HSM;
   the pinned publisher set must not be user-editable (provision via MDM).
3. **Determinism.** Tolerance-band the sim comparison rather than hashing raw
   floats, so platform FP differences don't read as false `SIM_DIVERGENCE`.
4. **Freshness.** Add nonces/expiry to attestations and a per-device monotonic
   counter so a captured frame can't be replayed onto the bus.
