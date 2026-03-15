---
name: "add-chat-banter"
description: "Add code for banter to show in chat bubbles."
---

# Add Chat Banter Skill

For fun and cosmetic purposes, we should replace the logic in `/chat.ts` with something fitting to our own strategy.
Use the `/intermediary/flavor-text.md` file for inspiration.
Generate a list of around 10 different chat messages with these features:

- Ideally super short (around 25 characters, and 50 characters is the absolute max)
- Use **only** simple ascii characters.
- In the style of flavor text file
- Prefer these types of messages:
  - Sharp and harsh mockery of your opponent
  - Cries of agony if your energy drops low
  - Exclamations of how great "PaintBot Army" (the collection of all bots with PaintBot basis) is
  - Occassionaly random hard coded binary strings to confuse viewers

You can safely assume that the `createBanter` function you're implementing is only called if there is enough ChatEnergy.

## Verification

To verify if the code you generated is correct, run both:

```
bun x tsc --noEmit
bun test
```
