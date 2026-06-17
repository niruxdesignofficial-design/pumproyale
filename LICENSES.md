# Third-party asset licenses

All assets used by Party Royale are CC0 (Creative Commons Zero / public domain
dedication): 3D models from KayKit by Kay Lousberg, and UI/fonts/audio from
Kenney. No Unity Asset Store assets are used anywhere in this project.

## 3D models (KayKit, Kay Lousberg)

| Pack                              | License | Used for | Source |
| --------------------------------- | ------- | -------- | ------ |
| KayKit Adventurers                | CC0     | Playable characters (Knight, Barbarian, Mage, Rogue, Ranger) + shared Rig_Medium animations | https://kaylousberg.itch.io/kaykit-adventurers |
| KayKit Mini-Game Variety Pack 1.2 | CC0     | All minigame maps + props: tiles, goals, balls, targets, gems, barriers, flags, decoration | https://kaylousberg.itch.io/kay-kit-mini-game-variety-pack |

## UI, fonts & audio (Kenney)

| Pack                       | License | Used for | Source |
| -------------------------- | ------- | -------- | ------ |
| Kenney UI Pack             | CC0     | "Kenney Future" / "Kenney Future Narrow" fonts | https://kenney.nl/assets/ui-pack |
| Kenney Interface Sounds    | CC0     | UI + gameplay SFX (click, confirm, error, tick, goal, pickup, shoot, win, lose) | https://kenney.nl/assets/interface-sounds |
| Kenney Board Game Icons    | CC0     | HUD icons (crown, award) | https://kenney.nl/assets/board-game-icons |
| Kenney Medals              | CC0     | End-screen medals (gold/silver/bronze) | https://kenney.nl/assets/medals |

## Notes

- CC0 places these works in the public domain; attribution is not legally
  required, but crediting Kay Lousberg and Kenney is appreciated.
- The raw packs live in `assets-source/` and `assets game/IU Y AUDIO/`
  (gitignored). `pnpm assets:prepare` copies only the files the game needs into
  `client/public/assets/` (a curated UI/audio subset, not the whole packs).
