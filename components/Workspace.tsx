import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useMemo,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { parseBazaar, type BazaarSnapshot } from "../lib/bazaar";
import { items } from "../lib/forge/catalog";
import {
  defaultSettings,
  forgeSlots,
  settingsSchema,
  preferencesSchema,
  type Preferences,
  type Settings,
} from "../lib/forge/settings";

import { trackerResultSchema, type TrackerResult } from "../lib/forge/tracker";

const Context = createContext<{
  settings: Settings;
  update: (value: Partial<Preferences>) => void;
  account: TrackerResult | null;
  accountName: string;
  accountLoading: boolean;
  accountError: string;
  loadAccount: (player: string, profile?: string) => Promise<void>;
  disconnect: () => void;
  snapshot: BazaarSnapshot | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
} | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(() =>
    preferencesSchema.parse(defaultSettings),
  );
  const [account, setAccount] = useState<TrackerResult | null>(null);
  const [accountName, setAccountName] = useState("");
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState("");
  const accountRequest = useRef<AbortController | null>(null);
  const identity = useRef({ uuid: "", name: "" });
  const settings = useMemo(
    () =>
      settingsSchema.parse({
        ...defaultSettings,
        hotm: 0,
        ...preferences,
        ...account?.progression?.settings,
        moltenForge: account?.environment.moltenForge ?? false,
      }),
    [preferences, account],
  );
  const loadAccount = useCallback(async (player: string, profile?: string) => {
    accountRequest.current?.abort();
    const controller = new AbortController();
    accountRequest.current = controller;
    setAccountLoading(true);
    setAccountError("");
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const query = new URLSearchParams({ player: player.trim() });
      if (profile) query.set("profile", profile);
      const response = await fetch(`/api/forge?${query}`, {
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Could not load profile.");
      const parsed = trackerResultSchema.safeParse(body);
      if (!parsed.success)
        throw new Error("Profile response was incomplete. Try again.");
      const result = parsed.data;
      if (accountRequest.current !== controller) return;
      const name = /^[a-fA-F0-9-]{32,36}$/.test(player)
        ? identity.current.uuid === result.uuid
          ? identity.current.name
          : result.uuid
        : player.trim();
      identity.current = { uuid: result.uuid, name };
      setAccount(result);
      setAccountName(name);
      try {
        localStorage.setItem(
          "skyforger:account:v1",
          JSON.stringify({
            player: result.uuid,
            profile: result.selectedProfileId,
            name,
          }),
        );
      } catch {}
    } catch (cause) {
      if (accountRequest.current !== controller) return;
      setAccountError(
        controller.signal.aborted
          ? "Profile lookup timed out. Try again."
          : cause instanceof Error
            ? cause.message
            : "Could not load profile.",
      );
    } finally {
      clearTimeout(timeout);
      if (accountRequest.current === controller) setAccountLoading(false);
    }
  }, []);
  const disconnect = () => {
    accountRequest.current?.abort();
    accountRequest.current = null;
    identity.current = { uuid: "", name: "" };
    setAccount(null);
    setAccountName("");
    setAccountError("");
    setAccountLoading(false);
    try {
      localStorage.removeItem("skyforger:account:v1");
    } catch {}
  };
  const [ready, setReady] = useState(false);
  const [snapshot, setSnapshot] = useState<BazaarSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      const stored = preferencesSchema.safeParse(
        JSON.parse(localStorage.getItem("skyforger:settings:v1") ?? "null"),
      );
      if (stored.success) setPreferences(stored.data);
    } catch {}
    try {
      const saved = JSON.parse(
        localStorage.getItem("skyforger:account:v1") ?? "null",
      );
      if (
        typeof saved?.name === "string" &&
        typeof saved?.player === "string"
      ) {
        identity.current = { uuid: saved.player, name: saved.name };
        setAccountName(saved.name);
      }
      if (typeof saved?.player === "string")
        void loadAccount(
          saved.player,
          typeof saved.profile === "string" ? saved.profile : undefined,
        );
    } catch {}
    setReady(true);
    return () => {
      accountRequest.current?.abort();
      accountRequest.current = null;
    };
  }, [loadAccount]);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(
          "skyforger:settings:v1",
          JSON.stringify(preferences),
        );
      } catch {}
    }
  }, [preferences, ready]);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/bazaar", {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error("Bazaar unavailable. Try again shortly.");
      setSnapshot(parseBazaar(await response.json()));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load prices.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <Context.Provider
      value={{
        settings,
        update: (value) =>
          setPreferences((previous) =>
            preferencesSchema.parse({ ...previous, ...value }),
          ),
        account,
        accountName,
        accountLoading,
        accountError,
        loadAccount,
        disconnect,
        snapshot,
        loading,
        error,
        refresh,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("Workspace missing");
  return context;
}
export const coins = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
export function duration(value: number | null) {
  if (value === null) return "Unknown";
  const seconds = Math.max(0, Math.ceil(value));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function Workspace({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const { snapshot, loading, error, refresh } = useWorkspace();
  return (
    <>
      <Head>
        <title>{title} · SkyForger</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="workspace">
        <header>
          <Link className="brand" href="/">
            <span className="mark" aria-hidden="true">
              S
            </span>
            SkyForger
          </Link>
          <nav aria-label="Main">
            {[
              ["/", "Forge flips"],
              ["/planner", "Craft planner"],
              ["/tracker", "My forge"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                aria-current={router.pathname === href ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main>
          <div className="page-heading">
            <h1>{title}</h1>
            <div className="market-bar">
              <span>
                {loading
                  ? "Updating…"
                  : snapshot
                    ? `Prices ${new Date(snapshot.lastUpdated).toLocaleTimeString()}`
                    : "No prices loaded"}
              </span>
              <button onClick={refresh} disabled={loading}>
                Refresh prices
              </button>
            </div>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
              {snapshot && " Previous snapshot retained."}
            </p>
          )}
          {snapshot && Date.now() - snapshot.lastUpdated > 180000 && (
            <p className="notice">Market snapshot is over 3 minutes old.</p>
          )}
          <AccountSettings />
          <MarketSettings />
          {children}
        </main>
        <footer>SkyForger · Independent Hypixel SkyBlock companion</footer>
      </div>
    </>
  );
}

function AccountSettings() {
  const {
    settings,
    account,
    accountName,
    accountLoading,
    accountError,
    loadAccount,
    disconnect,
  } = useWorkspace();
  const [player, setPlayer] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void loadAccount(player);
  };
  return (
    <section className="panel account-panel" aria-label="SkyBlock account">
      <form className="toolbar" onSubmit={submit}>
        <input
          aria-label="Minecraft username or UUID"
          placeholder="Minecraft IGN"
          value={player}
          onChange={(event) => setPlayer(event.target.value)}
          required
        />
        <button className="primary" disabled={accountLoading}>
          {accountLoading ? "Loading profile…" : "Load account"}
        </button>
        {account && account.profiles.length > 0 && (
          <>
            <label>
              Profile
              <select
                aria-label="SkyBlock profile"
                value={account.selectedProfileId ?? ""}
                disabled={accountLoading}
                onChange={(event) =>
                  void loadAccount(account.uuid, event.target.value)
                }
              >
                {account.profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={accountLoading}
              onClick={() =>
                void loadAccount(
                  account.uuid,
                  account.selectedProfileId ?? undefined,
                )
              }
            >
              Refresh profile
            </button>
          </>
        )}
        {account && (
          <button type="button" onClick={disconnect}>
            Disconnect
          </button>
        )}
      </form>
      {accountError && (
        <p className="error" role="alert">
          {accountError}
        </p>
      )}
      {account?.availability === "no-profiles" && (
        <p className="notice">No SkyBlock profiles found.</p>
      )}
      {account?.progression && (
        <>
          <div className="account-summary">
            <strong>{accountName}</strong>
            <span>HOTM {settings.hotm}</span>
            <span>{forgeSlots(settings)} forge slots</span>
            <span>Quick Forge {settings.quickForge}</span>
            <span>Bazaar tax {Number((settings.tax * 100).toFixed(3))}%</span>
            <span>
              {account.environment.mayor ?? "Mayor unavailable"}
              {settings.moltenForge ? " · Molten Forge active" : ""}
            </span>
          </div>
          <details>
            <summary>Profile details</summary>
            <p className="notice">
              {Object.entries(settings.collections)
                .map(([name, level]) => `${name} ${level}`)
                .join(" · ")}
            </p>
            <p className="notice">
              {settings.unlocks.length} additional recipe unlocks · Updated{" "}
              {new Date(account.fetchedAt).toLocaleTimeString()}
            </p>
          </details>
          {[
            ...account.progression.warnings,
            ...account.environment.warnings,
          ].map((warning) => (
            <p key={warning} className="notice">
              {warning}
            </p>
          ))}
        </>
      )}
      {!account && !accountError && (
        <p className="notice">
          Load your IGN and select a profile to use your progression across all
          three tools.
        </p>
      )}
    </section>
  );
}

function MarketSettings() {
  const { settings, update } = useWorkspace();
  return (
    <details className="settings">
      <summary>Market settings</summary>
      <div className="settings-grid">
        <label>
          Buy ingredients
          <select
            value={settings.buyMode}
            onChange={(event) =>
              update({ buyMode: event.target.value as Settings["buyMode"] })
            }
          >
            <option value="instant">Instant buy</option>
            <option value="order">Buy order</option>
          </select>
        </label>
        <label>
          Bazaar sales
          <select
            value={settings.sellMode}
            onChange={(event) =>
              update({ sellMode: event.target.value as Settings["sellMode"] })
            }
          >
            <option value="instant">Instant sell</option>
            <option value="offer">Sell offer</option>
          </select>
        </label>
      </div>
      <PriceSettings />
    </details>
  );
}

function PriceSettings() {
  const { settings, update } = useWorkspace();
  const [selected, setSelected] = useState(items[0].id);
  return (
    <details>
      <summary>Price overrides ({Object.keys(settings.prices).length})</summary>
      <div className="settings-grid">
        <label>
          Item
          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {[...items]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Manual unit price
          <ManualPrice itemId={selected} />
        </label>
      </div>
      {Object.keys(settings.prices).map((id) => (
        <div key={id} className="toolbar">
          <span>{items.find((item) => item.id === id)?.name ?? id}</span>
          <ManualPrice itemId={id} />
          <button
            onClick={() => {
              const prices = { ...settings.prices };
              delete prices[id];
              update({ prices });
            }}
          >
            Reset
          </button>
        </div>
      ))}
    </details>
  );
}

export function ManualPrice({ itemId }: { itemId: string }) {
  const { settings, update } = useWorkspace();
  return (
    <input
      className="price-input"
      type="number"
      min={0}
      step="any"
      aria-label={`Manual unit price for ${items.find((item) => item.id === itemId)?.name ?? itemId}`}
      placeholder="Unit price"
      value={settings.prices[itemId] ?? ""}
      onChange={(event) => {
        const prices = { ...settings.prices };
        if (event.target.value === "") delete prices[itemId];
        else {
          const value = Number(event.target.value);
          if (!Number.isFinite(value) || value < 0) return;
          prices[itemId] = value;
        }
        update({ prices });
      }}
    />
  );
}
