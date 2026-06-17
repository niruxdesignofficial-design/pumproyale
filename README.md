# Party Royale

A web-based, physics-driven party battle-royale (Fall Guys / Stumble Guys style):
Three.js rendering, a server-authoritative Colyseus + Rapier simulation, up to
4-player matches that produce exactly one winner, an off-chain leaderboard, and a
Solana (devnet) wallet sign-in with idempotent rewards.

> Status: feature-complete across all 8 build phases. Single-winner matches with
> three chained minigames, bots filling empty slots, wallet sign-in, leaderboard,
> and devnet rewards.

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
#      - KayKit Character Animations 1.2   (required)
#      - KayKit Mini-Game Variety Pack 1.2 (required)
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

A match fills to 4 (bots take empty slots after a short timer), counts down, then
runs three elimination rounds, one of each minigame, until a single winner remains:

1. **Obstacle Race** - reach the finish past rotating hammers, sawblades, and a conveyor.
2. **Hex Fall** - tiles dissolve as you stand on them; do not fall through.
3. **Last One Standing** - survive a shrinking safe zone while bumpers shove you.

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
