---
name: threejs-image-generator
description: "Generate and edit 2D image assets for Three.js games via Gemini. Use for concepts, image-to-3D inputs, textures, skies, decals, logos, icons, and GUI or title art. Neva: requires an explicit human request."
---

# Three.js Image Generator

- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.

> Repository override (Neva): provider generation requires an explicit human
> request. Where this skill conflicts with `AGENTS.md`
> ("Generate-asset prompt contract" or "Codex and threejs-game-skills"),
> `AGENTS.md` wins.

## Purpose

Create game-useful 2D assets and references for Three.js projects. This skill is the image-generation layer for the Three.js game system: it produces concepts, textures, decals, UI art, and 2D inputs that can be handed to `threejs-3d-generator` for image-to-3D model creation.

Provider: Google's Gemini image API.

Resolve `<this-skill-dir>` in the commands below in this order, preferring the repository copy: repo `.agents/skills/threejs-image-generator`, legacy repo `skills/threejs-image-generator`, `~/.agents/skills/threejs-image-generator`, `~/.claude/skills/threejs-image-generator`, or `~/.codex/skills/threejs-image-generator`.

## When To Use

Use this explicit-only skill when the human requests Gemini image generation or editing for:

- 2D-to-3D reference images for `threejs-3d-generator`: characters, creatures, buildings, ships, cars, weapons, props, pickups, terrain modules.
- Texture and material references: terrain, road, rock, sand, metal, sci-fi panels, trim sheets, decals, hazard labels, signs.
- Environment images: skies, backdrops, city horizons, nebula plates, menu backgrounds, parallax layers.
- UI art: logos, faction marks, icons, item cards, ability badges, cockpit decals, GUI panels, title art.
- Existing-image edits, style variants, cleanup, palette alignment, or concept sheet refinements.

Choose output scope from the request and art brief. Existing art and procedural work remain valid source choices; no premium-quality claim requires provider output.

## API Key

Never store API keys in skill files or browser/game code, and never paste a key value into a report. The script reads `--api-key` or `GEMINI_API_KEY`.

For an authorized provider operation, this optional local diagnostic reports
whether `GEMINI_API_KEY` is available without printing the value:

```bash
uv run <this-skill-dir>/scripts/generate_image.py probe
```

Use it when credential availability is relevant to the requested operation.
Do not probe unrelated providers or require a probe to justify existing or
procedural assets. Report actual operation errors or unavailable capabilities
concisely; do not source arbitrary shell profiles as an automatic workaround.

## Tool Script

Run from the user's current project directory so output lands in the game project:

```bash
uv run <this-skill-dir>/scripts/generate_image.py --prompt "your image description" --filename assets/concepts/output.png --resolution 2K
```

Edit an existing image:

```bash
uv run <this-skill-dir>/scripts/generate_image.py \
  --input-image assets/concepts/ship.png \
  --prompt "turn this into a battle-worn red racing livery with clearer material zones" \
  --filename assets/concepts/ship-red-livery.png \
  --resolution 2K
```

Resolution mapping:

- `1K`: quick concepts, icons, draft sheets.
- `2K`: default production reference for image-to-3D, textures, backgrounds, UI panels. This is also the script default when `--resolution` is omitted.
- `4K`: hero splash/title art, high-detail texture references, large sky/background plates.

## Prompt Patterns

Image-to-3D reference:

```text
Create a clean 3D-generation reference image of [asset]. Centered single object, full object visible, plain light background, readable silhouette, clear material zones, game-ready [genre/style], no motion blur, no cropped parts, no text.
```

Riggable character/creature reference:

```text
Create a full-body [T-pose/A-pose/side-view creature] reference for 3D rigging: [details]. Symmetric stance, visible hands/feet/limbs, plain background, readable costume/anatomy layers, no weapon fused to hands.
```

Texture/material reference:

```text
Create a seamless game texture reference for [surface]. Orthographic/top-down, PBR-friendly albedo, clear material variation, no perspective, no baked strong shadows, [style/material details].
```

Logo/icon/UI art:

```text
Create a crisp game UI [logo/icon/badge/panel] for [faction/item/ability]. Transparent-friendly silhouette, high contrast at small size, [genre styling], no tiny unreadable text.
```

Sky/background:

```text
Create a wide game background plate of [environment]. Layered depth, readable horizon, [time/weather/style], suitable behind a real-time Three.js scene, no foreground subject.
```

## Three.js Integration Rules

- Save concepts and image-to-3D sources under `assets/concepts/`.
- Save textures, decals, icons, and GUI source images under `assets/textures/`, `assets/decals/`, or `assets/ui/`.
- For image-to-3D, hand the saved image path to `threejs-3d-generator` and retain the source relationship with the asset provenance. This pairing also requires authorization for 3D generation.
- Do not call the image API from client-side game code.
- Convert generated PNGs into runtime formats deliberately: PNG for alpha/UI, JPG/WebP/KTX2 for larger opaque textures where the project pipeline supports it.
- Verify how the image appears in game, not only that the file exists.

## Required Report

Report:

- Prompt and purpose.
- Output path.
- Resolution.
- Whether the image was used directly, edited further, or handed to `threejs-3d-generator`.
- Any remaining integration work such as compression, UV assignment, alpha cleanup, or atlas packing.

Complete the requested image outputs and integration, or state the exact gap. File creation alone does not prove the integrated result.
