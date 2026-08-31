// src/main.ts
import "./ui/styles.css";
import "./ui/chrome/chrome.css";
import "./ui/hud.css";
import "./ui/modals.css";
import "./ui/overlays.css";
import "./ui/mobile.css";
import "./ui/a11y.css";
import { GameApp } from "./app/GameApp";
import { uiScale } from "./ui/uiScale";

function showFatalBootOverlay(error: unknown): void {
  const message = error instanceof Error
    ? (error.stack ? `${error.message}\n\n${error.stack}` : error.message)
    : String(error);
  console.error("[Neva] Failed to start game application:", error);

  const existing = document.getElementById("neva-fatal-boot");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "neva-fatal-boot";
  overlay.setAttribute("role", "alert");
  overlay.setAttribute("aria-live", "assertive");
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:100000",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:24px",
    "background:rgba(10,13,11,0.94)",
    "color:#F3F0E6",
    "font-family:Inter,system-ui,sans-serif"
  ].join(";");

  const panel = document.createElement("div");
  panel.style.cssText = [
    "max-width:640px",
    "width:100%",
    "border:1px solid rgba(243,240,230,0.18)",
    "border-radius:12px",
    "background:#1B201D",
    "padding:28px 24px",
    "box-shadow:0 16px 48px rgba(0,0,0,0.65)"
  ].join(";");

  const title = document.createElement("h1");
  title.textContent = "Neva could not start";
  title.style.cssText = "margin:0 0 12px;font-size:22px;font-weight:700;color:#C86A58;";

  const body = document.createElement("p");
  body.textContent = "WebGL, assets, or physics failed during boot. The game cannot continue in this session.";
  body.style.cssText = "margin:0 0 16px;line-height:1.45;color:#A7B0A5;";

  const pre = document.createElement("pre");
  pre.textContent = message;
  pre.style.cssText = [
    "margin:0",
    "max-height:40vh",
    "overflow:auto",
    "padding:12px",
    "border-radius:8px",
    "background:#141815",
    "color:#F3F0E6",
    "font-size:12px",
    "white-space:pre-wrap",
    "word-break:break-word"
  ].join(";");

  panel.append(title, body, pre);
  overlay.append(panel);
  document.body.append(overlay);
}

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
  const uiContainer = document.getElementById("ui-root") as HTMLElement;

  if (!canvas || !uiContainer) {
    showFatalBootOverlay(new Error("Missing required canvas or ui-root elements in DOM"));
    return;
  }

  try {
    // Publishes --ui-scale before the first UI render so the HUD never flashes
    // at the wrong size on load.
    uiScale.start();
    const app = new GameApp(canvas, uiContainer);
    app.start().catch(showFatalBootOverlay);
  } catch (error) {
    showFatalBootOverlay(error);
  }
});
