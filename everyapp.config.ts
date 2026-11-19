import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "wardrobe-stylist",
  name: "Wardrobe Stylist",
  description:
    "Catalogue your clothes from photos, build outfits from them, get outfit ideas from an AI stylist and share looks with your team.",
  icon: "/icon.svg",
  access: "everyone",
  resources: {
    d1: ["DB"],
    r2: ["photos"],
  },
  providers: [
    {
      id: "openrouter",
      why: "Suggests outfits from your wardrobe and fills in item details from a photo.",
      docs: "https://openrouter.ai/settings/keys",
    },
  ],
  features: {
    stylist: {
      name: "AI stylist",
      why: "Outfit suggestions in chat, and Auto-fill for new items.",
      steps: ["Add an OpenRouter key to the Gateway: https://openrouter.ai/settings/keys"],
      providers: ["openrouter"],
    },
  },
});
