/** Generators share identical computation between tools and responsive startup. */
export function runSync<T>(work: Generator<void, T, void>): T {
  let step = work.next();
  while (!step.done) step = work.next();
  return step.value;
}

let taskChannel: MessageChannel | undefined;
let nextTaskId = 0;
const pendingTasks = new Map<number, () => void>();

/** Browser task turns without the nested setTimeout minimum delay. */
function scheduleTask(callback: () => void): () => void {
  if (typeof window === "undefined" || typeof MessageChannel === "undefined") {
    const timer = setTimeout(callback, 0);
    return () => clearTimeout(timer);
  }
  if (!taskChannel) {
    taskChannel = new MessageChannel();
    taskChannel.port1.onmessage = (event: MessageEvent<number>) => {
      const task = pendingTasks.get(event.data);
      pendingTasks.delete(event.data);
      task?.();
    };
  }
  const id = ++nextTaskId;
  pendingTasks.set(id, callback);
  taskChannel.port2.postMessage(id);
  return () => { pendingTasks.delete(id); };
}

export function yieldToTask(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { cancel(); reject(signal?.reason); };
    const cancel = scheduleTask(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    });
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function runCooperatively<T>(
  work: Generator<void, T, void>, signal?: AbortSignal, onProgress?: () => void
): Promise<T> {
  try {
    let deadline = performance.now() + 8;
    let lastProgress = performance.now();
    for (;;) {
      signal?.throwIfAborted();
      const step = work.next();
      if (step.done) return step.value;
      if (performance.now() >= deadline) {
        await yieldToTask(signal);
        const now = performance.now();
        if (onProgress && now - lastProgress >= 1000) {
          onProgress();
          lastProgress = now;
        }
        deadline = now + 8;
      }
    }
  } finally {
    work.return(undefined as T);
  }
}
