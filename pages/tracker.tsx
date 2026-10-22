import { Modal } from "../components/Modal";
import { ItemIcon } from "../components/ItemIcon";
import { useEffect, useState } from "react";
import { Workspace, useWorkspace } from "../components/Workspace";
import { itemById } from "../lib/forge/catalog";
import { forgeSlots, quickForgeReduction } from "../lib/forge/settings";
import type { TrackedJob } from "../lib/forge/tracker";

function timeLeft(seconds: number) {
  const value = Math.max(0, Math.ceil(seconds));
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  if (value >= 60) return `${minutes}m`;
  return `${value}s`;
}

function Job({
  job,
  now,
  quickForge,
}: {
  job: TrackedJob;
  now: number;
  quickForge: number | null;
}) {
  const [showTiming, setShowTiming] = useState(false);
  const known = job.baseDuration !== null && quickForge !== null && now > 0;
  const reduction = quickForgeReduction(quickForge ?? 0);
  // Preserve the existing timing window: Molten Forge eligibility at job start is unknown.
  const latest = known
    ? job.startedAt + Math.ceil(job.baseDuration! * (1 - reduction)) * 1000
    : null;
  const earliest = known
    ? job.startedAt +
      Math.ceil(job.baseDuration! * (1 - reduction - 0.25)) * 1000
    : null;
  const pastEstimate = latest !== null && now >= latest;
  const possiblyReady = !pastEstimate && earliest !== null && now >= earliest;
  const name =
    (job.itemId ? itemById.get(job.itemId)?.name : null) ?? job.apiItemId;
  const status = pastEstimate
    ? "Past latest estimate"
    : possiblyReady
      ? "May already be ready"
      : known
        ? "Could finish sooner"
        : "Recipe or perk data unavailable";
  return (
    <li
      className={`forge-entry ${pastEstimate || possiblyReady ? "forge-ready" : ""}`}
    >
      <div className="forge-job-row">
        <span className="forge-slot-id">
          <span className="sr-only">Slot </span>
          {String(job.slot).padStart(2, "0")}
        </span>
        <div className="forge-job-identity">
          <ItemIcon itemId={job.itemId ?? job.apiItemId} />
          <div>
            <h2>{name}</h2>
            <div className="forge-job-meta">
              <p className="forge-started">
                Started{" "}
                <time dateTime={new Date(job.startedAt).toISOString()}>
                  {new Date(job.startedAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </p>
              <button
                onClick={() => setShowTiming(true)}
                aria-haspopup="dialog"
              >
                Timing details
              </button>
            </div>
          </div>
        </div>
        <div className="forge-timing">
          <span className="sr-only">
            {known && !pastEstimate
              ? "Estimated time left"
              : "Completion estimate"}
          </span>
          <strong
            className={`forge-countdown ${pastEstimate ? "ready-label" : ""}`}
          >
            {pastEstimate ? (
              "Ready to check"
            ) : latest !== null ? (
              <>
                <span className="time-prefix">Up to </span>
                <span className="time-value">
                  {timeLeft((latest - now) / 1000)}
                </span>
              </>
            ) : (
              "Time unavailable"
            )}
          </strong>
          <span
            className={`forge-time-note ${possiblyReady ? "positive" : ""}`}
          >
            {status}
          </span>
        </div>
      </div>
      <Modal
        open={showTiming}
        onClose={() => setShowTiming(false)}
        title={`Slot ${String(job.slot).padStart(2, "0")} · Timing details`}
      >
        <p className="item-name">
          <ItemIcon itemId={job.itemId ?? job.apiItemId} />
          {name}
        </p>
        {earliest !== null && latest !== null ? (
          <>
            <dl className="forge-completion-window">
              <div>
                <dt>Earliest estimate</dt>
                <dd>
                  <time dateTime={new Date(earliest).toISOString()}>
                    {new Date(earliest).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZoneName: "short",
                    })}
                  </time>
                </dd>
              </div>
              <div>
                <dt>Latest estimate</dt>
                <dd>
                  <time dateTime={new Date(latest).toISOString()}>
                    {new Date(latest).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZoneName: "short",
                    })}
                  </time>
                </dd>
              </div>
            </dl>
            <p>
              Includes Quick Forge level {quickForge}. The earlier estimate
              assumes Molten Forge applied when this job started; the later
              estimate assumes it did not. Kinetic reductions may finish the job
              earlier still.
            </p>
            {pastEstimate && (
              <p>
                This job is still reported by the API. Check in game to confirm
                completion and collect it.
              </p>
            )}
          </>
        ) : (
          <p>
            {job.baseDuration === null
              ? "This item has no known base duration in the catalog."
              : "Profile perk data is unavailable."}{" "}
            A completion time cannot be estimated reliably. Started{" "}
            <time dateTime={new Date(job.startedAt).toISOString()}>
              {new Date(job.startedAt).toLocaleString()}
            </time>
            .
          </p>
        )}
      </Modal>
    </li>
  );
}

export default function Tracker() {
  const {
    settings,
    account: result,
    accountLoading,
    loadAccount,
  } = useWorkspace();
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const jobs = [...(result?.jobs ?? [])].sort((a, b) => a.slot - b.slot);
  const profileCapacity = result?.progression ? forgeSlots(settings) : null;
  const capacity =
    profileCapacity !== null &&
    profileCapacity > 0 &&
    profileCapacity >= jobs.length
      ? profileCapacity
      : null;
  const emptySlots = capacity === null ? null : capacity - jobs.length;
  return (
    <Workspace title="My forge">
      {!result ? (
        <div className="tracker-empty">
          <h2>
            {accountLoading ? "Loading your forge…" : "Your forge, at a glance"}
          </h2>
          <p>
            Connect your profile above to see its jobs and estimated completion
            times.
          </p>
        </div>
      ) : result.availability === "no-profiles" ? (
        <div className="tracker-empty">
          <h2>No SkyBlock profiles found</h2>
          <p>Use the account settings above to load another account.</p>
        </div>
      ) : result.availability === "missing-data" ? (
        <div className="tracker-empty">
          <h2>Forge data is unavailable</h2>
          <p>
            This profile does not expose its forge jobs. Missing data does not
            mean the slots are empty.
          </p>
          <button
            onClick={() =>
              void loadAccount(
                result.uuid,
                result.selectedProfileId ?? undefined,
              )
            }
            disabled={accountLoading}
          >
            {accountLoading ? "Refreshing…" : "Try again"}
          </button>
        </div>
      ) : (
        <section className="forge-workspace" aria-label="Profile forge">
          <div className="forge-overview">
            <p>
              <strong>{jobs.length} occupied</strong>
              {capacity !== null && <span> / {capacity} slots</span>}
            </p>
            <div className="forge-observation">
              <span>
                Observed{" "}
                {new Date(result.fetchedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
              </span>
              <button
                onClick={() =>
                  void loadAccount(
                    result.uuid,
                    result.selectedProfileId ?? undefined,
                  )
                }
                disabled={accountLoading}
              >
                {accountLoading ? "Refreshing…" : "Refresh forge"}
              </button>
            </div>
          </div>
          {jobs.length > 0 && (
            <>
              <p className="forge-estimate-note">
                Times are estimates. Each countdown shows the latest expected
                finish; jobs can finish sooner.
              </p>
              <div className="forge-list-heading" aria-hidden="true">
                <span>Slot</span>
                <span>Forge job</span>
                <span>Estimated time left</span>
              </div>
              <ol className="forge-list" aria-label="Forge slots">
                {jobs.map((job) => (
                  <Job
                    key={job.slot}
                    job={job}
                    now={now}
                    quickForge={result.progression ? settings.quickForge : null}
                  />
                ))}
              </ol>
            </>
          )}
          {emptySlots !== null && emptySlots > 0 ? (
            <div className="forge-vacancy">
              <span aria-hidden="true">—</span>
              <div>
                <strong>
                  {emptySlots} {emptySlots === 1 ? "slot has" : "slots have"} no
                  reported job
                </strong>
                <p>
                  {jobs.length
                    ? "Start another forge job in game, then refresh to see it here."
                    : "Your forge is empty. Start a job in game, then refresh to see it here."}
                </p>
              </div>
            </div>
          ) : (
            jobs.length === 0 && (
              <div className="tracker-empty">
                <h2>No active forge jobs</h2>
                <p>Start a job in game, then refresh to see it here.</p>
              </div>
            )
          )}
          {!result.progression && (
            <p className="notice">
              Slot capacity and timing estimates are unavailable without profile
              progression data.
            </p>
          )}
        </section>
      )}
    </Workspace>
  );
}
