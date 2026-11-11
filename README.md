# Craft Bench: AION 2 crafting planner & simulator

**Open it:** https://adjalil.github.io/aion2-craft-bench/

Plan any craftable weapon, armor piece or accessory in AION 2 (global client), for Elyos and Asmodian:

- **Your path:** every stage from the first craft to the item you want (regular craft, Splendent upgrade, combo-only), with a one-line explanation of each. Stages you already have fold away.
- **Bench:** each stage's recipe like the in-game Crafting Materials window: transfer material, have/need, where to get each material (drops, dungeons, shops), sub-recipes.
- **What it costs:** Safe (no combo luck) / Average / Lucky, the Kinah to buy what you're missing at your market prices, and the crafts to do in order.
- **Simulator:** rolls every craft's success and 25% combo thousands of times and shows the cost range.
- **Track real crafts:** "✓ I crafted it in game" uses up the materials and adds the result.

## Your data

Everything is saved **in your own browser** (localStorage); nothing is uploaded.

- **Profiles:** one per player or character (👤 menu), each with its own inventory, prices and proficiency.
- **Export / Import:** save a profile (or all of them) to a `.json` file and load it on another PC or browser.
- **Share:** copies a link with your profile packed into it. Whoever opens it can load it as a new profile of their own.

## Data

Recipes, item stats, icons and material sources come from [aion2data.com](https://aion2data.com), read from the AION 2 global client (2026.10.28). The Dragon Lord upgrade recipes don't list the item you put in; Craft Bench fills it in (the previous piece of the line), as the game shows it.

Unofficial fan tool, not affiliated with NCSOFT. AION is a trademark of NCSOFT Corporation; game data and art belong to it.

Assumptions: a failed craft uses up its materials; with no proficiency set, every craft counts as a success (set yours in ⚙ Settings).

## Updating the data

`tools/build.py` regenerates `data.js` and `icons/game/` from aion2data.com (put `recipes.json` and `items.json` from `https://aion2data.com/raw/` next to it). `tools/check.js` checks the planner's numbers against in-game recipes: `node tools/check.js .`
