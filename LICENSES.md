# Third-party asset licenses

All 3D assets used by Party Royale are CC0 (Creative Commons Zero / public
domain dedication) from KayKit by Kay Lousberg. No Unity Asset Store assets are
used anywhere in this project.

## KayKit packs

| Pack                              | License | Used for | Source |
| --------------------------------- | ------- | -------- | ------ |
| KayKit Adventurers                | CC0     | Playable characters (Knight, Barbarian, Mage, Rogue, Ranger) + shared Rig_Medium animations | https://kaylousberg.itch.io/kaykit-adventurers |
| KayKit Mini-Game Variety Pack 1.2 | CC0     | All minigame maps + props: tiles, goals, balls, targets, gems, barriers, flags, decoration | https://kaylousberg.itch.io/kay-kit-mini-game-variety-pack |

Both packs are CC0 and live (gitignored) in `assets-source/`. `pnpm
assets:prepare` copies only the files the game needs into `client/public/assets/`.

## Notes

- CC0 places these works in the public domain; attribution is not legally
  required, but crediting Kay Lousberg is appreciated.
- The raw packs live in `assets-source/` (gitignored). `pnpm assets:prepare`
  copies only the GLBs the game needs into `client/public/assets/`.
