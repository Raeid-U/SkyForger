import Head from "next/head";
import { useState } from "react";
import type { BazaarSnapshot } from "../lib/bazaar";

export default function Home() {
  const [tab, setTab] = useState<"profits" | "planner">("profits");
  const [snapshot, setSnapshot] = useState<BazaarSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function checkPrices() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/bazaar", { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Bazaar prices are unavailable. Please try again shortly.");
      setSnapshot(await response.json());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load prices.");
    } finally {
      setLoading(false);
    }
  }

  return <>
    <Head>
      <title>SkyForger — Your next forge starts here</title>
      <meta name="description" content="Plan your Hypixel SkyBlock forge recipes and compare Bazaar prices." />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    </Head>
    <div className="workspace">
      <header><a className="brand" href="/" aria-label="SkyForger home"><span className="mark" aria-hidden="true">S</span>SkyForger</a><span className="edition">HYPIXEL SKYBLOCK COMPANION</span></header>
      <main>
        <div className="eyebrow">LESS SPREADSHEET. MORE SKYBLOCK.</div>
        <h1>Your next forge<br /><span>starts here.</span></h1>
        <p className="intro">Find your next opportunity. Gather the right materials.<br />Make every forge slot count.</p>
        <nav aria-label="Workspace"><button aria-current={tab === "profits" ? "page" : undefined} onClick={() => setTab("profits")}>Forge profits</button><button aria-current={tab === "planner" ? "page" : undefined} onClick={() => setTab("planner")}>Recipe planner</button></nav>
        {tab === "profits" ? <section aria-labelledby="market-title" className="panel">
          <div className="panel-heading"><div><span className="eyebrow">THE MARKET</span><h2 id="market-title">Start with a fresh price check.</h2></div><button className="primary" disabled={loading} onClick={checkPrices}>{loading ? "Checking prices…" : "Check Bazaar prices ↗"}</button></div>
          <p>Pull the latest Bazaar order books to prepare your next forge comparison.</p>
          <div role="status" aria-live="polite" className="market-status">{snapshot ? `${Object.keys(snapshot.products).length.toLocaleString()} products · Market snapshot ${new Date(snapshot.lastUpdated).toLocaleString()}` : "No market snapshot loaded yet."}</div>
          {error && <p role="alert" className="error">{error}</p>}
          <div className="notice">Recipe verification is in progress. Profit rankings will become available once ingredients, unlocks, and forge times have been checked.</div>
        </section> : <section aria-labelledby="planner-title" className="panel">
          <span className="eyebrow">THE LONG GAME</span><h2 id="planner-title">Big recipes. Clear next steps.</h2>
          <p>The planner will turn forge dependencies into a material list and schedule for your available slots.</p>
          <div className="notice">Recipe planning is coming after catalog verification. Your inventory, collection unlocks, and forge settings will shape each plan.</div>
        </section>}
        <div className="features"><div><span>01 / COMPARE</span><h3>Know the margin.</h3><p>Buying strategy, selling fees, and forge time belong in the same calculation.</p></div><div><span>02 / PLAN</span><h3>See the whole recipe.</h3><p>Follow every prerequisite, from raw materials to the final upgrade.</p></div><div><span>03 / FORGE</span><h3>Keep your slots moving.</h3><p>Plan around your unlocks and the time each ingredient needs.</p></div></div>
      </main>
      <footer><span>Built for the grind.</span><span>Independent project · Not affiliated with Hypixel</span></footer>
    </div>
  </>;
}
