# Craft Bench: AION 2 crafting planner & material tracker

**Open it:** https://aion2tool.github.io/craft-bench/

Plan any craftable weapon, armor piece or accessory in AION 2 (global client), for Elyos and Asmodian:

- **Steps:** one box per craft, left to right with arrows, like the in-game Crafting Materials window: the item, its transfer material and materials with have/need. It starts at your next craft; tick "Show finished steps" to see the whole line. Guaranteed crafts are marked 100%.
- **Total materials:** everything the item still needs in one list: type what you have and market prices, and see what's short and the Kinah to buy it.
- **✓ I crafted it:** uses up the materials and moves you to the next box.

## Your data

Everything is saved **in your own browser** (localStorage); nothing is uploaded.

- **Profiles:** one per player or character (👤 menu), each with its own inventory, prices and proficiency.
- **Export / Import:** save a profile (or all of them) to a `.json` file and load it on another PC or browser.
- **Share:** copies a link with your profile packed into it. Whoever opens it can load it as a new profile of their own.

## Also from aion2tool

- **[RATmeter](https://github.com/aion2tool/ratmeter)**: AION 2 DPS meter with fight result cards, boss timers and a character Control Panel. [Download](https://github.com/aion2tool/ratmeter/releases/latest).

## Data

Recipes, item stats, icons and material sources come from [aion2data.com](https://aion2data.com), read from the AION 2 global client (2026.10.28). The Dragon Lord upgrade recipes don't list the item you put in; Craft Bench fills it in (the previous piece of the line), as the game shows it.

Unofficial fan tool, not affiliated with NCSOFT. AION is a trademark of NCSOFT Corporation; game data and art belong to it.

Assumptions: a failed craft uses up its materials; with no proficiency set, every craft counts as a success (set yours in ⚙ Settings).

## Updating the data

`tools/build.py` regenerates `data.js` and `icons/game/` from aion2data.com (put `recipes.json` and `items.json` from `https://aion2data.com/raw/` next to it). `tools/check.js` checks the planner's numbers against in-game recipes: `node tools/check.js .`
