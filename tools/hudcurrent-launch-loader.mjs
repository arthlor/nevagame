import { createRequire } from "node:module";
const { chromium } = createRequire("/Users/anilkaraca/Desktop/Neva/package.json")("@playwright/test");
const browser = await chromium.launch({ executablePath: "/Users/anilkaraca/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell", headless: true, args: ["--no-sandbox"] });
console.log("ok");
await browser.close();
