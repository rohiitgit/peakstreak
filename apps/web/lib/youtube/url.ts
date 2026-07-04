/**
 * Playlist URL parsing. Accepted inputs:
 *   - https://www.youtube.com/playlist?list=PLxxx
 *   - https://www.youtube.com/watch?v=abc&list=PLxxx (any watch URL with list=)
 *   - https://youtu.be/abc?list=PLxxx
 *   - https://m.youtube.com/... and music.youtube.com/... variants
 *   - a bare playlist ID (PLxxx, UUxxx, OLxxx, FLxxx, …)
 */

// IDs are base64ish; real playlist IDs are 13–42 chars with known prefixes,
// but we stay permissive on length and let the API be the final judge.
const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{10,64}$/

const KNOWN_PREFIXES = ["PL", "UU", "FL", "OL", "RD", "LL", "WL"]

export function isLikelyPlaylistId(value: string): boolean {
  return (
    PLAYLIST_ID_RE.test(value) &&
    (KNOWN_PREFIXES.some((p) => value.startsWith(p)) || value.length >= 24)
  )
}

/**
 * Extracts a YouTube playlist ID from a URL or bare ID.
 * Returns null when the input can't be a playlist reference.
 */
export function parsePlaylistInput(raw: string): string | null {
  const input = raw.trim()
  if (!input) return null

  // Bare ID (no URL structure at all)
  if (!input.includes("/") && !input.includes("?") && !input.includes(".")) {
    return isLikelyPlaylistId(input) ? input : null
  }

  let url: URL
  try {
    // Tolerate missing protocol ("youtube.com/playlist?list=…")
    url = new URL(input.includes("://") ? input : `https://${input}`)
  } catch {
    return null
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  const allowedHosts = ["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]
  if (!allowedHosts.includes(host)) return null

  const list = url.searchParams.get("list")
  if (!list || !PLAYLIST_ID_RE.test(list)) return null
  return list
}
