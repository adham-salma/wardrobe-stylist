# Wardrobe Stylist

Photograph your clothes into a private digital wardrobe, put outfits together from it by hand or with an AI stylist, and share your favourite looks with your team.

Inspired by https://atricent.com

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Upload photos of your clothes, shoes, bags and accessories, with category, brand, colour, price and notes, and see your wardrobe's count and total value.
- Build outfits slot by slot from your own items, tag an occasion, and filter, edit or delete them.
- Ask an AI stylist what to wear and save any outfit it suggests in one click.
- Share outfits to a team feed where members like and comment.

Left out: accounts and sign-in, which your Gateway handles; mobile apps; shopping from brand catalogues; virtual try-on; plans and billing; the style quiz; packing lists and photo clean-up; creator and referral programs; the blog.

## Setup

```sh
pnpm install
pnpm dev          # run locally behind the dev launcher
pnpm test         # unit tests
pnpm run deploy   # deploy to your Cloudflare account behind your Gateway
```

The app needs no secrets or settings. Its database (D1) and photo storage (R2, which must be enabled on the Cloudflare account) are created by the deploy.

Optional: the AI stylist and Auto-fill use an OpenRouter key held by your Gateway (`pnpm everyapp provider add openrouter`, key from https://openrouter.ai/settings/keys). Without it, everything else works and items are described by hand.

The release checks in `checks/` run against a packaged build with a local stand-in for the AI provider; real model calls and a real deployment were not part of them.

## Limitations

- Photos must be PNG, JPEG, WebP or GIF, up to 10 MB each.
- Prices are shown in US dollars.
- The feed shows the 100 newest posts.
- AI calls are billed to the OpenRouter account behind your Gateway.
