// App.tsx — top-level wiring. Loads a default device plugin, exposes the
// dashboard, and (TODO) lets the operator import a new physics_model.json via the
// system file picker to retarget the terminal without a rebuild.

import React, { useEffect, useState } from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import { useBridge } from "./hooks/useBridge.ts";
import { DiagnosticDashboard } from "./DiagnosticDashboard.tsx";
import type { SafetyClaim } from "../core/attest.ts";
import type { PowerScript } from "../sim/powerscript.ts";
// Bundled default model so the app is usable on first launch. A real build can
// also load models at runtime — see loadModelFromFile() below.
import droneModel from "../models/drone_vreg.physics_model.json";

const PLANNED_GOAL = "hold rail at 12.6V";
const PLANNED_CLAIM: SafetyClaim = { invariant: "PEAK_VOLTS_LE", threshold: 13.2 };
const PLANNED_SCRIPT: PowerScript = {
  target: "drone.esc.vreg.0",
  ops: [{ op: "SET_CURRENT_LIMIT", amps: 5 }, { op: "RAMP", toVolts: 12.6, ms: 100 }, { op: "HOLD", ms: 200 }],
};

export default function App() {
  const { snap, actions } = useBridge();

  useEffect(() => {
    actions.loadModel(JSON.stringify(droneModel));
  }, [actions]);

  // TODO(plugin): wire react-native-document-picker here to let the operator pick
  // a physics_model.json from storage, read it, and call actions.loadModel(text).
  // Swapping drone <-> battery welder needs no rebuild — only a new signed model.
  // async function loadModelFromFile() {
  //   const res = await DocumentPicker.pickSingle({ type: ['application/json'] });
  //   const text = await RNFS.readFile(res.uri, 'utf8');
  //   actions.loadModel(text);
  // }

  return (
    <SafeAreaView style={styles.root}>
      <DiagnosticDashboard
        snap={snap}
        onSync={() => actions.sync().catch(() => {})}
        onAttest={actions.attest}
        onVerify={() => actions.verify()}
        onExec={() => actions.exec().catch(() => {})}
        plannedGoal={PLANNED_GOAL}
        plannedClaim={PLANNED_CLAIM}
        plannedScript={PLANNED_SCRIPT}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0f14" },
});
