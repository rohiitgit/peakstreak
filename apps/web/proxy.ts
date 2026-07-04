import { getToken } from "next-auth/jwt"
import { NextResponse, type NextRequest } from "next/server"

const PUBLIC_PAGES = new Set(["/", "/login", "/signup", "/forgot-password", "/privacy"])

// These API routes carry their own auth (cron secret, unsubscribe token)
// or are intentionally public (health, auth handshake, anonymous preview).
const PUBLIC_API_PREFIXES = [
  "/api/auth",
  "/api/health",
  "/api/cron",
  "/api/email",
  "/api/playlists/preview",
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApi = pathname.startsWith("/api")

  if (isApi && PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }
  if (!isApi && PUBLIC_PAGES.has(pathname)) {
    return NextResponse.next()
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production",
  })
  if (token) {
    return NextResponse.next()
  }

  if (isApi) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const login = new URL("/login", request.url)
  login.searchParams.set("callbackUrl", pathname + request.nextUrl.search)
  return NextResponse.redirect(login)
}

export const config = {
  // Everything except Next internals and static assets (paths with a dot).
  matcher: ["/((?!_next|.*\\..*).*)"],
}
