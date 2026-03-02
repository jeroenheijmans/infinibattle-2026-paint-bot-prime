# GearBots PaintBot

This repository contains the Typescript bot code (to be run with bun) to participate in the "GearBots" tank battle game.
The name for our bot is **PaintBot** (or "paintbot" or "Paintbot").

In each match 2 teams of 3 tanks (bots) each are started, that communicate with the game runner through stdin and stdout.
Each "game loop" (roughly 25 FPS) the tank can first read game state from stdin, then decide what to do on the next frame and write commands to stdout.

In `./README_GEARBOTS.md` the extended rules of the game are given.

Then, the code lives in these files:

- `./index.ts` is PaintBot logic (we can change this at our leisure)
- `./commands.ts` has types for commands we can send to the game runner on stdout (we are **never** allowed to update these types)
- `./messages.ts` has types for the messages we can read from stdin (we are **never** allowed to update these types)

Testing the bot after making changes has to be done by the user, there is no automated way to do it.
