# The Bug Runner images

Pictures from the lobby's mini-game, drawn from code, not by hand. `make.mjs` takes the pixel art
from `blocks/BugRunner/sprites.ts` and the colours from `design/tokens.css` — the same sprites and
tokens the game draws with — and writes the files here:

```bash
node apps/ui/src/assets/bug-runner/make.mjs
```

Run it again when a sprite or one of its colours changes; the images do not follow on their own.

## Avatars

Four avatars: the bug, the server, the hotfix and the monitoring. Each is two images stacked by
`PresetAvatar`, the way a card avatar is: `avatar-background.svg` (the black it stands on) under the
sprite. All four sit in one 20×20 square, so a pixel is the same size in each.

| File | Sprite | Accent |
|---|---|---|
| `avatar-bug.svg` | `BUG_SIT` — the bug waiting for a click | `--cat-attack` |
| `avatar-server.svg` | `SERVER` — whole | `--cat-release` |
| `avatar-hotfix.svg` | `HOTFIX` | `--cat-defense` |
| `avatar-monitoring.svg` | `MONITOR` | `--cat-protection` |

## Achievement

`achievement.svg` — the "Bug Runner" plate on the results screen: the middle of a meal, the bug in
its running frame (`BUG_RUN_A`) eating a server with two bites taken (`SERVER_BITES[2]`), placed as
the game places them. No background: the plate is behind it.

The dark body of every sprite is `--surface-1`; the avatars' background is `--bg`.
