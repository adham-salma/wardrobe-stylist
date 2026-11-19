import { useNavigate } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Photo } from "@/client/components/Photo";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Field, FieldLabel } from "@/client/components/ui/field";
import { Input } from "@/client/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { messageOf } from "@/client/lib/errors";
import type { Item } from "@/server/items";
import type { Outfit } from "@/server/outfits";
import {
  OCCASIONS,
  SLOTS,
  categoryLabel,
  type Occasion,
  type Slot,
} from "@/shared/catalog";
import { saveOutfit } from "@/serverFunctions/outfits";

const NONE = "none";
const OCCASION_ITEMS = [
  { value: NONE, label: "None" },
  ...OCCASIONS.map((o) => ({ value: o.id, label: o.label })),
];

interface Pick {
  slot: Slot;
  itemId: string;
}

/** Fills an outfit's slots from the wardrobe, then names and saves it. */
export function OutfitBuilder({
  outfit,
  wardrobe,
}: {
  outfit: Outfit | null;
  wardrobe: Item[];
}) {
  const navigate = useNavigate();
  const [picks, setPicks] = useState<Pick[]>(
    outfit?.items.map((i) => ({ slot: i.slot, itemId: i.id })) ?? [],
  );
  const [name, setName] = useState(outfit?.name ?? "");
  const [occasion, setOccasion] = useState<string>(outfit?.occasion ?? NONE);
  const [choosing, setChoosing] = useState<(typeof SLOTS)[number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const byId = new Map(wardrobe.map((item) => [item.id, item]));

  function pick(slot: (typeof SLOTS)[number], itemId: string) {
    setPicks((current) => [
      ...(slot.many ? current : current.filter((p) => p.slot !== slot.id)),
      { slot: slot.id, itemId },
    ]);
    setChoosing(null);
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Give the outfit a name");
    if (picks.length < 2) return setError("Pick at least two items");
    setPending(true);
    try {
      await saveOutfit({
        data: {
          ...(outfit ? { id: outfit.id } : {}),
          name,
          occasion: occasion === NONE ? null : (occasion as Occasion),
          picks,
        },
      });
      await navigate({ to: "/outfits" });
    } catch (cause) {
      setError(messageOf(cause));
      setPending(false);
    }
  }

  const options = choosing
    ? wardrobe.filter(
        (item) =>
          item.category === choosing.category &&
          !picks.some((p) => p.itemId === item.id),
      )
    : [];

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SLOTS.map((slot) => {
          const inSlot = picks.filter((p) => p.slot === slot.id);
          return (
            <div
              key={slot.id}
              data-testid={`slot-${slot.id}`}
              onClick={() => setChoosing(slot)}
              className="flex cursor-pointer flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/50"
            >
              <p className="text-sm font-medium">{slot.label}</p>
              {inSlot.map((p) => {
                const item = byId.get(p.itemId);
                if (!item) return null;
                return (
                  <div key={p.itemId} className="relative">
                    <Photo id={item.id} alt={item.name} />
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {item.name}
                    </p>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="secondary"
                      className="absolute top-1 right-1"
                      aria-label={`Remove ${item.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPicks((current) =>
                          current.filter((x) => x.itemId !== p.itemId),
                        );
                      }}
                    >
                      <X aria-hidden />
                    </Button>
                  </div>
                );
              })}
              {inSlot.length === 0 || slot.many ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Plus className="size-3.5" aria-hidden />
                  {inSlot.length === 0 ? "Choose" : "Add another"}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="outfit-name">Name</FieldLabel>
          <Input
            id="outfit-name"
            data-testid="outfit-name"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>Occasion</FieldLabel>
          <Select
            items={OCCASION_ITEMS}
            value={occasion}
            onValueChange={(value) => setOccasion(value ?? NONE)}
          >
            <SelectTrigger
              className="w-full"
              data-testid="outfit-occasion"
              aria-label="Occasion"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OCCASION_ITEMS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription data-testid="outfit-error">
            {error}
          </AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" data-testid="save-outfit" pending={pending}>
        Save outfit
      </Button>

      <Dialog
        open={choosing !== null}
        onOpenChange={(open) => !open && setChoosing(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{choosing?.label}</DialogTitle>
          </DialogHeader>
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No {categoryLabel(choosing?.category ?? "").toLowerCase()} left to
              pick. Add some to your wardrobe first.
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-3">
              {options.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    data-testid="pick-item"
                    onClick={() => choosing && pick(choosing, item.id)}
                    className="w-full space-y-1 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <Photo id={item.id} alt="" />
                    <p className="truncate text-xs">{item.name}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </form>
  );
}
