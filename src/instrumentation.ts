// src/instrumentation.ts
//
// Every unhandled error on the server (a crashed page, API route or server
// action) lands in the ops problem log, with the page it happened on.

export async function register() { /* nothing to set up */ }

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  if (process.env.NEXT_RUNTIME === 'edge') return
  const { logEvent } = await import('./lib/ops/log')
  const message = err instanceof Error ? err.message : String(err)
  await logEvent('error', 'server', 'unhandled',
    `${request.method} ${context.routePath || request.path} failed: ${message}`,
    { path: request.path, route: context.routePath, kind: context.routeType, digest: (err as { digest?: string })?.digest ?? null },
    `server:unhandled:${context.routePath || request.path}`)
}
