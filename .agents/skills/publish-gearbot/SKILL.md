---
name: "publish-gearbot"
description: "Publish the final gearbot to participate in matches"
---

# Publish Gearbot SKILL

Execute this to publish (it'll run a custom cross-OS typescript script in `/publish.ts` to package things in a zip):

```
bun run publish
```

If the command gives zero output and a file `/publish.zip` (git ignored) exists, then all is well!
