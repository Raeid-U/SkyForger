import { useWorkspace } from "./Workspace";
import { itemById, type Recipe } from "../lib/forge/catalog";

export function FavouriteStar({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      className="favourite-star"
      viewBox="0 0 24 24"
      width="17"
      height="17"
      aria-hidden="true"
    >
      <path
        d="m12 2.7 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.5 6.3-.9Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FavouriteToggle({
  recipe,
  compact = false,
}: {
  recipe: Recipe;
  compact?: boolean;
}) {
  const { favouriteIds, toggleFavourite, consent } = useWorkspace();
  const saved = favouriteIds.includes(recipe.id);
  const name = itemById.get(recipe.outputId)?.name ?? recipe.outputId;
  return (
    <div className={compact ? "favourite-toggle compact" : "favourite-toggle"}>
      <button
        className={`favourite-action${saved ? " is-favourite" : ""}`}
        aria-label={`${saved ? "Remove" : "Add"} ${name} ${saved ? "from" : "to"} favourites`}
        aria-pressed={saved}
        aria-haspopup={consent !== "allow" ? "dialog" : undefined}
        title={saved ? "Remove from favourites" : "Add to favourites"}
        onClick={() => toggleFavourite(recipe.id)}
      >
        <FavouriteStar filled={saved} />
        {!compact && <span>{saved ? "Favourited" : "Add to favourites"}</span>}
      </button>
      {!compact && consent !== "allow" && (
        <small className="muted">
          Enable browser storage to save favourites.
        </small>
      )}
    </div>
  );
}
