import { ItemIcon } from "../components/ItemIcon";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  Workspace,
  ManualPrice,
  coins,
  duration,
  useWorkspace,
} from "../components/Workspace";
import { forgeRecipes, itemById, items } from "../lib/forge/catalog";
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
  const { settings, snapshot, account } = useWorkspace();
  const [selected, setSelected] = useState("refined-mithril");
  const [quantity, setQuantity] = useState(1);
  const [strategy, setStrategy] = useState<"forge" | "cheapest">("forge");
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [inventoryReady, setInventoryReady] = useState(false);
  const [loadedInventoryKey, setLoadedInventoryKey] = useState("");
  const [stockItem, setStockItem] = useState("refined-mithril");
  const inventoryKey = account?.selectedProfileId
    ? `skyforger:inventory:${account.uuid}:${account.selectedProfileId}`
    : "skyforger:inventory";
  useEffect(() => {
    if (
      typeof router.query.item === "string" &&
      forgeRecipes.some((recipe) => recipe.outputId === router.query.item)
    )
      setSelected(router.query.item);
  }, [router.query.item]);
  useEffect(() => {
    setInventoryReady(false);
    setInventory({});
    try {
      const saved = JSON.parse(localStorage.getItem(inventoryKey) ?? "{}");
      if (
        saved &&
        typeof saved === "object" &&
        !Array.isArray(saved) &&
        Object.values(saved).every(
          (value) =>
            typeof value === "number" &&
            Number.isSafeInteger(value) &&
            value >= 0,
        )
      )
        setInventory(saved);
    } catch {}
    setLoadedInventoryKey(inventoryKey);
    setInventoryReady(true);
  }, [inventoryKey]);
  useEffect(() => {
    if (inventoryReady && loadedInventoryKey === inventoryKey)
      try {
        localStorage.setItem(inventoryKey, JSON.stringify(inventory));
      } catch {}
  }, [inventory, inventoryReady, inventoryKey, loadedInventoryKey]);
  const importedInventory = account?.inventory?.items ?? {};
  const owned = {
    ...importedInventory,
    ...(loadedInventoryKey === inventoryKey ? inventory : {}),
  };
  let plan: ReturnType<typeof buildPlan> | null = null,
    error = "";
  try {
    plan = buildPlan(selected, quantity, owned, settings, snapshot, strategy);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Could not build plan.";
  }
  const total = plan?.cost ?? null;
  return (
    <Workspace title="Craft planner">
      <div className="toolbar">
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
      <details className="panel">
        <summary>
          Owned materials{" "}
          <span className="muted">
            {Object.values(owned).filter((amount) => amount > 0).length} items
          </span>
        </summary>
        {account?.inventory && (
          <p className="notice">
            Imported from this profile’s inventory, storage, sacks, and
            available quest crystals. Edits apply only to this profile.
          </p>
        )}
        {account?.inventory?.warnings.map((warning) => (
          <p className="notice" key={warning}>
            {warning}
          </p>
        ))}
        <div className="toolbar">
          <select
            aria-label="Inventory item"
            value={stockItem}
            onChange={(event) => setStockItem(event.target.value)}
          >
            {[...items]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
          <button
            onClick={() =>
              setInventory({
                ...inventory,
                [stockItem]: owned[stockItem] ?? 1,
              })
            }
          >
            Add item
          </button>
        </div>
        <div className="price-grid">
          {Object.entries(owned)
            .filter(([, amount]) => amount > 0)
            .map(([id, amount]) => (
              <label key={id}>
                {itemById.get(id)?.name ?? id}
                <div className="inline">
                  <input
                    type="number"
                    min={0}
                    max={1000000000}
                    value={amount}
                    onChange={(event) =>
                      setInventory({
                        ...inventory,
                        [id]: Math.min(
                          1000000000,
                          Math.max(0, Math.floor(Number(event.target.value))),
                        ),
                      })
                    }
                  />
                  <button
                    aria-label={`Remove ${itemById.get(id)?.name}`}
                    onClick={() => {
                      const next = { ...inventory };
                      if (importedInventory[id] !== undefined) next[id] = 0;
                      else delete next[id];
                      setInventory(next);
                    }}
                  >
                    ×
                  </button>
                </div>
              </label>
            ))}
        </div>
      </details>
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
            <section className="panel">
              <h2>Craft tree</h2>
              <ul className="tree">
                <Tree node={plan.tree} />
              </ul>
            </section>
            <section className="panel">
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
                          {material.cost === null && (
                            <ManualPrice itemId={material.itemId} />
                          )}
                        </td>
                        <td>{coins(material.quantity)}</td>
                        <td>{coins(material.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {plan.coins > 0 && (
                <p className="muted">Forge fees: {coins(plan.coins)} coins</p>
              )}
            </section>
          </div>
          {plan.jobs.length > 0 && (
            <section className="panel">
              <h2>
                Forge schedule{" "}
                <small className="muted">from now, all slots free</small>
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
