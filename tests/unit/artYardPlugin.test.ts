import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { artYardPlugin } from "../../tools/vite/artYardPlugin";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("Neva art yard plugin and viewer", () => {
  it("includes the stylesheet link and entry script in tools/art-yard/viewer.html", () => {
    const viewerHtml = fs.readFileSync(path.join(ROOT, "tools/art-yard/viewer.html"), "utf8");
    expect(viewerHtml).toContain('<link rel="stylesheet" href="/src/art-yard/styles.css" />');
    expect(viewerHtml).toContain('<script type="module" src="/src/art-yard/main.ts"></script>');
    expect(viewerHtml).toContain('id="yard-canvas"');
    expect(viewerHtml).toContain('id="asset-select"');
  });

  it("registers configureServer middleware that handles yard endpoints", () => {
    const plugin = artYardPlugin(ROOT);
    expect(plugin.name).toBe("neva-dev-art-yard");
    expect(typeof plugin.configureServer).toBe("function");
  });
});
