import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Check, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Photo } from "@/client/components/Photo";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Textarea } from "@/client/components/ui/textarea";
import { messageOf } from "@/client/lib/errors";
import type { Item } from "@/server/items";
import type { ChatMessage } from "@/server/stylist";
import { occasionLabel } from "@/shared/catalog";
import {
  askStylist,
  clearStylist,
  getStylist,
  saveSuggestion,
} from "@/serverFunctions/stylist";

export const Route = createFileRoute("/stylist")({
  loader: () => getStylist(),
  head: () => ({ meta: [{ title: "Stylist" }] }),
  component: Stylist,
});

function Stylist() {
  const { messages, wardrobe } = Route.useLoaderData();
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiOff, setAiOff] = useState<{
    setup: string | null;
    command: string | null;
  } | null>(null);
  const [clearing, setClearing] = useState(false);
  const items = new Map(wardrobe.map((item) => [item.id, item]));

  async function send() {
    const message = draft.trim();
    if (!message) return;
    setError(null);
    setPending(true);
    try {
      const answer = await askStylist({ data: { message } });
      if (answer.off) {
        setAiOff({ setup: answer.setup, command: answer.command });
      } else {
        setAiOff(null);
        setDraft("");
        await router.invalidate();
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setPending(false);
    }
  }

  async function clear() {
    setPending(true);
    try {
      await clearStylist();
      await router.invalidate();
    } finally {
      setPending(false);
      setClearing(false);
    }
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Stylist"
        actions={
          messages.length > 0 ? (
            <Button
              variant="outline"
              data-testid="clear-chat"
              onClick={() => setClearing(true)}
            >
              <Trash2 aria-hidden />
              Clear chat
            </Button>
          ) : null
        }
      />

      {messages.length === 0 ? (
        <EmptyState
          title="Ask for an outfit"
          description="Describe the occasion, the weather or the mood. Suggestions come from your own wardrobe."
        />
      ) : (
        <ol className="space-y-6">
          {messages.map((message) => (
            <Message key={message.id} message={message} items={items} />
          ))}
        </ol>
      )}

      <div className="space-y-3">
        {aiOff ? (
          <Alert data-testid="ai-off">
            <AlertTitle>The stylist isn't set up</AlertTitle>
            <AlertDescription>
              {aiOff.setup ??
                "An admin needs to add an AI provider key to the Gateway."}
              {aiOff.command ? (
                <>
                  {" "}
                  <code>{aiOff.command}</code>
                </>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <Textarea
            data-testid="stylist-input"
            aria-label="Message"
            placeholder="Dinner downtown on a mild evening…"
            value={draft}
            maxLength={2000}
            className="min-h-10 bg-card"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <Button type="submit" data-testid="stylist-send" pending={pending}>
            <Send aria-hidden />
            Send
          </Button>
        </form>
      </div>

      {clearing ? (
        <ConfirmDialog
          title="Clear the chat?"
          confirmLabel="Clear"
          destructive
          pending={pending}
          onConfirm={() => void clear()}
          onClose={() => setClearing(false)}
        >
          Saved outfits stay.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}

function Message({
  message,
  items,
}: {
  message: ChatMessage;
  items: Map<string, Item>;
}) {
  if (message.role === "user") {
    return (
      <li data-testid="chat-message" className="flex justify-end">
        <p className="max-w-[85%] rounded-lg bg-muted px-4 py-2 text-sm whitespace-pre-wrap">
          {message.content}
        </p>
      </li>
    );
  }
  return (
    <li data-testid="chat-message" className="space-y-3">
      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
      {message.suggestions.map((suggestion, index) => (
        <Suggestion
          key={index}
          messageId={message.id}
          index={index}
          suggestion={suggestion}
          items={items}
        />
      ))}
    </li>
  );
}

function Suggestion({
  messageId,
  index,
  suggestion,
  items,
}: {
  messageId: string;
  index: number;
  suggestion: ChatMessage["suggestions"][number];
  items: Map<string, Item>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = suggestion.picks
    .map((p) => items.get(p.itemId))
    .filter((item): item is Item => item !== undefined);

  async function save() {
    setError(null);
    setPending(true);
    try {
      await saveSuggestion({ data: { messageId, index } });
      await router.invalidate();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      data-testid="suggestion"
      className="space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{suggestion.name}</p>
          {suggestion.occasion ? (
            <Badge variant="secondary">
              {occasionLabel(suggestion.occasion)}
            </Badge>
          ) : null}
        </div>
        <Button
          size="sm"
          variant={suggestion.savedOutfitId ? "ghost" : "outline"}
          data-testid="save-suggestion"
          disabled={Boolean(suggestion.savedOutfitId)}
          pending={pending}
          onClick={() => void save()}
        >
          {suggestion.savedOutfitId ? (
            <>
              <Check aria-hidden />
              Saved
            </>
          ) : (
            "Save outfit"
          )}
        </Button>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {shown.map((item) => (
          <figure key={item.id} className="space-y-1">
            <Photo id={item.id} alt={item.name} />
            <figcaption className="truncate text-xs text-muted-foreground">
              {item.name}
            </figcaption>
          </figure>
        ))}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
