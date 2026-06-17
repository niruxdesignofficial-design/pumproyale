# Party Royale

A web-based, physics-driven party battle-royale (Fall Guys / Stumble Guys style):
Three.js rendering, a server-authoritative Colyseus + Rapier simulation, up to
4-player matches that produce exactly one winner, an off-chain leaderboard, and a
Solana (devnet) wallet sign-in with idempotent rewards.

> Status: playable. Main menu and character select (5 animated KayKit
> Adventurers), prop-built minigame maps, single-winner matches with chained
> minigames and bots, wallet sign-in, leaderboard, and devnet rewards.

## Tech stack

- **Monorepo:** pnpm workspaces (`client`, `server`, `shared`)
- **Client:** Vite + TypeScript (strict) + React (DOM overlay) + Three.js, with
  `colyseus.js` and the Solana wallet adapter
- **Server:** Node + TypeScript, Colyseus (authoritative rooms) + Rapier physics,
  Fastify REST API, Prisma (SQLite in dev)
- **Solana:** `@solana/web3.js` + wallet adapter (client), treasury signer (server)
- **Assets:** KayKit CC0 packs (see [LICENSES.md](LICENSES.md))

## Prerequisites

- Node.js >= 20.10 (`.nvmrc` pins 20)
- pnpm 9 via Corepack:

```bash
corepack enable
```

If `corepack enable` needs elevated permissions, run pnpm through Corepack
directly: `corepack pnpm <command>`.

## Setup and run

```bash
# 1. Install dependencies (also generates the Prisma client via postinstall)
pnpm install

# 2. Create the dev database (SQLite)
pnpm --filter @party-royale/server db:push

# 3. Drop the KayKit packs into assets-source/ (CC0; not committed) and prepare:
#      - KayKit Adventurers          (required: playable characters + animations)
#      - KayKit Mini-Game Variety    (required: all map props, balls, goals,
#                                      targets, tiles, gems, barriers, decor)
#    Layout does not matter; the pipeline scans recursively.
pnpm assets:prepare

# 4. (optional) configure environment
cp .env.example .env

# 5. Run the server (Colyseus + REST API) and the client together
pnpm dev
# open the printed client URL (default http://localhost:5173)
```

`pnpm dev` runs the game server (ws://localhost:2567), the REST API
(http://localhost:3001), and the Vite client concurrently. To run them
separately use `pnpm dev:server` and `pnpm dev:client`.

If you skip step 3, the client still runs but shows placeholder characters.

## How to play

From the **main menu**, hit Play, pick one of the 5 **Adventurers** on the
character-select screen, then Find match. A match fills to 4 (bots take empty
slots after a short timer), counts down, then everyone plays all four minigames
in order. Each round awards placement points (10 / 6 / 3 / 1 by round score);
the highest total across all rounds wins. **There is no elimination** — every
player plays to the end:

- **Soccer Scramble** - push or kick (action button) the ball into either goal;
  each goal scores for whoever last touched it. Most goals wins the round.
- **Target Range** - face a target and shoot (action button, forgiving aim cone);
  each hit scores and the target pops up elsewhere. Most hits wins.
- **Tower Climb** - jump up the stepped platforms to the flag at the summit;
  first to the top wins, others ranked by how high they got.
- **Gem Rush** - run over the gems scattered across the arena; each one scores
  and a new gem appears. Most gems wins.

Maps and props are built entirely from the **KayKit Mini-Game Variety Pack**
(tiles, goals, targets, gems, barriers, decor); the players are the animated
KayKit Adventurers.

| Input            | Action                        |
| ---------------- | ----------------------------- |
| W A S D / arrows | Move (camera-relative)        |
| Shift            | Run                           |
| Space            | Jump                          |
| Ctrl             | Dive                          |
| E / J / click    | Action (kick / shoot)         |
| Mouse drag/wheel | Orbit / zoom camera           |

## Wallet, leaderboard, rewards (devnet)

- Click **Select Wallet** (Phantom / Solflare, auto-detected), then **Sign in**.
  The client signs a server nonce; the server verifies ownership and issues a
  session token. No private key ever leaves the wallet.
- Win a match while signed in to earn an eligible reward; **Claim reward** sends a
  devnet SOL transfer from the treasury. With no `TREASURY_SECRET_KEY` configured
  the reward runs in simulation mode (no funds needed); the claim is still
  idempotent (exactly once).
- The **Leaderboard** panel shows top players by points.

## Scripts

| Command                                   | What it does                          |
| ----------------------------------------- | ------------------------------------- |
| `pnpm dev`                                | Run server + client                   |
| `pnpm dev:server` / `pnpm dev:client`     | Run one side                          |
| `pnpm build`                              | Production build of the client        |
| `pnpm typecheck`                          | Type-check all workspaces (strict)    |
| `pnpm lint`                               | ESLint across the repo                |
| `pnpm test`                               | Run server smoke tests                |
| `pnpm assets:prepare`                     | Copy needed GLBs into the client      |
| `pnpm --filter @party-royale/server db:push` | Create/sync the SQLite schema      |

## Architecture and security

- **Server-authoritative.** The `MatchRoom` runs one Rapier world at a fixed 30 Hz
  tick. Clients send only input intents (`shared/src/messages.ts`); per-round
  scoring, placement points, round transitions, and the points winner are decided
  on the server. Inputs are sanitized and rate-limited; unknown messages are rejected.
- **No secrets in the client.** The treasury key, session secret, and DB
  credentials are server-only, loaded from the environment.
- **Solana defaults to devnet.** Distributing real value on mainnet may carry
  legal and regulatory obligations (gambling, securities, money transmission)
  that are the operator's responsibility (see the guardrail in
  `server/src/solana/treasury.ts`).

## Project layout

```
client/   Three.js game client (Vite + React overlay + wallet adapter)
server/   Authoritative server: Colyseus rooms, Rapier sim, REST API, Prisma
shared/   Types, constants, arena/level layouts shared across client and server
scripts/  Tooling (asset pipeline)
assets-source/  Raw CC0 packs you drop in (gitignored)
```

## Asset notes

- Only `.glb`/`.gltf` are consumed. Packs that ship `.fbx`/`.obj` only must be
  converted first (FBX2glTF or `@gltf-transform`), then re-run `assets:prepare`.
- Players are the rigged KayKit **Adventurers** (shared Rig_Medium clips). Every
  map and prop (tiles, goals, balls, targets, gems, barriers, decor) is a
  self-contained `.glb` from the **KayKit Mini-Game Variety Pack**, copied into
  `client/public/assets/variety/` and placed by `client/src/game/VarietyProps.ts`.
