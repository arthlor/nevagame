// Rebuilds the live gauntlet progress page from whatever contact sheets exist on disk.
//   node tools/gauntlet/build-progress.mjs
// Writes the page to the scratchpad path printed at the end, ready for Artifact publish.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_HTML = process.env.GAUNTLET_PAGE
  ?? "/private/tmp/claude-501/-Users-anilkaraca-Desktop-Neva/bd053b87-1498-41e3-9ba4-cf0334899065/scratchpad/gauntlet-progress.html";
const STATE = JSON.parse(fs.readFileSync(path.join(ROOT, "output/gauntlet/state.json"), "utf8"));
const TMP = fs.mkdtempSync("/tmp/gauntlet-img-");

function dataUri(file, width, quality = 78) {
  if (!file || !fs.existsSync(file)) return null;
  const scaled = path.join(TMP, `${path.basename(file, ".png")}-${width}.jpg`);
  execFileSync("magick", [file, "-resize", `${width}x`, "-quality", String(quality), scaled]);
  return `data:image/jpeg;base64,${fs.readFileSync(scaled).toString("base64")}`;
}

function sheet(dir, id) {
  const file = path.join(ROOT, "output/gauntlet", dir, `${id}-SHEET.png`);
  return fs.existsSync(file) ? file : null;
}

const reference = dataUri(path.join(ROOT, "art/references/char-reference-turnaround.png"), 1500, 82);

const STATUS_COPY = {
  pending:  { label: "Not started",   tone: "idle" },
  building: { label: "Builder at work", tone: "work" },
  judging:  { label: "With the critic", tone: "work" },
  lost:     { label: "Critic picked the reference", tone: "lost" },
  won:      { label: "Critic picked ours", tone: "won" }
};

const rows = STATE.characters.map((c) => {
  const before = dataUri(sheet("baseline", c.id), 1040);
  const after = dataUri(sheet("current", c.id), 1040);
  const status = STATUS_COPY[c.status] ?? STATUS_COPY.pending;
  return { ...c, before, after, status };
});

const won = rows.filter((r) => r.status.tone === "won").length;
const captured = rows.filter((r) => r.before).length;

const html = `<title>Neva Character Gauntlet</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Archivo:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root {
    --ground: #EDEEEC;
    --panel: #FBFBFA;
    --edge: #D6D8D4;
    --edge-soft: #E3E5E1;
    --ink: #1D2220;
    --ink-soft: #5A625E;
    --ink-faint: #8B938E;
    --teal: #3D7671;
    --teal-lift: #59968F;
    --brass: #A8813F;
    --won: #4F7F55;
    --lost: #A8524A;
    --shadow: 0 1px 2px rgba(29,34,32,.06), 0 8px 24px -12px rgba(29,34,32,.18);
    --display: "Bricolage Grotesque", "Trebuchet MS", sans-serif;
    --body: "Archivo", "Helvetica Neue", Arial, sans-serif;
    --mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground: #161A19;
      --panel: #1E2322;
      --edge: #2E3634;
      --edge-soft: #262D2C;
      --ink: #E8EBE9;
      --ink-soft: #A0A9A5;
      --ink-faint: #6E7873;
      --teal: #6FB0A8;
      --teal-lift: #8CC7BF;
      --brass: #C9A163;
      --won: #7BAE7F;
      --lost: #D07C72;
      --shadow: 0 1px 2px rgba(0,0,0,.4), 0 10px 28px -14px rgba(0,0,0,.7);
    }
  }
  :root[data-theme="dark"] {
    --ground: #161A19;
    --panel: #1E2322;
    --edge: #2E3634;
    --edge-soft: #262D2C;
    --ink: #E8EBE9;
    --ink-soft: #A0A9A5;
    --ink-faint: #6E7873;
    --teal: #6FB0A8;
    --teal-lift: #8CC7BF;
    --brass: #C9A163;
    --won: #7BAE7F;
    --lost: #D07C72;
    --shadow: 0 1px 2px rgba(0,0,0,.4), 0 10px 28px -14px rgba(0,0,0,.7);
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--ground);
    color: var(--ink);
    font-family: var(--body);
    font-size: 15px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 40px 24px 80px; display: flex; flex-direction: column; gap: 34px; }

  header { display: flex; flex-direction: column; gap: 10px; }
  .eyebrow {
    font-family: var(--mono); font-size: 11px; letter-spacing: .14em; text-transform: uppercase;
    color: var(--teal); display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  }
  .eyebrow .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--teal); }
  h1 {
    font-family: var(--display); font-weight: 800; font-size: clamp(30px, 4.6vw, 46px);
    line-height: 1.04; letter-spacing: -.022em; margin: 0; text-wrap: balance;
  }
  .lede { color: var(--ink-soft); max-width: 62ch; margin: 0; }

  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .tile {
    background: var(--panel); border: 1px solid var(--edge); border-radius: 3px;
    padding: 14px 16px; display: flex; flex-direction: column; gap: 4px;
  }
  .tile dt { font-family: var(--mono); font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-faint); margin: 0; }
  .tile dd { margin: 0; font-family: var(--display); font-weight: 600; font-size: 25px; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }

  section { display: flex; flex-direction: column; gap: 14px; }
  h2 {
    font-family: var(--display); font-weight: 600; font-size: 13px; letter-spacing: .1em;
    text-transform: uppercase; color: var(--ink-faint); margin: 0;
    padding-bottom: 10px; border-bottom: 1px solid var(--edge);
  }

  .bar-card { background: var(--panel); border: 1px solid var(--edge); border-radius: 3px; overflow: hidden; box-shadow: var(--shadow); }
  .bar-card img { display: block; width: 100%; }
  .bar-note { padding: 14px 18px; border-top: 1px solid var(--edge-soft); color: var(--ink-soft); font-size: 13.5px; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
  .bar-note code { font-family: var(--mono); font-size: 12px; color: var(--brass); }

  .row { background: var(--panel); border: 1px solid var(--edge); border-radius: 3px; box-shadow: var(--shadow); overflow: hidden; }
  .row-head { display: flex; align-items: baseline; gap: 12px; padding: 13px 18px; border-bottom: 1px solid var(--edge-soft); flex-wrap: wrap; }
  .row-head .who { font-family: var(--display); font-weight: 600; font-size: 17px; letter-spacing: -.01em; }
  .row-head .role { color: var(--ink-faint); font-size: 13px; }
  .row-head .spacer { flex: 1 1 auto; }
  .tris { font-family: var(--mono); font-size: 12px; color: var(--ink-soft); font-variant-numeric: tabular-nums; }

  .chip {
    font-family: var(--mono); font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase;
    padding: 3px 9px; border-radius: 2px; border: 1px solid currentColor; white-space: nowrap;
  }
  .chip.idle { color: var(--ink-faint); }
  .chip.work { color: var(--brass); }
  .chip.won  { color: var(--won); }
  .chip.lost { color: var(--lost); }

  .compare { display: grid; grid-template-columns: 1fr 1fr; }
  @media (max-width: 720px) { .compare { grid-template-columns: 1fr; } }
  .pane { display: flex; flex-direction: column; min-width: 0; }
  .pane + .pane { border-left: 1px solid var(--edge-soft); }
  @media (max-width: 720px) { .pane + .pane { border-left: 0; border-top: 1px solid var(--edge-soft); } }
  .pane-label {
    font-family: var(--mono); font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase;
    color: var(--ink-faint); padding: 9px 18px; border-bottom: 1px solid var(--edge-soft);
  }
  .pane img { display: block; width: 100%; }
  .pane .empty {
    padding: 42px 18px; color: var(--ink-faint); font-size: 13px; text-align: center;
    font-family: var(--mono); letter-spacing: .04em;
  }
  .gap-note {
    padding: 12px 18px; border-top: 1px solid var(--edge-soft); font-size: 13.5px; color: var(--ink-soft);
    display: flex; gap: 9px; align-items: baseline;
  }
  .gap-note strong {
    font-family: var(--mono); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase;
    color: var(--lost); font-weight: 500; flex: 0 0 auto;
  }
  footer { color: var(--ink-faint); font-size: 12.5px; font-family: var(--mono); border-top: 1px solid var(--edge); padding-top: 16px; }
</style>

<div class="wrap">
  <header>
    <p class="eyebrow"><span class="dot"></span> ${STATE.phase}</p>
    <h1>Neva Character Gauntlet</h1>
    <p class="lede">Seven characters rebuilt until a blind critic stops picking the reference sheet. Every render below comes straight out of the Art Yard at four fixed angles &mdash; nothing is hand-picked.</p>
  </header>

  <dl class="tiles">
    <div class="tile"><dt>Characters</dt><dd>${rows.length}</dd></div>
    <div class="tile"><dt>Baselines captured</dt><dd>${captured}<span style="color:var(--ink-faint);font-size:16px">/${rows.length}</span></dd></div>
    <div class="tile"><dt>Won blind</dt><dd style="color:var(--won)">${won}</dd></div>
    <div class="tile"><dt>Triangle ceiling</dt><dd>16k</dd></div>
  </dl>

  <section>
    <h2>The bar</h2>
    <div class="bar-card">
      ${reference ? `<img src="${reference}" alt="Reference character turnaround sheet: front, three-quarter, side, rear and top views of a cozy stylized character in a teal shirt, cream apron and brown boots, with detail insets of the face, hand, boot, pocket stitching and satchel.">` : ""}
      <p class="bar-note"><span>Every comparison is made against this image directly, not a description of it.</span> <code>art/references/char-reference-turnaround.png</code></p>
    </div>
  </section>

  <section>
    <h2>Characters</h2>
    ${rows.map((r) => `
    <article class="row">
      <div class="row-head">
        <span class="who">${r.name}</span>
        <span class="role">${r.role}</span>
        <span class="spacer"></span>
        ${r.tris ? `<span class="tris">${Number(r.tris).toLocaleString()} tris</span>` : ""}
        <span class="chip ${r.status.tone}">${r.status.label}</span>
      </div>
      <div class="compare">
        <div class="pane">
          <div class="pane-label">Before</div>
          ${r.before ? `<img src="${r.before}" alt="${r.name} before: front, three-quarter, side and rear renders.">` : `<div class="empty">not captured yet</div>`}
        </div>
        <div class="pane">
          <div class="pane-label">Current</div>
          ${r.after ? `<img src="${r.after}" alt="${r.name} current: front, three-quarter, side and rear renders.">` : `<div class="empty">awaiting first build</div>`}
        </div>
      </div>
      ${r.gap ? `<p class="gap-note"><strong>Biggest gap</strong><span>${r.gap}</span></p>` : ""}
    </article>`).join("")}
  </section>

  <footer>Updated ${STATE.updated || new Date().toISOString().replace("T", " ").slice(0, 16)} &middot; renders via tools/gauntlet/capture-turnaround.mjs${STATE.note ? ` &middot; ${STATE.note}` : ""}</footer>
</div>
`;

fs.writeFileSync(OUT_HTML, html);
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`${(fs.statSync(OUT_HTML).size / 1024 / 1024).toFixed(2)} MB -> ${OUT_HTML}`);
