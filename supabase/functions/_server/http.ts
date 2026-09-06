/**
 * HTTP plumbing for the API function: CORS, JSON responses, typed errors and a
 * tiny path router. Kept dependency-free so it runs unchanged on Deno.
 */

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*'

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      // Responses are user-scoped; never let a shared cache hold one.
      'Cache-Control': 'no-store',
      ...extra,
    },
  })
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

/** An error with an HTTP status the router knows how to render. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message)
  }
}

export const badRequest = (m: string, code?: string) => new ApiError(400, m, code)
export const unauthorized = (m = 'Authentication required') => new ApiError(401, m)
export const forbidden = (m = 'You do not have access to this resource') => new ApiError(403, m)
export const notFound = (m = 'Not found') => new ApiError(404, m)
export const conflict = (m: string, code?: string) => new ApiError(409, m, code)

/* -------------------------------------------------------------------------- */
/*  Router                                                                     */
/* -------------------------------------------------------------------------- */

export interface RouteContext<Ctx> {
  req: Request
  url: URL
  params: Record<string, string>
  ctx: Ctx
  body: <T>() => Promise<T>
}

type Handler<Ctx> = (c: RouteContext<Ctx>) => Promise<Response> | Response

interface Route<Ctx> {
  method: string
  segments: string[]
  handler: Handler<Ctx>
}

/**
 * Minimal path router. Patterns use `:name` for a segment capture, e.g.
 * `/trainer/candidates/:candidateId`.
 */
export class Router<Ctx> {
  private routes: Route<Ctx>[] = []

  add(method: string, pattern: string, handler: Handler<Ctx>): this {
    this.routes.push({
      method,
      segments: pattern.split('/').filter(Boolean),
      handler,
    })
    return this
  }

  get(p: string, h: Handler<Ctx>) {
    return this.add('GET', p, h)
  }
  post(p: string, h: Handler<Ctx>) {
    return this.add('POST', p, h)
  }
  patch(p: string, h: Handler<Ctx>) {
    return this.add('PATCH', p, h)
  }
  delete(p: string, h: Handler<Ctx>) {
    return this.add('DELETE', p, h)
  }

  match(method: string, path: string): { handler: Handler<Ctx>; params: Record<string, string> } | null {
    const parts = path.split('/').filter(Boolean)
    for (const route of this.routes) {
      if (route.method !== method) continue
      if (route.segments.length !== parts.length) continue
      const params: Record<string, string> = {}
      let ok = true
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i]
        if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(parts[i])
        else if (seg !== parts[i]) {
          ok = false
          break
        }
      }
      if (ok) return { handler: route.handler, params }
    }
    return null
  }
}

/** Parses and size-limits a JSON request body. */
export async function readJson<T>(req: Request, maxBytes = 1_000_000): Promise<T> {
  const raw = await req.text()
  if (raw.length > maxBytes) throw badRequest('Request body too large')
  if (!raw) return {} as T
  try {
    return JSON.parse(raw) as T
  } catch {
    throw badRequest('Request body is not valid JSON')
  }
}
