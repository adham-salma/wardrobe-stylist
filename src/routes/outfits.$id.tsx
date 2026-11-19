import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Share2, Trash2 } from "lucide-react";
import { useState } from "react";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { BackToOutfits } from "@/client/components/BackToOutfits";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Field, FieldLabel } from "@/client/components/ui/field";
import { Textarea } from "@/client/components/ui/textarea";
import { OutfitBuilder } from "@/client/features/OutfitBuilder";
import { messageOf } from "@/client/lib/errors";
import { shareOutfit } from "@/serverFunctions/feed";
import { deleteOutfit, getBuilder } from "@/serverFunctions/outfits";

export const Route = createFileRoute("/outfits/$id")({
  loader: ({ params }) => getBuilder({ data: { id: params.id } }),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.outfit?.name ?? "Outfit" }],
  }),
  component: EditOutfit,
});

function EditOutfit() {
  const { outfit, wardrobe } = Route.useLoaderData();
  const navigate = useNavigate();
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState(false);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!outfit) {
    return (
      <AppShell nav={<AppNav />}>
        <PageHeader title="Outfit" backLink={<BackToOutfits />} />
        <div data-testid="not-found">
          <EmptyState kind="filtered" title="Outfit not found" />
        </div>
      </AppShell>
    );
  }

  async function share() {
    setError(null);
    setPending(true);
    try {
      await shareOutfit({ data: { outfitId: outfit!.id, caption } });
      await navigate({ to: "/feed" });
    } catch (cause) {
      setError(messageOf(cause));
      setPending(false);
    }
  }

  async function remove() {
    setPending(true);
    try {
      await deleteOutfit({ data: { id: outfit!.id } });
      await navigate({ to: "/outfits" });
    } catch (cause) {
      setError(messageOf(cause));
      setDeleting(false);
      setPending(false);
    }
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title={outfit.name}
        backLink={<BackToOutfits />}
        actions={
          <>
            <Button
              variant="outline"
              data-testid="share-outfit"
              onClick={() => setSharing(true)}
            >
              <Share2 aria-hidden />
              Share to feed
            </Button>
            <Button
              variant="destructive"
              data-testid="delete-outfit"
              onClick={() => setDeleting(true)}
            >
              <Trash2 aria-hidden />
              Delete
            </Button>
          </>
        }
      />
      {error && !sharing ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <OutfitBuilder outfit={outfit} wardrobe={wardrobe} />

      <Dialog
        open={sharing}
        onOpenChange={(open) => !open && !pending && setSharing(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share to feed</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void share();
            }}
          >
            <Field>
              <FieldLabel htmlFor="share-caption">Caption</FieldLabel>
              <Textarea
                id="share-caption"
                data-testid="share-caption"
                value={caption}
                maxLength={500}
                onChange={(event) => setCaption(event.target.value)}
              />
            </Field>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription data-testid="share-error">
                  {error}
                </AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button
                type="submit"
                data-testid="share-submit"
                pending={pending}
              >
                Share
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${outfit.name}?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onConfirm={() => void remove()}
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </AppShell>
  );
}
