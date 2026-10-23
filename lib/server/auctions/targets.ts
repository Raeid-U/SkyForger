import { forgeRecipes, itemById } from "../../forge/catalog";

import { excludedFlipOutputs } from "../../forge/markets";
export { excludedFlipOutputs } from "../../forge/markets";

const petTypes: Record<string, string> = {
  ammonite: "AMMONITE",
  ankylosaurus: "ANKYLOSAURUS",
  goblin: "GOBLIN",
  mammoth: "MAMMOTH",
  mole: "MOLE",
  penguin: "PENGUIN",
  spinosaurus: "SPINOSAURUS",
  "t-rex": "TYRANNOSAURUS",
};

export type AuctionTarget = {
  itemId: string;
  name: string;
  apiId: string;
  petType: string | null;
};

export const auctionTargets: AuctionTarget[] = forgeRecipes.flatMap((recipe) => {
  const item = itemById.get(recipe.outputId)!;
  if (item.market !== "auction" || excludedFlipOutputs.has(item.id)) return [];
  const petType = petTypes[item.id] ?? null;
  const apiId = petType ? "PET" : item.id === "bejeweled-collar" ? "BEJEWELED_COLLAR" : item.apiId;
  if (!apiId) throw new Error(`Missing auction identity: ${item.id}`);
  return [{ itemId: item.id, name: item.name, apiId, petType }];
});

const byApiId = new Map(auctionTargets.filter((item) => !item.petType).map((item) => [item.apiId, item]));
const byPetType = new Map(auctionTargets.filter((item) => item.petType).map((item) => [item.petType!, item]));

export function auctionTarget(apiId: string, petType?: string): AuctionTarget | undefined {
  return apiId === "PET" ? byPetType.get(petType ?? "") : byApiId.get(apiId);
}
