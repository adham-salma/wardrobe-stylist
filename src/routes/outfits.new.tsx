import { createFileRoute } from "@tanstack/react-router";
import { BackToOutfits } from "@/client/components/BackToOutfits";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { OutfitBuilder } from "@/client/features/OutfitBuilder";
import { getBuilder } from "@/serverFunctions/outfits";

export const Route = createFileRoute("/outfits/new")({
  loader: () => getBuilder({ data: { id: null } }),
  head: () => ({ meta: [{ title: "New outfit" }] }),
  component: NewOutfit,
});

function NewOutfit() {
  const { wardrobe } = Route.useLoaderData();
  return (
    <AppShell nav={<AppNav />}>
      <PageHeader title="New outfit" backLink={<BackToOutfits />} />
      <OutfitBuilder outfit={null} wardrobe={wardrobe} />
    </AppShell>
  );
}
