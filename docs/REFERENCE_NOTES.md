# Reference notes

Technical decisions for LifeQuest and the official sources behind them.
"Accessed" means the page was fetched during development on 2026-10-16 and its
content was read. Summaries are paraphrased.

## Sources

### Phaser 3 Arcade Physics: https://docs.phaser.io/phaser/concepts/physics/arcade
**Accessed: yes.**
- Arcade physics is set with `physics: { default: 'arcade' }` in the game config (or per scene). It has to be enabled before use.
- Game objects get bodies through `this.physics.add.*` / `physics.add.existing(obj, 0|1)` (0 = dynamic, 1 = static).
- `physics.add.collider(a, b)` separates bodies. `physics.add.overlap(a, b)` only detects contact; we use it for interaction zones such as shelves, doors and NPC talk radius.
- Bodies are sized with `setSize`/`setBodySize` and `setOffset`. For top-down characters we recommend a small body at the feet, so they can walk "behind" tall furniture.
- Movement uses `setVelocity` with a capped speed. The `debug: true` config option draws bodies while tuning collisions.
- That page does not cover tile collision setup. Tile collision uses the Tilemap API (`layer.setCollision…` plus `physics.add.collider(player, layer)`). That part comes from general Phaser 3 knowledge and was not checked against an official page in this pass.

### Phaser + React + TypeScript template: https://github.com/phaserjs/template-react-ts
**Accessed: yes.**
- The template now targets **Phaser 4** (with React 19 and Vite 6). **LifeQuest pins Phaser 3.90.0. We take only the template's integration pattern and do not mix in Phaser 4 APIs.**
- Pattern we follow: a `PhaserGame` React component owns the game, React reaches it through a ref, and an event bus carries messages between React and Phaser.
- Our rules: create **one** `Phaser.Game` per mount, guard against double creation under React StrictMode, and call `game.destroy(true)` on unmount.
- Assets: the template's `public/assets` convention is not used. All art is generated at runtime (see below).

### Supabase React quickstart: https://supabase.com/docs/guides/getting-started/quickstarts/reactjs
**Accessed: yes.**
- Uses `@supabase/supabase-js`, `createClient(url, key)` and env vars read through `import.meta.env`.
- The quickstart now names the browser key `VITE_SUPABASE_PUBLISHABLE_KEY`. LifeQuest keeps `VITE_SUPABASE_ANON_KEY` (see `.env.example`). Either the legacy anon key or the new publishable key works there. Both are public keys.
- The client lives in a single module (`src/services/supabaseClient.ts`) that returns `null` when env vars are missing, so the game falls back to local mode.

### Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
**Accessed: yes.**
- RLS is enabled on every table. We also revoke default grants from `anon`, and clients get no DELETE.
- There is one policy per operation, each scoped `to authenticated`. SELECT uses `using`, INSERT uses `with check`, and UPDATE uses both.
- `auth.uid()` is wrapped as `(select auth.uid())` where it doesn't depend on the row, so Postgres evaluates it once per statement.
- Every column a policy filters on is indexed (`family_id`, `created_by`, `profile_id`, …).
- Membership checks run in `SECURITY DEFINER` helpers (`is_family_member`, `is_family_guardian`) to avoid policy recursion between `families` and `family_members`.
- **Deviation:** the docs recommend `search_path = ''` and keeping definer functions outside exposed schemas. Our helpers use `set search_path = public` (a project requirement) and schema-qualify every name. They live in `public` but only answer "is the *caller* a member/guardian of family X", so exposing them leaks nothing. Moving them to a private schema is a hardening step for later.
- The docs recommend pgTAP tests (`supabase test db`). We haven't written them yet; they are a follow-up.

### Supabase anonymous sign-ins: https://supabase.com/docs/guides/auth/auth-anonymous
**Accessed: yes.**
- `supabase.auth.signInAnonymously()` creates a real user. Anonymous sign-ins **must be enabled in the dashboard** first.
- Anonymous users run as the `authenticated` Postgres role (unlike the `anon` key alone) and carry an `is_anonymous` JWT claim. Our policies key on family ownership, not on that claim.
- The default limit is 30 anonymous sign-ins per hour per IP. The docs recommend CAPTCHA or Turnstile against abuse; for a public deployment we would enable it.
- An anonymous user can be upgraded later with `updateUser()` (email) or `linkIdentity()` (OAuth), which needs manual linking enabled. This is the upgrade path from "local + anonymous cloud backup" to real accounts.

### Tiled map editor: https://docs.mapeditor.org/en/stable/
**Accessed: yes.** The page is mostly a table of contents.
- Tiled edits tile layers, object layers, tilesets and custom properties, and exports a JSON map format (among others) that Phaser's tilemap loader understands.
- **Decision:** for hackathon speed, LifeQuest maps are **ASCII grids in TypeScript**, turned into tilemaps at runtime. There is no Tiled file or tileset image to keep in sync, and the maps can be diffed in review.
- **Upgrade path:** move the maps to Tiled JSON with object layers for doors, shelves and NPC spawns, and custom properties for collision and interaction.

## Summary of technical decisions

- **Engine:** Phaser **3.90.0** is installed. Use Phaser 3 APIs only. Examples written for Phaser 4, including the current official React template, need translating before use.
- **React embedding:** one game instance, created on mount and destroyed on unmount. React owns menus and the HUD; Phaser owns the world. They communicate through the store and events.
- **Physics:** Arcade physics, with colliders against tile layers built from the ASCII maps and overlap zones for interactions.
- **Maps:** ASCII grids in code instead of Tiled, for speed. Tiled is the documented upgrade path.
- **Art:** 100% procedurally generated pixel art at runtime (textures drawn with Graphics and canvas). There are no third-party assets, so there is **no license risk**. Kenney's CC0 packs are an option if we ever want hand-drawn art.
- **Persistence:** local-first. Every save goes to `localStorage` first.
- **Supabase (optional):** browser uses the anon key only, with RLS on every table and anonymous auth. Cloud failures show up in the HUD and progress stays local. Scores and money are client-computed and not authoritative.

## Design references (patterns only, no assets copied)

| Game | Pattern borrowed for LifeQuest |
| --- | --- |
| The Sims | Configurable family (members, roles, appearance) and relationship/trust values that change with your choices |
| Stardew Valley | Readable top-down town layout and a simple earn/spend money loop |
| Animal Crossing | Living neighbourhood: NPCs with small daily lines and a day-time tint as the clock advances |
| Discounty | Store shelves, visible prices, basket and checkout flow with a receipt |
| Overcooked | Gentle multi-step time pressure: several small objectives against a deadline, without punishing failure |

We borrow only design patterns. No art, audio, text or code is taken from these games.
