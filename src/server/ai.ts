import { env } from "cloudflare:workers";
import {
  aiBaseUrl,
  createGatewayFetch,
  gatewayRefusal,
} from "@every-app/sdk/server";
import { UserError } from "@/server/errors";

/** The provider the Gateway holds a key for, and the model: it reads photos and answers in JSON. */
export const AI_PROVIDER = "openrouter";
const MODEL = "openai/gpt-4o-mini";

/** The model is off: what the Gateway says would turn it on. */
export interface AiOff {
  off: true;
  setup: string | null;
  command: string | null;
}

type Content =
  | string
  | (
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    )[];

/** Asks the model for one JSON object; AiOff when no provider is set up. */
export async function askForJson(
  messages: { role: "system" | "user" | "assistant"; content: Content }[],
): Promise<{ off: false; value: unknown } | AiOff> {
  const gatewayFetch = createGatewayFetch({ env, optional: true });
  if (!gatewayFetch) return { off: true, setup: null, command: null };
  const response = await gatewayFetch(
    `${aiBaseUrl(AI_PROVIDER)}/chat/completions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.7,
      }),
    },
  );
  const refusal = await gatewayRefusal(response);
  if (refusal) {
    if (/not_configured|not_allowed/.test(refusal.code)) {
      return { off: true, setup: refusal.setup, command: refusal.command };
    }
    throw new UserError("The model is unavailable right now. Try again soon.");
  }
  if (!response.ok) {
    throw new UserError("The model is unavailable right now. Try again soon.");
  }
  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = body.choices?.[0]?.message?.content ?? "";
  try {
    return { off: false, value: JSON.parse(stripFence(text)) };
  } catch {
    throw new UserError("The model's answer didn't make sense. Try again.");
  }
}

function stripFence(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (fenced ? fenced[1]! : text).trim();
}
