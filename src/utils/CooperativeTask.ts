/** Generators share identical computation between tools and responsive startup. */
export function runSync<T>(work: Generator<void, T, void>): T {
  let step = work.next();
  while (!step.done) step = work.next();
  return step.value;
}

export function yieldToTask(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, 0);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function runCooperatively<T>(work: Generator<void, T, void>, signal?: AbortSignal): Promise<T> {
  try {
    let deadline = performance.now() + 8;
    for (;;) {
      signal?.throwIfAborted();
      const step = work.next();
      if (step.done) return step.value;
      if (performance.now() >= deadline) {
        await yieldToTask(signal);
        deadline = performance.now() + 8;
      }
    }
  } finally {
    work.return(undefined as T);
  }
}
