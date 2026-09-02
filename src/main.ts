// src/main.ts
import "./ui/coastal.css";
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
  overlay.className = "fatal-recovery-screen interactive";
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "fatal-recovery-title");
  overlay.setAttribute("aria-describedby", "fatal-recovery-copy");
  overlay.setAttribute("aria-live", "assertive");

  const panel = document.createElement("div");
  panel.className = "fatal-recovery-sheet";

  const title = document.createElement("h1");
  title.id = "fatal-recovery-title";
  title.textContent = "The coast did not open";

  const body = document.createElement("p");
  body.id = "fatal-recovery-copy";
  body.textContent = "Neva could not finish preparing. Try again; your harbor log has not been changed.";

  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "fatal-recovery-retry";
  retry.textContent = "Try again";
  retry.addEventListener("click", () => window.location.reload());

  const details = document.createElement("details");
  details.className = "fatal-recovery-diagnostics";
  const summary = document.createElement("summary");
  summary.textContent = "Diagnostics";

  const pre = document.createElement("pre");
  pre.textContent = message;
  details.append(summary, pre);

  panel.append(title, body, retry, details);
  overlay.append(panel);
  document.body.append(overlay);
  retry.focus();
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
