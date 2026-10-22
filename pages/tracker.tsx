import { useEffect, useState, type FormEvent } from "react";
import { Workspace, duration, useWorkspace } from "../components/Workspace";
import { itemById } from "../lib/forge/catalog";
import { quickForgeReduction } from "../lib/forge/settings";
import type { TrackedJob, TrackerResult } from "../lib/forge/tracker";

export default function Tracker() {
  const { settings } = useWorkspace();
  const [player, setPlayer] = useState("");
  const [result, setResult] = useState<TrackerResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(0);
  const [molten, setMolten] = useState<
    Record<number, "unknown" | "yes" | "no">
  >({});
  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  async function load(event?: FormEvent, profile?: string) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        player: profile && result ? result.uuid : player.trim(),
      });
      if (profile) query.set("profile", profile);
      const response = await fetch(`/api/forge?${query}`, {
        signal: AbortSignal.timeout(20000),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Could not load your forge.");
      setResult(body);
      setMolten({});
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load your forge.",
      );
      setResult(null);
    } finally {
      setLoading(false);
    }
  }
  function remaining(job: TrackedJob) {
    if (job.baseDuration === null) return "Unknown recipe";
    const reduction = quickForgeReduction(settings.quickForge);
    const latest =
      job.startedAt + Math.ceil(job.baseDuration * (1 - reduction)) * 1000;
    const earliest =
      job.startedAt +
      Math.ceil(job.baseDuration * (1 - reduction - 0.25)) * 1000;
    const choice = molten[job.slot] ?? "unknown";
    if (choice !== "unknown") {
      const ready = choice === "yes" ? earliest : latest;
      return ready <= now
        ? "Ready (estimated)"
        : duration((ready - now) / 1000);
    }
    if (latest <= now) return "Ready (estimated)";
    if (earliest <= now) return `Up to ${duration((latest - now) / 1000)}`;
    return `${duration((earliest - now) / 1000)} – ${duration((latest - now) / 1000)}`;
  }
  return (
    <Workspace title="My forge">
      <form className="toolbar" onSubmit={(event) => void load(event)}>
        <input
          className="grow"
          aria-label="Minecraft username or UUID"
          placeholder="Minecraft username or UUID"
          required
          value={player}
          onChange={(event) => setPlayer(event.target.value)}
        />
        <button className="primary" disabled={loading}>
          {loading ? "Loading…" : "Load forge"}
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!result && !error && (
        <div className="empty panel">
          Enter your account to see active forge slots.
        </div>
      )}
      {result && (
        <>
          <div className="toolbar">
            <label>
              Profile
              <select
                disabled={loading}
                value={result.selectedProfileId ?? ""}
                onChange={(event) => void load(undefined, event.target.value)}
              >
                {result.profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="muted">
              Checked {new Date(result.fetchedAt).toLocaleTimeString()}
            </span>
            <button
              disabled={loading}
              onClick={() =>
                void load(undefined, result.selectedProfileId ?? undefined)
              }
            >
              Refresh forge
            </button>
          </div>
          {result.availability === "no-profiles" ? (
            <p className="empty panel">No SkyBlock profiles found.</p>
          ) : result.availability === "missing-data" ? (
            <p className="empty panel">
              Forge data is unavailable for this profile.
            </p>
          ) : !result.jobs.length ? (
            <p className="empty panel">No active forge jobs.</p>
          ) : (
            <>
              <p className="notice">
                Estimates use your Quick Forge setting. Kinetic reductions may
                finish jobs earlier.
              </p>
              <div className="forge-grid">
                {result.jobs.map((job) => (
                  <section className="panel forge-slot" key={job.slot}>
                    <span className="eyebrow">SLOT {job.slot + 1}</span>
                    <h2>
                      {job.itemId
                        ? itemById.get(job.itemId)?.name
                        : job.apiItemId}
                    </h2>
                    <strong className="countdown">{remaining(job)}</strong>
                    <p className="muted">
                      Started {new Date(job.startedAt).toLocaleString()}
                    </p>
                    <label>
                      Molten Forge when started
                      <select
                        value={molten[job.slot] ?? "unknown"}
                        onChange={(event) =>
                          setMolten({
                            ...molten,
                            [job.slot]: event.target.value as
                              "unknown" | "yes" | "no",
                          })
                        }
                      >
                        <option value="unknown">Unknown</option>
                        <option value="yes">Active</option>
                        <option value="no">Inactive</option>
                      </select>
                    </label>
                  </section>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Workspace>
  );
}
