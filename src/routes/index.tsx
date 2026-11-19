import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Photo } from "@/client/components/Photo";
import { Button } from "@/client/components/ui/button";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/client/components/ui/toggle-group";
import { ItemDialog } from "@/client/features/ItemDialog";
import type { Item } from "@/server/items";
import { CATEGORIES, categoryLabel, formatPrice } from "@/shared/catalog";
import { getWardrobe } from "@/serverFunctions/wardrobe";

export const Route = createFileRoute("/")({
  loader: () => getWardrobe(),
  head: () => ({ meta: [{ title: "Wardrobe" }] }),
  component: Wardrobe,
});

function Wardrobe() {
  const items = Route.useLoaderData();
  const router = useRouter();
  const [filter, setFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Item | "new" | null>(null);

  const counts = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const item of items) {
      byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + 1);
    }
    return byCategory;
  }, [items]);
  const total = items.reduce((sum, item) => sum + (item.priceCents ?? 0), 0);
  const shown =
    filter === "all" ? items : items.filter((item) => item.category === filter);

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Wardrobe"
        description={
          <span className="flex flex-wrap gap-x-4">
            <span data-testid="wardrobe-count">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
            <span data-testid="wardrobe-value">
              {formatPrice(total)} total value
            </span>
          </span>
        }
        actions={
          <Button data-testid="add-item" onClick={() => setEditing("new")}>
            <Plus aria-hidden />
            Add item
          </Button>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="Your wardrobe is empty"
          description="Add a photo of a piece you own and it will appear here."
          action={<Button onClick={() => setEditing("new")}>Add item</Button>}
        />
      ) : (
        <div className="space-y-4">
          <ToggleGroup
            value={[filter]}
            onValueChange={(value) => setFilter(value[0] ?? "all")}
            className="flex-wrap"
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="all" data-testid="filter-all">
              All <span className="text-muted-foreground">{items.length}</span>
            </ToggleGroupItem>
            {CATEGORIES.map((c) => (
              <ToggleGroupItem
                key={c.id}
                value={c.id}
                data-testid={`filter-${c.id}`}
              >
                {c.label}{" "}
                <span className="text-muted-foreground">
                  {counts.get(c.id) ?? 0}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {shown.length === 0 ? (
            <EmptyState
              kind="filtered"
              title={`No ${categoryLabel(filter).toLowerCase()} yet`}
            />
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {shown.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    data-testid="item-card"
                    onClick={() => setEditing(item)}
                    className="group w-full space-y-2 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <Photo
                      id={item.id}
                      alt={item.name}
                      className="transition-opacity group-hover:opacity-90"
                    />
                    <div className="min-w-0 text-sm">
                      <p className="truncate font-medium">{item.name}</p>
                      <p className="truncate text-muted-foreground">
                        {[item.brand, item.colour]
                          .filter(Boolean)
                          .join(" · ") || categoryLabel(item.category)}
                        {item.priceCents != null
                          ? ` · ${formatPrice(item.priceCents)}`
                          : ""}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editing ? (
        <ItemDialog
          key={editing === "new" ? "new" : editing.id}
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => router.invalidate()}
        />
      ) : null}
    </AppShell>
  );
}
