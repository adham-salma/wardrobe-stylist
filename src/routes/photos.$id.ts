import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { postPhoto } from "@/server/feed";
import { itemPhoto } from "@/server/items";
import { getPhoto } from "@/server/photos";

// A photo of the member's own item, or of a post shared in their organization.
export const Route = createFileRoute("/photos/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return new Response("Unauthorized", { status: 401 });
        const found =
          (await itemPhoto(user.id, params.id)) ??
          (await postPhoto(user.orgId, params.id));
        const object = found && (await getPhoto(found.key));
        if (!found || !object)
          return new Response("Not found", { status: 404 });
        return new Response(object.body, {
          headers: {
            "content-type": found.type,
            "cache-control": "private, no-cache",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
