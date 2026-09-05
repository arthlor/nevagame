import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import type { Plugin } from "vite";

/** Keep in sync with `LAYOUT_EDITOR_COMMIT_PATH` in `src/layout-editor/layoutEdit.ts`. */
const LAYOUT_EDITOR_COMMIT_PATH = "/__neva_layout_editor/commit";

function jsonResponse(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(`${JSON.stringify(value)}\n`);
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

const HOT_UPDATE_SUPPRESS_MS = 2500;

function hostnameOf(hostHeader: string | undefined): string {
  const host = (hostHeader ?? "").split(",")[0]!.trim().toLowerCase();
  return host.startsWith("[")
    ? (host.match(/^\[([^\]]+)\]/)?.[1] ?? host)
    : host.split(":")[0]!;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function isLocalLayoutEditorHost(hostHeader: string | undefined): boolean {
  return isLoopbackHostname(hostnameOf(hostHeader));
}

/**
 * The `Host` header is set by the browser to the address it dialled, so it says
 * nothing about who asked. A page on any origin can post a `text/plain` form to
 * `http://localhost:3000` with a JSON body and no preflight, which would let a
 * site the developer merely visits rewrite files under `src/world`. Require the
 * request to look like it came from the game page itself: a same-origin fetch,
 * a loopback `Origin`, and a JSON content type (cross-origin JSON needs a
 * preflight this plugin never answers).
 */
export function isSameOriginLayoutEditorRequest(headers: {
  origin?: string | undefined;
  secFetchSite?: string | undefined;
  contentType?: string | undefined;
}): boolean {
  const contentType = (headers.contentType ?? "").split(";")[0]!.trim().toLowerCase();
  if (contentType !== "application/json") return false;

  const site = (headers.secFetchSite ?? "").trim().toLowerCase();
  if (site.length > 0 && site !== "same-origin") return false;

  const origin = (headers.origin ?? "").trim();
  if (origin.length > 0 && origin.toLowerCase() !== "null") {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      return false;
    }
    if (!isLoopbackHostname(parsed.hostname.toLowerCase())) return false;
  }
  return true;
}

export function layoutEditorPlugin(rootDirectory: string): Plugin {
  const written = new Map<string, number>();
  const root = path.resolve(rootDirectory);
  // Each commit is read-modify-write over the same six files. Overlapping
  // requests (held rotate, queued pastes, a second tab) would both plan against
  // the pre-write tree and the later write would drop the earlier one.
  let commitQueue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(task: () => T): Promise<T> => {
    const next = commitQueue.then(task, task);
    commitQueue = next.catch(() => undefined);
    return next;
  };
  return {
    name: "neva-dev-layout-editor",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url) {
          next();
          return;
        }
        const url = new URL(request.url, "http://neva.local");
        if (url.pathname !== LAYOUT_EDITOR_COMMIT_PATH) {
          next();
          return;
        }
        if (request.method !== "POST") {
          jsonResponse(response, 405, { ok: false, error: "POST required" });
          return;
        }
        if (!isLocalLayoutEditorHost(request.headers.host)) {
          jsonResponse(response, 403, { ok: false, error: "Layout editor writes are localhost-only" });
          return;
        }
        if (!isSameOriginLayoutEditorRequest({
          origin: request.headers.origin,
          secFetchSite: request.headers["sec-fetch-site"] as string | undefined,
          contentType: request.headers["content-type"]
        })) {
          jsonResponse(response, 403, {
            ok: false,
            error: "Layout editor writes must be a same-origin JSON request"
          });
          return;
        }
        try {
          const { commitLayoutEdit, isLayoutEditCommit } = await import("../layout-editor/patchPlacement");
          const body = JSON.parse(await readBody(request)) as unknown;
          if (!isLayoutEditCommit(body)) {
            jsonResponse(response, 400, { ok: false, error: "Invalid layout commit" });
            return;
          }
          const result = await serialize(() => commitLayoutEdit(root, body, (pending) => {
            const stamped = Date.now();
            for (const file of pending) written.set(path.resolve(file), stamped);
          }));
          jsonResponse(response, 200, {
            ok: true,
            files: result.files.map((file) => path.relative(root, file)),
            id: result.id
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Layout write failed";
          jsonResponse(response, 400, { ok: false, error: message });
        }
      });
    },
    handleHotUpdate(ctx) {
      const file = path.resolve(ctx.file);
      const stamped = written.get(file);
      if (stamped === undefined) return;
      if (Date.now() - stamped > HOT_UPDATE_SUPPRESS_MS) {
        written.delete(file);
        return;
      }
      return [];
    },
    closeBundle() {
      written.clear();
    }
  };
}

export function layoutEditorPluginWritesAllowlistedFiles(rootDirectory: string): boolean {
  return fs.existsSync(path.join(rootDirectory, "src/world/FarmLayout.ts"));
}
