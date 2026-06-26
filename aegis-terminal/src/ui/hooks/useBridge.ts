// useBridge.ts — binds the BridgeController to React state.
//
// The controller is created once and pushes a fresh snapshot on every state
// change via onChange; the UI re-renders from that snapshot. The EXECUTE button
// reads snapshot.canExecute directly — there is no separate UI guess about safety.

import { useMemo, useRef, useState } from "react";
import { BridgeController } from "../../bridge/BridgeController.ts";
import { NativeSerialTransport } from "../../bridge/SerialTransport.ts";
import { PhysicsModelRegistry } from "../../plugins/PhysicsModelRegistry.ts";
import { newAgentKey } from "../../core/attest.ts";
import type { SafetyClaim } from "../../core/attest.ts";
import type { PowerScript } from "../../sim/powerscript.ts";
import type { BridgeSnapshot } from "../../bridge/types.ts";
import trustedPublishers from "../../models/trusted-publishers.json";

const EMPTY: BridgeSnapshot = {
  state: "DISCONNECTED",
  deviceId: null,
  trust: null,
  canExecute: false,
  lastVerdict: null,
  logs: [],
};

export function useBridge() {
  const [snap, setSnap] = useState<BridgeSnapshot>(EMPTY);

  const controller = useMemo(() => {
    return new BridgeController({
      transport: new NativeSerialTransport(),
      registry: new PhysicsModelRegistry(trustedPublishers as Record<string, string>),
      agentKey: newAgentKey("jarvis-mobile"),
      onChange: setSnap,
    });
  }, []);

  // Stable action handles for the four dashboard buttons.
  const actions = useRef({
    loadModel: (json: string) => controller.loadModel(json),
    sync: () => controller.sync(),
    attest: (goal: string, claim: SafetyClaim, script: PowerScript) =>
      controller.attestOperation(goal, claim, script),
    verify: () => controller.verifyPending(),
    exec: () => controller.exec(),
  }).current;

  return { snap, actions };
}
