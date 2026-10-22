import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { parseBazaar, type BazaarSnapshot } from "../lib/bazaar";
import { items, recipes } from "../lib/forge/catalog";
import {
  defaultSettings,
  forgeSlots,
  settingsSchema,
  type Settings,
} from "../lib/forge/settings";

const Context = createContext<{
  settings: Settings;
  update: (value: Partial<Settings>) => void;
  snapshot: BazaarSnapshot | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
} | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(defaultSettings);
  const [ready, setReady] = useState(false);
  const [snapshot, setSnapshot] = useState<BazaarSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      const stored = settingsSchema.safeParse(
        JSON.parse(localStorage.getItem("skyforger:settings:v1") ?? "null"),
      );
      if (stored.success) setSettings(stored.data);
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem("skyforger:settings:v1", JSON.stringify(settings));
      } catch {}
    }
  }, [settings, ready]);
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
          setSettings((previous) =>
            settingsSchema.parse({ ...previous, ...value }),
          ),
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
          <PlayerSettings />
          {children}
        </main>
        <footer>SkyForger · Independent Hypixel SkyBlock companion</footer>
      </div>
    </>
  );
}

function PlayerSettings() {
  const { settings, update } = useWorkspace();
  const collections = [
    ...new Set(
      recipes.flatMap((recipe) =>
        recipe.requirements
          .filter((req) => req.kind === "collection")
          .map((req) => req.collection!),
      ),
    ),
  ].sort();
  const manual = recipes.flatMap((recipe) =>
    recipe.requirements.filter((req) => req.kind === "manual"),
  );
  const number = (value: string, max: number) =>
    Math.min(max, Math.max(0, Math.floor(Number(value))));
  return (
    <details className="settings">
      <summary>
        Player settings{" "}
        <span>
          HOTM {settings.hotm} · {forgeSlots(settings)} slots
        </span>
      </summary>
      <div className="settings-grid">
        <label>
          HOTM level
          <input
            type="number"
            min={0}
            max={10}
            value={settings.hotm}
            onChange={(event) =>
              update({ hotm: number(event.target.value, 10) })
            }
          />
        </label>
        <label>
          Peak of the Mountain
          <input
            type="number"
            min={0}
            max={10}
            value={settings.peak}
            onChange={(event) =>
              update({ peak: number(event.target.value, 10) })
            }
          />
        </label>
        <label>
          Quick Forge level
          <input
            type="number"
            min={0}
            max={20}
            value={settings.quickForge}
            onChange={(event) =>
              update({ quickForge: number(event.target.value, 20) })
            }
          />
        </label>
        <label>
          Bazaar tax
          <select
            value={
              [0.0125, 0.01125, 0.01].includes(settings.tax)
                ? settings.tax
                : "custom"
            }
            onChange={(event) =>
              update({
                tax:
                  event.target.value === "custom"
                    ? 0
                    : Number(event.target.value),
              })
            }
          >
            <option value={0.0125}>1.25%</option>
            <option value={0.01125}>1.125%</option>
            <option value={0.01}>1%</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {![0.0125, 0.01125, 0.01].includes(settings.tax) && (
          <label>
            Custom tax %
            <input
              type="number"
              min={0}
              max={20}
              step={0.001}
              value={settings.tax * 100}
              onChange={(event) =>
                update({
                  tax: Math.min(
                    0.2,
                    Math.max(0, Number(event.target.value) / 100),
                  ),
                })
              }
            />
          </label>
        )}
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
        {collections.map((collection) => (
          <label key={collection}>
            {collection} collection
            <input
              type="number"
              min={0}
              max={20}
              value={settings.collections[collection] ?? 0}
              onChange={(event) =>
                update({
                  collections: {
                    ...settings.collections,
                    [collection]: number(event.target.value, 20),
                  },
                })
              }
            />
          </label>
        ))}
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={settings.moltenForge}
          onChange={(event) => update({ moltenForge: event.target.checked })}
        />{" "}
        Molten Forge for planned jobs (−25%)
      </label>
      <PriceSettings />
      <details>
        <summary>Additional unlocks</summary>
        <div className="unlock-list">
          {manual.map((req) => (
            <label key={req.key} className="check">
              <input
                type="checkbox"
                checked={settings.unlocks.includes(req.key!)}
                onChange={(event) =>
                  update({
                    unlocks: event.target.checked
                      ? [...settings.unlocks, req.key!]
                      : settings.unlocks.filter((key) => key !== req.key),
                  })
                }
              />
              {req.description}
            </label>
          ))}
        </div>
      </details>
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
