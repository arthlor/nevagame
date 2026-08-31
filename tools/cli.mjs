#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NODE = process.execPath;
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const PLAYWRIGHT = path.join(ROOT, "node_modules/.bin", process.platform === "win32" ? "playwright.cmd" : "playwright");

const HELP = `Neva developer tools

Usage: npm run tools -- <command> [action] [...args]

Commands:
  art <action>              Route to the catalog Blender CLI
  layout dev [...args]      Start the local F2/?place editor server
  ui <atlas|check|codegen|publish|slice>
  audio <normalize|check|plan|ingest>
  test <unit|e2e|visual|visual-update>
  ci [--no-visual]          Typecheck, lint, unit, build, audio parity, visual
  clean <target> --yes      Remove an allowlisted generated target
  help                      Show this help

Clean targets: art-cache, art-staging, test-output, all`;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: "inherit",
      shell: false
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`${command} terminated by ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

async function runChecked(command, args, options) {
  const code = await run(command, args, options);
  if (code !== 0) throw new Error(`${path.basename(command)} exited with code ${code}`);
}

async function routeArt(args) {
  if (!args.length) throw new Error("art requires an action such as generate, validate, or benchmark");
  if (args[0] === "benchmark") return run(NPM, ["run", "art:benchmark", "--", ...args.slice(1)]);
  if (args[0] === "benchmark-extended") return run(NPM, ["run", "art:benchmark:extended", "--", ...args.slice(1)]);
  return run(NODE, [path.join(ROOT, "tools/blender/cli.mjs"), ...args]);
}

function routeUi(action, args) {
  const scripts = {
    atlas: ["tools/ui/extrudeAndPack.mjs"],
    check: ["tools/ui/extrudeAndPack.mjs", "--check"],
    codegen: ["tools/ui/codegen.mjs"],
    publish: ["tools/ui/publish-atlas.mjs"],
    slice: ["tools/ui/slice-sheet.mjs"]
  };
  const route = scripts[action];
  if (!route) throw new Error(`Unknown ui action: ${action ?? "(missing)"}`);
  return run(NODE, [path.join(ROOT, route[0]), ...route.slice(1), ...args]);
}

function routeAudio(action, args) {
  if (action === "ingest") return run(NODE, [path.join(ROOT, "tools/audio/ingest-freesound.mjs"), ...args]);
  const extra = action === "check" ? ["--check"] : action === "plan" ? ["--dry-run"] : [];
  if (action !== "normalize" && action !== "check" && action !== "plan") {
    throw new Error(`Unknown audio action: ${action ?? "(missing)"}`);
  }
  return run(NODE, [path.join(ROOT, "tools/audio/normalizeBus.mjs"), ...extra, ...args]);
}

function routeTest(action, args) {
  if (action === "unit") return run(NPM, ["run", "test", "--", ...args]);
  if (action === "e2e") return run(NPM, ["run", "test:e2e", "--", ...args]);
  if (action === "visual") return run(PLAYWRIGHT, ["test", "--config=playwright.visual.config.ts", ...args]);
  if (action === "visual-update") {
    return run(PLAYWRIGHT, ["test", "--config=playwright.visual.config.ts", "--update-snapshots", ...args]);
  }
  throw new Error(`Unknown test action: ${action ?? "(missing)"}`);
}

async function routeCi(args) {
  const includeVisual = !args.includes("--no-visual");
  const unknown = args.filter((arg) => arg !== "--no-visual");
  if (unknown.length) throw new Error(`Unknown ci option: ${unknown.join(" ")}`);
  const steps = [
    [NPM, ["run", "typecheck"]],
    [NPM, ["run", "lint"]],
    [NPM, ["run", "test"]],
    [NPM, ["run", "build"]],
    [NPM, ["run", "audio:normalize:check"]]
  ];
  if (includeVisual) steps.push([PLAYWRIGHT, ["test", "--config=playwright.visual.config.ts"]]);
  for (const [command, commandArgs] of steps) await runChecked(command, commandArgs);
  return 0;
}

const CLEAN_TARGETS = {
  "art-cache": ["generated/.cache/art"],
  "art-staging": ["generated/.staging"],
  "test-output": ["output/playwright", "test-results", "playwright-report"]
};

function routeClean(target, args) {
  if (!target || (target !== "all" && !(target in CLEAN_TARGETS))) {
    throw new Error(`Unknown clean target: ${target ?? "(missing)"}`);
  }
  if (!args.includes("--yes")) {
    throw new Error("clean is destructive; inspect the target and pass --yes");
  }
  const unknown = args.filter((arg) => arg !== "--yes");
  if (unknown.length) throw new Error(`Unknown clean option: ${unknown.join(" ")}`);
  const relativePaths = target === "all" ? Object.values(CLEAN_TARGETS).flat() : CLEAN_TARGETS[target];
  for (const relativePath of [...new Set(relativePaths)]) {
    const absolutePath = path.resolve(ROOT, relativePath);
    if (!absolutePath.startsWith(`${ROOT}${path.sep}`)) throw new Error(`Refusing unsafe clean path: ${absolutePath}`);
    fs.rmSync(absolutePath, { recursive: true, force: true });
    console.log(`removed ${relativePath}`);
  }
  return 0;
}

async function interactiveArgs() {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log("1) Start layout editor\n2) Plan audio normalization\n3) Update visual baselines\n4) Run CI\n5) Help");
    const choice = (await prompt.question("Choose: ")).trim();
    return ({
      "1": ["layout", "dev"],
      "2": ["audio", "plan"],
      "3": ["test", "visual-update"],
      "4": ["ci"],
      "5": ["help"]
    })[choice] ?? ["help"];
  } finally {
    prompt.close();
  }
}

async function main() {
  let args = process.argv.slice(2);
  if (!args.length) {
    if (!process.stdin.isTTY) {
      console.log(HELP);
      return 0;
    }
    args = await interactiveArgs();
  }
  const [command, action, ...rest] = args;
  if (command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return 0;
  }
  if (command === "art") return routeArt([action, ...rest].filter(Boolean));
  if (command === "layout") {
    if (action !== "dev") throw new Error(`Unknown layout action: ${action ?? "(missing)"}`);
    return run(NPM, ["run", "dev", "--", "--host", "127.0.0.1", ...rest]);
  }
  if (command === "ui") return routeUi(action, rest);
  if (command === "audio") return routeAudio(action, rest);
  if (command === "test") return routeTest(action, rest);
  if (command === "ci") return routeCi([action, ...rest].filter(Boolean));
  if (command === "clean") return routeClean(action, rest);
  throw new Error(`Unknown command: ${command}`);
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
