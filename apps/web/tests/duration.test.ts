import { describe, expect, it } from "vitest"

import { parseIsoDuration } from "@/lib/youtube/client"

describe("parseIsoDuration", () => {
  it("parses hours, minutes, seconds", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723)
  })

  it("parses each unit alone", () => {
    expect(parseIsoDuration("PT45S")).toBe(45)
    expect(parseIsoDuration("PT10M")).toBe(600)
    expect(parseIsoDuration("PT2H")).toBe(7200)
  })

  it("parses mixed partial combos", () => {
    expect(parseIsoDuration("PT1H30S")).toBe(3630)
    expect(parseIsoDuration("PT90M10S")).toBe(5410)
  })

  it("parses day-length live archives", () => {
    expect(parseIsoDuration("P1DT2H")).toBe(93600)
  })

  it("returns 0 for zero or malformed values", () => {
    expect(parseIsoDuration("P0D")).toBe(0)
    expect(parseIsoDuration("")).toBe(0)
    expect(parseIsoDuration("garbage")).toBe(0)
  })
})
