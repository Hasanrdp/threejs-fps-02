# Emberworks — a three.js tactical FPS

A round-based tactical first-person shooter in the style Counter-Strike made famous,
built on three.js 0.187.0 as static files with no build step and no network request.

## The game

Two teams fight over a foundry yard. Vanguard (attackers) plant a bomb at Furnace
or Yard; Sentinel (defenders) hold the sites and defuse. Rounds are won by
eliminating the other team, detonating the bomb, or defusing it. Money earned each
round buys weapons, grenades and armour in the buy menu.

- First-person view, mouse look, keyboard movement, crouch, jump and collision
- Four weapons (pistol, rifle, SMG, sniper) plus a frag grenade; headshots deal
  extra damage, recoil and spread punish firing on the move
- Five bots: two Vanguard teammates who push the sites, three Sentinels who hold,
  patrol, react to gunfire and converge on a planted bomb
- A bomb to plant and defuse, a buy menu, round timer, team scores and a HUD with
  health, armour, ammunition, money and a killfeed
- An original foundry map with three lanes, two sites and sightlines worth playing

## Play

Serve `game/` and open it in desktop Chrome:

```
node serve.ts
```

Then open http://localhost:8080 and click to play. `B` opens the buy menu during
the buy phase, `E` (hold) plants the bomb inside a site, `G` throws a grenade.

## Hand in

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This copies `game/` and `screenshots/` to `out/` and writes `out/dossier.json`.

## License

MIT — see LICENSE.
