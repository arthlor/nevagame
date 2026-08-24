// src/main.ts
import "./ui/styles.css";
import { GameApp } from "./app/GameApp";

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
  const uiContainer = document.getElementById("ui-root") as HTMLElement;

  if (!canvas || !uiContainer) {
    throw new Error("Missing required canvas or ui-root elements in DOM");
  }

  const app = new GameApp(canvas, uiContainer);
  app.start().catch((err) => {
    console.error("[Neva] Failed to start game application:", err);
  });
});
