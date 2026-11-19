// The fixed lists the wardrobe, the outfit builder and the stylist share.

export const CATEGORIES = [
  { id: "tops", label: "Tops" },
  { id: "bottoms", label: "Bottoms" },
  { id: "dresses", label: "Dresses & one-pieces" },
  { id: "outerwear", label: "Outerwear" },
  { id: "shoes", label: "Shoes" },
  { id: "bags", label: "Bags" },
  { id: "accessories", label: "Accessories" },
] as const;

export type Category = (typeof CATEGORIES)[number]["id"];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [
  Category,
  ...Category[],
];

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/** Each slot of an outfit takes items of one category; only accessories take several. */
export const SLOTS = [
  { id: "top", label: "Top", category: "tops", many: false },
  { id: "bottom", label: "Bottom", category: "bottoms", many: false },
  { id: "onepiece", label: "One-piece", category: "dresses", many: false },
  { id: "outerwear", label: "Outerwear", category: "outerwear", many: false },
  { id: "shoes", label: "Shoes", category: "shoes", many: false },
  { id: "bag", label: "Bag", category: "bags", many: false },
  {
    id: "accessories",
    label: "Accessories",
    category: "accessories",
    many: true,
  },
] as const satisfies readonly {
  id: string;
  label: string;
  category: Category;
  many: boolean;
}[];

export type Slot = (typeof SLOTS)[number]["id"];
export const SLOT_IDS = SLOTS.map((s) => s.id) as [Slot, ...Slot[]];

export function slotFor(category: string) {
  return SLOTS.find((s) => s.category === category) ?? null;
}

export const OCCASIONS = [
  { id: "work", label: "Work" },
  { id: "date-night", label: "Date night" },
  { id: "travel", label: "Travel" },
  { id: "weekend", label: "Weekend" },
  { id: "event", label: "Event" },
  { id: "everyday", label: "Everyday" },
] as const;

export type Occasion = (typeof OCCASIONS)[number]["id"];
export const OCCASION_IDS = OCCASIONS.map((o) => o.id) as [
  Occasion,
  ...Occasion[],
];

export function occasionLabel(id: string | null): string | null {
  if (!id) return null;
  return OCCASIONS.find((o) => o.id === id)?.label ?? null;
}

/** "date night" or "Date night" as the occasion's id, or null. */
export function matchOccasion(text: unknown): Occasion | null {
  if (typeof text !== "string") return null;
  const key = text
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  return (
    OCCASIONS.find(
      (o) =>
        o.id === key || o.label.toLowerCase() === text.trim().toLowerCase(),
    )?.id ?? null
  );
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/** "Tops" or "tops" as the category's id, or null. */
export function matchCategory(text: unknown): Category | null {
  if (typeof text !== "string") return null;
  const key = text.trim().toLowerCase();
  return (
    CATEGORIES.find((c) => c.id === key || c.label.toLowerCase() === key)?.id ??
    null
  );
}
