import { useEffect, useState } from "react";

export function Appearance() {
  const [mode, setMode] = useState<"standard" | "pixel" | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("skyforger:type-mode");
      setMode(saved === "pixel" ? "pixel" : "standard");
    } catch {
      setMode("standard");
    }
  }, []);
  useEffect(() => {
    if (mode) document.documentElement.dataset.typeMode = mode;
  }, [mode]);
  return (
    <label className="appearance">
      Type
      <select
        aria-label="Interface typography"
        value={mode ?? "standard"}
        onChange={(event) => {
          setMode(event.target.value === "pixel" ? "pixel" : "standard");
          try {
            localStorage.setItem("skyforger:type-mode", event.target.value);
          } catch {}
        }}
      >
        <option value="standard">Standard</option>
        <option value="pixel">Pixel UI (Minecraft-inspired)</option>
      </select>
    </label>
  );
}
