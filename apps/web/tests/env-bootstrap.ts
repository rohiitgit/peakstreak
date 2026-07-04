/**
 * Points lib/env at the throwaway test database BEFORE lib/db loads.
 * Must be the first import of every integration test (static imports
 * execute in source order, and this module imports nothing).
 */
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://localhost:5432/peakstreak_test"
process.env.AUTH_SECRET ??= "test-secret"
process.env.YOUTUBE_API_KEY ??= "test-key"

export {}
