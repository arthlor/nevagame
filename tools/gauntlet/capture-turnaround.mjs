// Captures front / 3-quarter / side / rear renders of characters from the Art Yard
// and composes one contact sheet per character for blind comparison against
// art/references/char-reference-turnaround.png.
//
//   node tools/gauntlet/capture-turnaround.mjs [--stage published|run-XXX] [--out DIR] [--assets a,b,c]

import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ANGLES = ["front", "three-quarter", "side", "rear"];
const DEFAULT_ASSETS = [
  "char_player_a",
  "char_npc_elspeth_a",
  "char_npc_barnaby_a",
  "char_npc_silas_a",
  "char_npc_maeve_a",
  "char_npc_tomas_a",
  "char_npc_ines_a"
];

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const stage = arg("stage", "published");
const outDir = path.resolve(process.cwd(), arg("out", `output/gauntlet/${stage}`));
const assets = arg("assets", "").trim() ? arg("assets").split(",").map((s) => s.trim()) : DEFAULT_ASSETS;
const port = process.env.NEVA_YARD_PORT ?? "3000";
const baseUrl = `http://127.0.0.1:${port}/__neva_art_yard`;

fs.mkdirSync(outDir, { recursive: true });

// Strips the yard chrome so the render is the only thing in frame.
const HIDE_CHROME = `
  for (const sel of [".yard-panel", ".stage-hud", ".stage-toolbar", "#yard-status", "#yard-toast"]) {
    document.querySelectorAll(sel).forEach((el) => { el.style.display = "none"; });
  }
  document.querySelector(".yard-stage")?.style.setProperty("width", "100vw");
`;

async function settle(page) {
  await page.waitForFunction(
    () => document.getElementById("hud-tris-badge")?.textContent?.match(/[0-9]/) !== null,
    { timeout: 30000 }
  );
  await page.waitForTimeout(700);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
const captured = [];

for (const asset of assets) {
  const url = `${baseUrl}?asset=${asset}${stage === "published" ? "" : `&artStage=${stage}`}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await settle(page);

  // Freeze the idle animation so every angle shows the same pose.
  await page.evaluate(`document.getElementById("anim-play-toggle")?.click();`);

  const shots = [];
  for (const angle of ANGLES) {
    await page.evaluate(`document.querySelector('[data-cam="${angle}"]')?.click();`);
    await page.waitForTimeout(350);
    await page.evaluate(HIDE_CHROME);
    await page.waitForTimeout(150);

    const file = path.join(outDir, `${asset}-${angle}.png`);
    await page.locator("#yard-canvas").screenshot({ path: file });
    shots.push(file);
    await page.reload({ waitUntil: "networkidle" });
    await settle(page);
    await page.evaluate(`document.getElementById("anim-play-toggle")?.click();`);
  }

  const sheet = path.join(outDir, `${asset}-SHEET.png`);
  execFileSync("montage", [...shots, "-tile", "4x1", "-geometry", "+8+8", "-background", "#F2EDE2", sheet]);
  captured.push(sheet);
  console.log(`captured ${asset} -> ${sheet}`);
}

await browser.close();
console.log(`\n${captured.length} contact sheets in ${outDir}`);
