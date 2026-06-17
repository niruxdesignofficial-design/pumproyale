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
#      - KayKit Platformer Pack      (required: minigame map props)
#      - KayKit Mini-Game Variety    (crown prop)
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
slots after a short timer), counts down, then runs elimination rounds chosen by
type (a qualifier, a survival round, then a final) until one winner remains:

- **Beam Run** (race) - run the wood course to the finish gate while rotating
  beams sweep you and springs bounce you; fall off and respawn at a checkpoint.
- **Hex Fall** (survival) - tiles dissolve as you stand on them; do not fall through.
- **Sinking Island** (survival) - the tile island collapses ring by ring; stay on.
- **Crown Grab** (final) - first to reach the pedestal crown wins instantly.

Maps are built from the KayKit Platformer Pack; the match director never repeats
a minigame within a match.

| Input            | Action                        |
| ---------------- | ----------------------------- |
| W A S D / arrows | Move (camera-relative)        |
| Shift            | Run                           |
| Space            | Jump                          |
| Ctrl             | Dive                          |
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
  tick. Clients send only input intents (`shared/src/messages.ts`); scoring,
  eliminations, round transitions, and the winner are decided on the server.
  Inputs are sanitized and rate-limited; unknown messages are rejected.
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
- The character is `KayKit_AnimatedCharacter_v1.2.glb` (the rigged "PrototypePete"
  with 30 clips). Obstacles are greybox primitives; drop in the KayKit Prototype
  Bits and Platformer packs to replace them with modeled props.
