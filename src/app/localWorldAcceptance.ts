/**
 * Localhost-only escape hatch that lets production-build measurement lanes
 * (`test:budget`, `world:acceptance`) auto-start and read the debug overlay and
 * harness without shipping those affordances to players.
 */
export function localWorldAcceptanceRequested(query: URLSearchParams): boolean {
  return (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")
    && query.get("worldAcceptance") === "1";
}
