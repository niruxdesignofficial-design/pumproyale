# Party Royale

A web-based, physics-driven party battle-royale game (Fall Guys / Stumble Guys
style): Three.js rendering, server-authoritative multiplayer, and a Solana
(devnet) wallet + rewards layer. Built in phases.

> Status: **Phase 1 - Scaffold & Render.** The monorepo is set up and the client
> renders a lit scene with an orbit camera and a rigged KayKit character playing
> its idle animation. Physics, multiplayer, minigames, wallet, and rewards land
> in later phases.

## Tech stack

- **Monorepo:** pnpm workspaces (`client`, `server`, `shared`)
- **Client:** Vite + TypeScript (strict) + React (DOM overlay) + Three.js
- **Server:** Node + TypeScript (stub in Phase 1; Colyseus + Rapier from Phase 3)
- **Assets:** KayKit CC0 packs (see [LICENSES.md](LICENSES.md))

## Prerequisites

- Node.js >= 20.10 (`.nvmrc` pins 20)
- pnpm 9 via Corepack (bundled with Node):

```bash
corepack enable
```

If `corepack enable` needs elevated permissions on your machine, you can run
pnpm directly through Corepack without global symlinks:

```bash
corepack pnpm <command>     # e.g. corepack pnpm install
```

## Setup and run

```bash
# 1. Install dependencies
pnpm install

# 2. Drop the KayKit packs into assets-source/ (CC0; not committed).
#    Required for Phase 1:
#      - KayKit Character Animations 1.2
#      - KayKit Mini-Game Variety Pack 1.2
#    Layout does not matter; the pipeline scans recursively.
#    To point at packs elsewhere: ASSETS_SOURCE=/path/to/packs pnpm assets:prepare

# 3. Prepare assets (copies the needed GLBs into client/public/assets)
pnpm assets:prepare

# 4. Run the client
pnpm dev
# open the printed URL (default http://localhost:5173)
```

If you skip step 3, the client still runs but shows a procedural placeholder
character instead of the KayKit model, with a HUD notice.

## Scripts

| Command               | What it does                                            |
| --------------------- | ------------------------------------------------------- |
| `pnpm dev`            | Run the Vite client dev server                          |
| `pnpm build`          | Production build of the client                          |
| `pnpm typecheck`      | Type-check all workspaces (strict)                      |
| `pnpm lint`           | ESLint across the repo                                  |
| `pnpm format`         | Format with Prettier                                    |
| `pnpm assets:prepare` | Copy needed GLBs from `assets-source/` into the client  |

## Asset notes

- Only `.glb`/`.gltf` are consumed. Packs that ship `.fbx`/`.obj` only must be
  converted first (FBX2glTF or `@gltf-transform`), then re-run `assets:prepare`.
- The Phase 1 character is `KayKit_AnimatedCharacter_v1.2.glb` (the rigged
  "PrototypePete" mesh with 30 animation clips). Logical animation states map to
  exact clip names in [`shared/src/animation.ts`](shared/src/animation.ts).

## Project layout

```
client/   Three.js game client (Vite + React overlay)
server/   Authoritative backend (stub in Phase 1)
shared/   Types and constants shared across client and server
scripts/  Tooling (asset pipeline)
assets-source/  Raw CC0 packs you drop in (gitignored)
```

## Environment

Copy `.env.example` to `.env` when you reach the phases that need it (Solana
wallet sign-in in Phase 6, database and rewards in Phase 7). All secrets are
server-side only; the client never receives a private key.

## Security and legal

- Server-authoritative: scoring, eliminations, and the match winner are decided
  on the server (from Phase 3+). Clients send inputs, never results.
- Solana defaults to **devnet**. Distributing real value on mainnet may carry
  legal and regulatory obligations (gambling, securities, money transmission)
  that are the operator's responsibility.
