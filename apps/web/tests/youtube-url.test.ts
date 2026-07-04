import { describe, expect, it } from "vitest"

import { parsePlaylistInput } from "@/lib/youtube/url"

const PL = "PLWKjhJtqVAbnZtkAI3BqcYxKnfWn_C704"

describe("parsePlaylistInput", () => {
  it("parses a canonical playlist URL", () => {
    expect(parsePlaylistInput(`https://www.youtube.com/playlist?list=${PL}`)).toBe(PL)
  })

  it("parses a watch URL containing &list=", () => {
    expect(parsePlaylistInput(`https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${PL}&index=3`)).toBe(PL)
  })

  it("parses youtu.be short links with a list param", () => {
    expect(parsePlaylistInput(`https://youtu.be/dQw4w9WgXcQ?list=${PL}`)).toBe(PL)
  })

  it("parses mobile and music subdomains", () => {
    expect(parsePlaylistInput(`https://m.youtube.com/playlist?list=${PL}`)).toBe(PL)
    expect(parsePlaylistInput(`https://music.youtube.com/playlist?list=${PL}`)).toBe(PL)
  })

  it("tolerates a missing protocol", () => {
    expect(parsePlaylistInput(`youtube.com/playlist?list=${PL}`)).toBe(PL)
  })

  it("accepts a bare playlist ID", () => {
    expect(parsePlaylistInput(PL)).toBe(PL)
    expect(parsePlaylistInput("UUxxxxxxxxxxxxxxxxxxxxxx")).toBe("UUxxxxxxxxxxxxxxxxxxxxxx")
  })

  it("trims surrounding whitespace", () => {
    expect(parsePlaylistInput(`  https://www.youtube.com/playlist?list=${PL}  `)).toBe(PL)
  })

  it("rejects non-YouTube hosts", () => {
    expect(parsePlaylistInput(`https://evil.com/playlist?list=${PL}`)).toBeNull()
    expect(parsePlaylistInput(`https://notyoutube.com/watch?list=${PL}`)).toBeNull()
  })

  it("rejects URLs without a list param", () => {
    expect(parsePlaylistInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull()
  })

  it("rejects garbage input", () => {
    expect(parsePlaylistInput("")).toBeNull()
    expect(parsePlaylistInput("   ")).toBeNull()
    expect(parsePlaylistInput("hello world")).toBeNull()
    expect(parsePlaylistInput("http://[malformed")).toBeNull()
    expect(parsePlaylistInput("short")).toBeNull()
  })
})
