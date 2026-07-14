// Trainer heuristics: from a flat list of numeric fields, guess which ones are
// money / health / resources / etc. by their key names, so the UI can surface
// the "good stuff" first instead of making the user hunt through raw fields.

export type StatCategory =
  | "money"
  | "health"
  | "ammo"
  | "resources"
  | "progress"
  | "other";

const PATTERNS: [StatCategory, RegExp][] = [
  ["money", /gold|coins?|cash|money|credits?|gems?|diamonds?|dollars?|currency|tokens?|\bsilver\b|bucks?|premium|wallet|balance/i],
  ["health", /health|\bhp\b|hearts?|\blives\b|\blife\b|hitpoints?|stamina|energy|\bmana\b|shield|armou?r/i],
  ["ammo", /ammo|bullets?|arrows?|grenades?|rockets?|clips?|\brounds?\b|magazine/i],
  ["resources", /wood|stone|iron|\bore\b|\bgas\b|fuel|food|water|resources?|materials?|crystals?|minerals?|supply|metal|cloth|leather|brick|\bgems?\b/i],
  ["progress", /level|\blvl\b|\bxp\b|\bexp\b|experience|scores?|stars?|\brank\b|\bwave\b|stage|floor|points?|troph|skill/i],
];

export function categorize(name: string): StatCategory {
  for (const [cat, re] of PATTERNS) if (re.test(name)) return cat;
  return "other";
}

export const CATEGORY_META: Record<
  StatCategory,
  { label: string; icon: string; order: number; defaultOpen: boolean }
> = {
  money: { label: "Money & Currency", icon: "💰", order: 0, defaultOpen: true },
  health: { label: "Health & Energy", icon: "❤️", order: 1, defaultOpen: true },
  ammo: { label: "Ammo", icon: "🔫", order: 2, defaultOpen: true },
  resources: { label: "Resources", icon: "📦", order: 3, defaultOpen: true },
  progress: { label: "Level & Progress", icon: "⭐", order: 4, defaultOpen: true },
  other: { label: "Other numbers", icon: "🔢", order: 5, defaultOpen: false },
};

export const ORDERED_CATEGORIES = (Object.keys(CATEGORY_META) as StatCategory[]).sort(
  (a, b) => CATEGORY_META[a].order - CATEGORY_META[b].order
);

/** Shorten a dotted path to its last couple of segments for a readable label. */
export function prettyLabel(path: string): string {
  const parts = path.split(".").filter(Boolean);
  return parts.slice(-2).join(" › ") || path;
}
