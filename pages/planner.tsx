import { readApiResponse } from "../lib/api-response";
import { PriceContext, AuctionAssumptions } from "../components/PriceContext";
import { ItemIcon } from "../components/ItemIcon";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  Workspace,
  coins,
  duration,
  useWorkspace,
} from "../components/Workspace";
import { forgeRecipes, itemById } from "../lib/forge/catalog";
import { trackerResultSchema } from "../lib/forge/tracker";
import { buildPlan, type PlanNode } from "../lib/forge/planner";

function Tree({ node }: { node: PlanNode }) {
  return (
    <li>
      <div>
        <strong className="item-name">
          <ItemIcon itemId={node.itemId} />
          {node.quantity} × {itemById.get(node.itemId)?.name}
        </strong>
        <span className={`badge ${node.action}`}>
          {node.action === "owned"
            ? "Owned"
            : node.action === "crafting"
              ? "Craft"
              : node.action === "forge"
                ? "Forge"
                : "Buy / gather"}
        </span>
        {node.owned > 0 && node.action !== "owned" && (
          <small>{node.owned} owned</small>
        )}
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child, index) => (
            <Tree key={`${child.itemId}-${index}`} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Planner() {
  const router = useRouter();
  const { settings, snapshot, account, auctions } = useWorkspace();
  const [selected, setSelected] = useState("refined-mithril");
  const [quantity, setQuantity] = useState(1);
  const [strategy, setStrategy] = useState<"forge" | "cheapest">("forge");
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [checkedKey, setCheckedKey] = useState("");
  const [checking, setChecking] = useState(false);
  const [inventoryError, setInventoryError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const request = useRef<AbortController | null>(null);
  const inventoryKey = JSON.stringify([
    account?.uuid,
    account?.selectedProfileId,
    selected,
    quantity,
    strategy,
    settings,
  ]);
  useEffect(() => {
    if (
      typeof router.query.item === "string" &&
      forgeRecipes.some((recipe) => recipe.outputId === router.query.item)
    )
      setSelected(router.query.item);
  }, [router.query.item]);
  useEffect(() => {
    request.current?.abort();
    setChecking(false);
    setInventoryError("");
    return () => request.current?.abort();
  }, [inventoryKey]);
  async function checkMaterials() {
    if (!account?.selectedProfileId) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setChecking(true);
    setInventoryError("");
    try {
      const query = new URLSearchParams({
        player: account.uuid,
        profile: account.selectedProfileId,
        craft: selected,
      });
      const response = await fetch(`/api/forge?${query}`, {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(20000),
        ]),
      });
      const body = await readApiResponse(
        response,
        "Could not check materials. Try again shortly.",
      );
      const parsed = trackerResultSchema.safeParse(body);
      if (!parsed.success)
        throw new Error("Materials response was incomplete. Try again.");
      const result = parsed.data;
      if (!result.inventory)
        throw new Error("Materials are unavailable for this profile.");
      if (controller.signal.aborted) return;
      setInventory(result.inventory.items);
      setWarnings(result.inventory.warnings);
      setCheckedKey(inventoryKey);
    } catch (cause) {
      if (!controller.signal.aborted)
        setInventoryError(
          cause instanceof Error ? cause.message : "Could not check materials.",
        );
    } finally {
      if (!controller.signal.aborted) setChecking(false);
    }
  }
  const hasChecked = checkedKey === inventoryKey;
  const owned = hasChecked ? inventory : {};
  let plan: ReturnType<typeof buildPlan> | null = null,
    error = "";
  try {
    plan = buildPlan(
      selected,
      quantity,
      owned,
      settings,
      snapshot,
      strategy,
      auctions.context,
    );
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Could not build plan.";
  }
  const total = plan?.cost ?? null;
  return (
    <Workspace title="Craft planner">
      <div className="toolbar planner-controls">
        <label className="grow">
          Recipe
          <select
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              void router.replace(
                { pathname: "/planner", query: { item: event.target.value } },
                undefined,
                { shallow: true },
              );
            }}
          >
            {forgeRecipes.map((recipe) => (
              <option key={recipe.id} value={recipe.outputId}>
                {itemById.get(recipe.outputId)!.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantity
          <input
            className="quantity"
            type="number"
            min={1}
            max={100}
            value={quantity}
            onChange={(event) =>
              setQuantity(
                Math.min(
                  100,
                  Math.max(1, Math.floor(Number(event.target.value))),
                ),
              )
            }
          />
        </label>
        <label>
          Dependencies
          <select
            value={strategy}
            onChange={(event) =>
              setStrategy(event.target.value as typeof strategy)
            }
          >
            <option value="forge">Forge all unlocked</option>
            <option value="cheapest">Cheapest buy or craft</option>
          </select>
        </label>
      </div>
      <section className="owned-materials" aria-labelledby="owned-heading">
        <div className="section-heading">
          <h2 id="owned-heading">Owned materials</h2>
          <div className="section-actions">
            <button
              disabled={!account?.selectedProfileId || checking}
              onClick={() => void checkMaterials()}
            >
              {checking
                ? "Checking…"
                : hasChecked
                  ? "Recheck materials"
                  : "Check owned materials"}
            </button>
            {hasChecked && (
              <button onClick={() => setCheckedKey("")}>
                Ignore owned materials
              </button>
            )}
          </div>
        </div>
        {!account && (
          <p className="muted">
            Load a profile to check materials for this craft.
          </p>
        )}
        {inventoryError && (
          <p className="notice" role="status">
            {inventoryError}
          </p>
        )}
        {hasChecked && (
          <>
            {warnings.map((warning) => (
              <p className="notice" key={warning}>
                {warning}
              </p>
            ))}
            {Object.keys(owned).length === 0 ? (
              <p className="muted">No matching materials found.</p>
            ) : (
              <details>
                <summary>
                  Matching materials ({Object.keys(owned).length})
                </summary>
                <ul>
                  {Object.entries(owned).map(([id, amount]) => (
                    <li key={id}>
                      {itemById.get(id)?.name}: {coins(amount)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>
      {error && (
        <p className="notice" role="status">
          {error}
        </p>
      )}
      {plan && (
        <>
          <div className="stats">
            <div>
              <span>Remaining cost</span>
              <strong>
                {coins(total)} <small>coins</small>
              </strong>
            </div>
            <div>
              <span>Estimated completion</span>
              <strong>{duration(plan.completionSeconds)}</strong>
            </div>
            <div>
              <span>Forge jobs</span>
              <strong>{plan.jobs.length}</strong>
            </div>
          </div>
          <div className="planner-grid">
            <section className="work-section">
              <h2>Craft tree</h2>
              <ul className="tree">
                <Tree node={plan.tree} />
              </ul>
            </section>
            <section className="work-section">
              <h2>Buy / gather</h2>
              {!plan.materials.length && (
                <p className="muted">All materials accounted for.</p>
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Needed</th>
                      <th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.materials.map((material) => (
                      <tr key={material.itemId}>
                        <td>
                          <span className="item-name">
                            <ItemIcon itemId={material.itemId} />
                            {itemById.get(material.itemId)?.name}
                          </span>
                          <PriceContext
                            itemId={material.itemId}
                            quote={material.pricing}
                          />
                        </td>
                        <td>{coins(material.quantity)}</td>
                        <td>{coins(material.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details className="pricing-notes">
                <summary>Auction pricing assumptions</summary>
                <AuctionAssumptions />
              </details>
              {plan.coins > 0 && (
                <p className="muted">Forge fees: {coins(plan.coins)} coins</p>
              )}
            </section>
          </div>
          {plan.jobs.length > 0 && (
            <section className="work-section schedule-section">
              <h2>
                Forge schedule{" "}
                <small className="muted">
                  from now · all slots free · materials available
                </small>
              </h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Slot</th>
                      <th>Start</th>
                      <th>Finish</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...plan.jobs]
                      .sort((a, b) => a.start - b.start)
                      .map((job, index) => (
                        <tr key={index}>
                          <td>
                            <span className="item-name">
                              <ItemIcon itemId={job.itemId} />
                              {itemById.get(job.itemId)?.name}
                            </span>
                          </td>
                          <td>{job.slot}</td>
                          <td>+{duration(job.start)}</td>
                          <td>+{duration(job.finish)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </Workspace>
  );
}
