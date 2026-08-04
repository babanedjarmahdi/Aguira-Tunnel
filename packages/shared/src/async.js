export function createAbortError(message = 'Operation aborted') {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

// Sleep that resolves after `ms`, or rejects with AbortError the moment
// `signal` fires. Used so long-running stages stop promptly on cancel.
export function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(createAbortError());
    const done = () => {
      clearTimeout(t);
      signal?.removeEventListener('abort', onAbort);
    };
    const t = setTimeout(() => { done(); resolve(); }, ms);
    const onAbort = () => { done(); reject(createAbortError()); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function throwIfAborted(signal, message = 'Operation aborted') {
  if (signal?.aborted) throw createAbortError(message);
}
