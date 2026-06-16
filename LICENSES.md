# Third-party asset licenses

All 3D assets used by Party Royale are CC0 (Creative Commons Zero / public
domain dedication) from KayKit by Kay Lousberg. No Unity Asset Store assets are
used anywhere in this project.

## KayKit packs

| Pack                              | License | Status            | Source |
| --------------------------------- | ------- | ----------------- | ------ |
| KayKit Mini-Game Variety Pack 1.2 | CC0     | Present           | https://kaylousberg.itch.io/kay-kit-mini-game-variety-pack |
| KayKit Character Animations 1.2   | CC0     | Present           | https://kaylousberg.itch.io/kaykit-animations |
| KayKit Prototype Bits             | CC0     | Needed in Phase 2 | https://kaylousberg.itch.io/prototype-bits |
| KayKit Platformer Pack            | CC0     | Needed in Phase 5 | https://kaylousberg.itch.io/kaykit-platformer |

"Present" packs are required for Phase 1 (rendering a character) and are already
available locally. The other two are only needed in later phases (greybox level
blocks and platformer obstacles) and can be downloaded then.

## Notes

- CC0 places these works in the public domain; attribution is not legally
  required, but crediting Kay Lousberg is appreciated.
- The raw packs live in `assets-source/` (gitignored). `pnpm assets:prepare`
  copies only the GLBs the game needs into `client/public/assets/`.
