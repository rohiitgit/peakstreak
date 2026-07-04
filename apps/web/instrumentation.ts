export async function register() {
  // Fail fast at server boot if required environment variables are missing,
  // instead of erroring lazily inside the first request that needs them.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("@/lib/env")
    env()
  }
}
