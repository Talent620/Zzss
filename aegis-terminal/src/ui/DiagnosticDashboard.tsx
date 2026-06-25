// DiagnosticDashboard.tsx — the operator's screen.
//
// Four actions, each a button: SYNC, ATTEST, VERIFY, EXEC. The EXECUTE button is
// disabled (grey) unless the Physics Shield has just passed. When it blocks, the
// log shows PHYSICS_VIOLATION. This component is intentionally thin — all the
// decisions live in BridgeController; the UI only reflects the snapshot.

import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { BridgeSnapshot, LogLine } from "../bridge/types.ts";
import type { SafetyClaim } from "../core/attest.ts";
import type { PowerScript } from "../sim/powerscript.ts";

interface Props {
  snap: BridgeSnapshot;
  onSync: () => void;
  onAttest: (goal: string, claim: SafetyClaim, script: PowerScript) => void;
  onVerify: () => void;
  onExec: () => void;
  // The currently planned operation (e.g. from a form). Stubbed here.
  plannedGoal: string;
  plannedClaim: SafetyClaim;
  plannedScript: PowerScript;
}

const LOG_COLOR: Record<LogLine["level"], string> = {
  INFO: "#9ad", OK: "#6c6", WARN: "#dc6", BLOCK: "#e55",
};

function Btn(props: { label: string; hint: string; disabled?: boolean; danger?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.btn, props.disabled && styles.btnDisabled, props.danger && !props.disabled && styles.btnDanger]}
      disabled={props.disabled}
      onPress={props.onPress}
    >
      <Text style={[styles.btnLabel, props.disabled && styles.btnLabelDisabled]}>{props.label}</Text>
      <Text style={styles.btnHint}>{props.hint}</Text>
    </TouchableOpacity>
  );
}

export function DiagnosticDashboard(props: Props) {
  const { snap } = props;
  const blocked = snap.state === "PHYSICS_VIOLATION";

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>AEGIS TERMINAL</Text>
        <Text style={styles.sub}>
          {snap.deviceId ?? "no device"} · {snap.trust ?? "—"} · {snap.state}
        </Text>
      </View>

      <View style={styles.row}>
        <Btn label="SYNC" hint="read device limits" onPress={props.onSync} />
        <Btn label="ATTEST" hint="prove the plan" onPress={() => props.onAttest(props.plannedGoal, props.plannedClaim, props.plannedScript)} />
      </View>
      <View style={styles.row}>
        <Btn label="VERIFY" hint="is it safe?" onPress={props.onVerify} />
        {/* EXECUTE is grey unless the shield passed AND model is trusted. */}
        <Btn label="EXEC" hint="send to bus" danger disabled={!snap.canExecute} onPress={props.onExec} />
      </View>

      {blocked && (
        <View style={styles.violation}>
          <Text style={styles.violationText}>PHYSICS_VIOLATION</Text>
          <Text style={styles.violationSub}>{snap.lastVerdict}</Text>
        </View>
      )}

      <Text style={styles.logHeader}>LOG</Text>
      <ScrollView style={styles.log}>
        {snap.logs.map((l, i) => (
          <Text key={i} style={[styles.logLine, { color: LOG_COLOR[l.level] }]}>
            [{l.tag}] {l.msg}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0f14", padding: 16 },
  header: { marginBottom: 16 },
  title: { color: "#cfe", fontSize: 22, fontWeight: "700", letterSpacing: 2 },
  sub: { color: "#7a8", fontSize: 12, marginTop: 4 },
  row: { flexDirection: "row", gap: 12, marginBottom: 12 },
  btn: { flex: 1, backgroundColor: "#15314a", borderRadius: 10, padding: 16, borderWidth: 1, borderColor: "#27506e" },
  btnDanger: { backgroundColor: "#3a1530", borderColor: "#7e2a55" },
  btnDisabled: { backgroundColor: "#1a1d22", borderColor: "#2a2e35" },
  btnLabel: { color: "#dff", fontSize: 18, fontWeight: "700", letterSpacing: 1 },
  btnLabelDisabled: { color: "#555c66" },
  btnHint: { color: "#8aa", fontSize: 11, marginTop: 4 },
  violation: { backgroundColor: "#2a0d12", borderColor: "#e55", borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
  violationText: { color: "#ff6b6b", fontSize: 18, fontWeight: "800", letterSpacing: 2 },
  violationSub: { color: "#e99", fontSize: 12, marginTop: 4 },
  logHeader: { color: "#7a8", fontSize: 11, letterSpacing: 2, marginBottom: 6 },
  log: { flex: 1, backgroundColor: "#06090d", borderRadius: 8, padding: 10 },
  logLine: { fontFamily: "monospace", fontSize: 12, marginBottom: 2 },
});
