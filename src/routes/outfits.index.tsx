import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Photo } from "@/client/components/Photo";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/client/components/ui/toggle-group";
import { OCCASIONS, occasionLabel } from "@/shared/catalog";
import { getOutfits } from "@/serverFunctions/outfits";

export const Route = createFileRoute("/outfits/")({
  loader: () => getOutfits(),
  head: () => ({ meta: [{ title: "Outfits" }] }),
  component: Outfits,
});

function Outfits() {
  const outfits = Route.useLoaderData();
  const [occasion, setOccasion] = useState("all");
  const shown =
    occasion === "all"
      ? outfits
      : outfits.filter((o) => o.occasion === occasion);

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Outfits"
        actions={
          <Button render={<Link to="/outfits/new" />} nativeButton={false}>
            <Plus aria-hidden />
            New outfit
          </Button>
        }
      />
      {outfits.length === 0 ? (
        <EmptyState
          title="No outfits yet"
          description="Build one from your wardrobe, or save one the stylist suggests."
        />
      ) : (
        <div className="space-y-4">
          <ToggleGroup
            value={[occasion]}
            onValueChange={(value) => setOccasion(value[0] ?? "all")}
            className="flex-wrap"
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="all" data-testid="occasion-all">
              All
            </ToggleGroupItem>
            {OCCASIONS.map((o) => (
              <ToggleGroupItem
                key={o.id}
                value={o.id}
                data-testid={`occasion-${o.id}`}
              >
                {o.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {shown.length === 0 ? (
            <EmptyState kind="filtered" title="No outfits for this occasion" />
          ) : (
            <ul className="space-y-3">
              {shown.map((outfit) => (
                <li
                  key={outfit.id}
                  data-testid="outfit-card"
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <Link
                    to="/outfits/$id"
                    params={{ id: outfit.id }}
                    className="block space-y-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{outfit.name}</p>
                      {outfit.occasion ? (
                        <Badge variant="secondary">
                          {occasionLabel(outfit.occasion)}
                        </Badge>
                      ) : null}
                      <Badge variant="outline">
                        {outfit.source === "ai" ? "Stylist" : "Hand-picked"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                      {outfit.items.map((item) => (
                        <Photo key={item.id} id={item.id} alt={item.name} />
                      ))}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </AppShell>
  );
}
