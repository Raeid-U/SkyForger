import { ItemIcon } from "../components/ItemIcon";
import { useEffect, useState } from "react";
import { Workspace, duration, useWorkspace } from "../components/Workspace";
import { itemById } from "../lib/forge/catalog";
import { quickForgeReduction } from "../lib/forge/settings";
import type { TrackedJob } from "../lib/forge/tracker";

export default function Tracker() {
  const { settings, account: result } = useWorkspace();
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  function remaining(job: TrackedJob) {
    if (job.baseDuration === null) return "Unknown recipe";
    const reduction = quickForgeReduction(settings.quickForge);
    const latest =
      job.startedAt + Math.ceil(job.baseDuration * (1 - reduction)) * 1000;
    const earliest =
      job.startedAt +
      Math.ceil(job.baseDuration * (1 - reduction - 0.25)) * 1000;
    if (latest <= now) return "Ready (estimated)";
    if (earliest <= now) return `Up to ${duration((latest - now) / 1000)}`;
    return `${duration((earliest - now) / 1000)} – ${duration((latest - now) / 1000)}`;
  }
  return (
    <Workspace title="My forge">
      {!result && (
        <div className="empty panel">
          Load your account above to see active forge slots.
        </div>
      )}
      {result && (
        <>
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
                Estimates use your profile’s Quick Forge perk. Ranges account
                for unknown Molten Forge eligibility when jobs started; Kinetic
                reductions may finish jobs earlier.
              </p>
              <div className="forge-grid">
                {result.jobs.map((job) => (
                  <section className="panel forge-slot" key={job.slot}>
                    <span className="eyebrow">SLOT {job.slot}</span>
                    <h2 className="item-name">
                      <ItemIcon itemId={job.itemId ?? job.apiItemId} />
                      {job.itemId
                        ? itemById.get(job.itemId)?.name
                        : job.apiItemId}
                    </h2>
                    <strong className="countdown">{remaining(job)}</strong>
                    <p className="muted">
                      Started {new Date(job.startedAt).toLocaleString()}
                    </p>
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
