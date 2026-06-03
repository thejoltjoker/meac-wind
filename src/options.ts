/** Options passed to `fetchWindData` for abort and timeout control. */
export type FetchWindDataOptions = {
  /** Passed through to `fetch`. When set, `timeoutMs` is ignored. */
  signal?: AbortSignal;
  /** Request timeout in milliseconds. Uses `AbortSignal.timeout` when no `signal` is set. */
  timeoutMs?: number;
};

export function resolveFetchSignal(
  options?: FetchWindDataOptions
): AbortSignal | undefined {
  if (options?.signal) {
    return options.signal;
  }
  if (options?.timeoutMs != null) {
    if (options.timeoutMs <= 0) {
      throw new RangeError("timeoutMs must be a positive number");
    }
    return AbortSignal.timeout(options.timeoutMs);
  }
  return undefined;
}
