import { useState } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/client/components/ui/field";
import { Input } from "@/client/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Textarea } from "@/client/components/ui/textarea";
import { messageOf } from "@/client/lib/errors";
import type { Item } from "@/server/items";
import { CATEGORIES, type Category } from "@/shared/catalog";
import { autofillItem, deleteItem, saveItem } from "@/serverFunctions/wardrobe";

const CATEGORY_ITEMS = CATEGORIES.map((c) => ({ value: c.id, label: c.label }));

/** Adds an item (item null) or edits one. */
export function ItemDialog({
  item,
  onClose,
  onSaved,
}: {
  item: Item | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<Category | null>(
    (item?.category as Category | undefined) ?? null,
  );
  const [brand, setBrand] = useState(item?.brand ?? "");
  const [colour, setColour] = useState(item?.colour ?? "");
  const [price, setPrice] = useState(
    item?.priceCents != null ? (item.priceCents / 100).toFixed(2) : "",
  );
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [aiOff, setAiOff] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "autofill" | "delete" | null>(
    null,
  );
  const [confirming, setConfirming] = useState(false);

  function pickPhoto(file: File | null) {
    setPhoto(file);
    setAiOff(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  async function autofill() {
    if (!photo) return;
    setError(null);
    setPending("autofill");
    try {
      const form = new FormData();
      form.set("photo", photo);
      const answer = await autofillItem({ data: form });
      if (answer.off) {
        setAiOff(
          answer.setup ?? "Auto-fill needs an AI provider on your Gateway.",
        );
      } else {
        if (answer.name) setName(answer.name);
        if (answer.category) setCategory(answer.category);
        if (answer.colour) setColour(answer.colour);
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setPending(null);
    }
  }

  async function save() {
    setError(null);
    const cents = price.trim() === "" ? null : Math.round(Number(price) * 100);
    if (cents !== null && (!Number.isFinite(cents) || cents < 0)) {
      setError("Enter the price as a number");
      return;
    }
    if (!item && !photo) {
      setError("Add a photo");
      return;
    }
    if (!category) {
      setError("Pick a category");
      return;
    }
    setPending("save");
    try {
      const form = new FormData();
      if (item) form.set("id", item.id);
      if (photo) form.set("photo", photo);
      form.set(
        "fields",
        JSON.stringify({
          name,
          category,
          brand,
          colour,
          priceCents: cents,
          notes,
        }),
      );
      await saveItem({ data: form });
      await onSaved();
      onClose();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setPending(null);
    }
  }

  async function remove() {
    if (!item) return;
    setPending("delete");
    try {
      await deleteItem({ data: { id: item.id } });
      await onSaved();
      onClose();
    } catch (cause) {
      setConfirming(false);
      setError(messageOf(cause));
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{item ? "Edit item" : "Add an item"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <FieldGroup className="gap-4">
              <div className="flex items-start gap-4">
                {preview || item ? (
                  <img
                    src={preview ?? `/photos/${item!.id}`}
                    alt=""
                    className="size-24 shrink-0 rounded-md border border-border bg-muted object-cover"
                  />
                ) : null}
                <Field className="min-w-0 flex-1">
                  <FieldLabel htmlFor="item-photo">
                    {item ? "Replace photo" : "Photo"}
                  </FieldLabel>
                  <Input
                    id="item-photo"
                    data-testid="item-photo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(event) =>
                      pickPhoto(event.target.files?.[0] ?? null)
                    }
                  />
                  {photo ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="self-start"
                      data-testid="autofill"
                      pending={pending === "autofill"}
                      onClick={() => void autofill()}
                    >
                      <Sparkles aria-hidden />
                      Auto-fill
                    </Button>
                  ) : null}
                </Field>
              </div>
              {aiOff ? (
                <Alert data-testid="autofill-off">
                  <AlertDescription>{aiOff}</AlertDescription>
                </Alert>
              ) : null}
              <Field>
                <FieldLabel htmlFor="item-name">Name</FieldLabel>
                <Input
                  id="item-name"
                  data-testid="item-name"
                  value={name}
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Category</FieldLabel>
                  <Select
                    items={CATEGORY_ITEMS}
                    value={category}
                    onValueChange={(value) => setCategory(value as Category)}
                  >
                    <SelectTrigger
                      className="w-full"
                      data-testid="item-category"
                      aria-label="Category"
                    >
                      <SelectValue placeholder="Pick one" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_ITEMS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="item-colour">Colour</FieldLabel>
                  <Input
                    id="item-colour"
                    data-testid="item-colour"
                    value={colour}
                    maxLength={40}
                    onChange={(event) => setColour(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="item-brand">Brand</FieldLabel>
                  <Input
                    id="item-brand"
                    data-testid="item-brand"
                    value={brand}
                    maxLength={80}
                    onChange={(event) => setBrand(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="item-price">Price paid ($)</FieldLabel>
                  <Input
                    id="item-price"
                    data-testid="item-price"
                    inputMode="decimal"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="item-notes">Notes</FieldLabel>
                <Textarea
                  id="item-notes"
                  data-testid="item-notes"
                  value={notes}
                  maxLength={1000}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Field>
            </FieldGroup>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription data-testid="item-error">
                  {error}
                </AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              {item ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="sm:mr-auto"
                  data-testid="delete-item"
                  disabled={pending !== null}
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 aria-hidden />
                  Delete
                </Button>
              ) : null}
              <Button
                type="submit"
                data-testid="save-item"
                pending={pending === "save"}
                disabled={pending !== null}
              >
                {item ? "Save" : "Add to wardrobe"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {confirming ? (
        <ConfirmDialog
          title={`Delete ${item?.name}?`}
          confirmLabel="Delete"
          destructive
          pending={pending === "delete"}
          onConfirm={() => void remove()}
          onClose={() => setConfirming(false)}
        >
          It also comes out of every outfit it's in.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
