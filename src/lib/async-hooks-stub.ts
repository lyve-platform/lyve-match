/**
 * Browser-safe stub for Node's `node:async_hooks` module.
 *
 * TanStack Start's storage-context module imports `AsyncLocalStorage` for
 * server-side request context. In the dev browser bundle that module gets
 * pre-bundled, but `node:async_hooks` is a Node built-in that Vite replaces
 * with a browser-external shim. That shim returns a proxy for any property
 * access, so `new AsyncLocalStorage()` becomes `new undefined()` and throws at
 * runtime. This stub provides a real class that safely no-ops in the browser.
 */

export class AsyncLocalStorage<T> {
  run<R>(store: T, callback: () => R): R {
    return callback();
  }

  getStore(): T | undefined {
    return undefined;
  }

  disable(): void {
    // no-op in browser
  }
}

export default { AsyncLocalStorage };
