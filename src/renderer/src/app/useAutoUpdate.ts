import { useEffect, useState } from "react";
import type { UpdateStatus } from "../domain/models";
import { detectRuntime } from "./runtime";
import * as gateway from "../services/inventoryGateway";

export function useAutoUpdate() {
  const [status, setStatus] = useState<UpdateStatus>({ stage: "idle" });

  useEffect(() => {
    if (detectRuntime() !== "desktop") return;
    const unsub = gateway.onAutoUpdateStatus(setStatus);
    return unsub;
  }, []);

  return {
    updateStatus: status,
    downloadUpdate: () => void gateway.downloadUpdate(),
    installUpdate: () => void gateway.installUpdate(),
    dismissUpdate: () => setStatus({ stage: "idle" }),
  };
}
