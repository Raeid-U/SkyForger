import { useEffect, useState } from "react";
import {
  browserKeys,
  readBrowserValue,
  writeBrowserValue,
} from "../lib/browser-storage";
import { useWorkspace } from "./Workspace";

export function Appearance() {
  const { consent } = useWorkspace();
  const [mode, setMode] = useState<"standard" | "pixel" | null>(null);
  useEffect(() => {
    try {
      const saved = readBrowserValue(browserKeys.typography);
      setMode(saved === "pixel" ? "pixel" : "standard");
    } catch {
      setMode("standard");
    }
  }, []);
  useEffect(() => {
    if (mode) document.documentElement.dataset.typeMode = mode;
  }, [mode]);
  useEffect(() => {
    if (mode && consent === "allow")
      writeBrowserValue(browserKeys.typography, mode);
  }, [mode, consent]);
  return (
    <label className="appearance">
      Type
      <select
        aria-label="Interface typography"
        value={mode ?? "standard"}
        onChange={(event) => {
          setMode(event.target.value === "pixel" ? "pixel" : "standard");
          try {
            writeBrowserValue(browserKeys.typography, event.target.value);
          } catch {}
        }}
      >
        <option value="standard">Standard</option>
        <option value="pixel">Pixel UI (Minecraft-inspired)</option>
      </select>
    </label>
  );
}
