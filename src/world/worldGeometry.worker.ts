/// <reference lib="webworker" />
/**
 * Builds world terrain patches and the road overlay off the main thread. Each
 * request runs the same build steps the main thread would, then transfers the
 * finished arrays back; the heartbeat keeps startup's stall deadline alive.
 */
import {
  runWorldGeometryJob,
  serializeWorldGeometry,
  type WorldGeometryWorkerRequest,
  type WorldGeometryWorkerResponse
} from "./worldGeometryTransfer";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const send = (message: WorldGeometryWorkerResponse, transfer: Transferable[] = []): void => scope.postMessage(message, transfer);

scope.onmessage = (event: MessageEvent<WorldGeometryWorkerRequest>) => {
  const { id, job } = event.data;
  try {
    const built = runWorldGeometryJob(job, () => send({ id, type: "progress" }));
    const { geometry, transfer } = serializeWorldGeometry(built);
    send({ id, type: "done", geometry }, transfer);
  } catch (error) {
    send({ id, type: "error", message: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error) });
  }
};
