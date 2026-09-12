---
name: threejs-audio-generator
description: "Generate, convert, and clean audio for Three.js games via ElevenLabs. Use for SFX, ambience loops, UI sounds, announcer or TTS, voice conversion, cleanup, and audio manifests. Neva: requires an explicit human request; the 06 authority wins."
---

# Three.js Audio Generator

- **Scope and evidence.** Follow `../CONVENTIONS.md` and the repository task route.

> Repository override (Neva): provider generation requires an explicit human
> request. Where this skill conflicts with `AGENTS.md`
> ("Generate-asset prompt contract" or "Codex and threejs-game-skills"),
> `AGENTS.md` wins. Neva audio design is owned by its `06` authority.

## Purpose

Create game-ready audio assets for Three.js projects. This skill consolidates game sound generation, voice generation/conversion, audio cleanup, credential probing, and runtime integration into one Three.js-focused production workflow.

Provider: ElevenLabs.

Resolve `<this-skill-dir>` in the commands below in this order, preferring the repository copy: repo `.agents/skills/threejs-audio-generator`, legacy repo `skills/threejs-audio-generator`, `~/.agents/skills/threejs-audio-generator`, `~/.claude/skills/threejs-audio-generator`, or `~/.codex/skills/threejs-audio-generator`.

## When To Use

Use this explicit-only skill for requested ElevenLabs generation, conversion or cleanup:

- SFX: jumps, hits, weapons, explosions, coins, pickups, collisions, UI clicks, confirms, errors.
- Ambience: wind, rain, city bed, engine hum, portal loop, dungeon room tone, battle arena beds.
- Voice: announcer barks, boss lines, tutorial prompts, menu narration, generated placeholder dialogue.
- Voice conversion: convert a scratch performance into a target character voice while preserving timing and emotion.
- Cleanup: isolate or denoise dialogue before voice conversion, TTS replacement, or transcription.
- Integration of the requested outputs: use the existing audio manifest, bus and event owners. Routine playback or audio bug fixes do not require this generator.

The requested audible result defines completion. Reuse suitable existing cues, recordings or synthesis; a visual polish task does not automatically authorize new audio or provider calls.

## API Key

Never store API keys in skill files or browser/game code, and never paste a key value into a report. The script reads `--api-key` or `ELEVENLABS_API_KEY`.

For an authorized provider operation, this optional local diagnostic reports
whether `ELEVENLABS_API_KEY` is available without printing the value:

```bash
python3 <this-skill-dir>/scripts/threejs_audio_asset.py probe
```

Use it when credential availability is relevant to the requested operation.
Do not probe unrelated providers or require a probe to justify existing or
procedural assets. Report actual operation errors or unavailable capabilities
concisely; do not source arbitrary shell profiles as an automatic workaround.

Audio-specific: add `--validate` to the probe to call ElevenLabs `GET /user` and confirm the key actually works (prints `VALID_USER=...`); use it when a key is present but a generation still fails. A valid key can still be blocked by an out-of-credit or plan-tier limit — those surface as an `HTTP 4xx` from a real generation attempt. Report that as a purchase/plan blocker, do not silently skip.

## Required Reference

Read the relevant sections of `references/audio-workflows.md` before generating multiple assets, wiring the requested outputs, or cleaning/converting voices. Neva’s `06` authority and existing runtime owners govern the audio contract.

## Tool Script

Run from the user's current game project directory:

```bash
python3 <this-skill-dir>/scripts/threejs_audio_asset.py --help
```

Probe:

```bash
python3 <this-skill-dir>/scripts/threejs_audio_asset.py probe
```

Generate SFX:

```bash
python3 <this-skill-dir>/scripts/threejs_audio_asset.py sfx \
  --prompt "tight futuristic boost pickup, bright transient, short sparkling tail, arcade racing game" \
  --duration 1.2 \
  --prompt-influence 0.65 \
  --out assets/audio/sfx/boost-pickup.mp3
```

Generate looping ambience:

```bash
python3 <this-skill-dir>/scripts/threejs_audio_asset.py sfx \
  --prompt "seamless cyber resort mini golf ambience, distant surf, soft neon transformer hum, gentle crowd bed" \
  --duration 12 \
  --loop \
  --prompt-influence 0.45 \
  --out assets/audio/ambience/cyber-resort-loop.mp3
```

Generate TTS/announcer line:

```bash
python3 <this-skill-dir>/scripts/threejs_audio_asset.py tts \
  --text "Perfect shot." \
  --voice-id JBFqnCBsd6RMkjVDRZzb \
  --out assets/audio/voice/perfect-shot.mp3
```

Clean dialogue:

```bash
python3 <this-skill-dir>/scripts/threejs_audio_asset.py isolate \
  --input assets/audio/source/noisy-boss-line.wav \
  --out assets/audio/voice/boss-line-clean.mp3
```

Convert a scratch performance to a target voice:

```bash
python3 <this-skill-dir>/scripts/threejs_audio_asset.py voice-change \
  --input assets/audio/source/scratch-boss-line.wav \
  --voice-id JBFqnCBsd6RMkjVDRZzb \
  --remove-background-noise \
  --out assets/audio/voice/boss-line-final.mp3
```

## Game Audio Defaults

- SFX: `mp3_44100_128`, 0.5-2.5s, prompt influence `0.55-0.8`.
- UI: 0.15-0.8s, high prompt influence, keep transients clear.
- Ambience loops: 8-30s, `--loop`, prompt influence `0.3-0.55`.
- Voice: TTS for clean generated lines; voice-change when timing/acting from a scratch performance matters.
- Cleanup: isolate noisy speech before voice-change or final dialogue use.
- Runtime: generate locally, commit/import files, and load them via Web Audio/Three.js integration. Never put API keys in browser code.

## Required Report

Report:

- Generated/processed file paths.
- Prompts/text/input files, voice IDs, durations, loop flags, and output formats.
- Runtime integration notes: audio groups, trigger events, loop behavior, unlock gesture, pause/resume, volume/mute controls.
- Remaining audio gaps and any licensing/plan assumptions tied to the user's ElevenLabs account.
