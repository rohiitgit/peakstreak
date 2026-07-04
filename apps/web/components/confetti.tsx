"use client"

const COLORS = ["#5e6ad2", "#828fff", "#27a644", "#d4a72c", "#f7f8f8"]
const PIECES = 60

// Deterministic layout (no Math.random) — safe to compute during render
// on both server and client without hydration mismatch.
const pieces = Array.from({ length: PIECES }, (_, i) => ({
  left: (i * 97) % 100,
  delay: ((i * 37) % 20) / 10,
  duration: 2.5 + ((i * 53) % 20) / 10,
  color: COLORS[i % COLORS.length]!,
  size: 5 + ((i * 29) % 6),
  drift: ((i * 41) % 80) - 40,
}))

/** Lightweight CSS confetti — no library, one-shot on mount. */
export function Confetti() {

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <style>{`
        @keyframes ps-confetti-fall {
          0% { transform: translate3d(0, -5vh, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate3d(var(--drift), 105vh, 0) rotate(720deg); opacity: 0.6; }
        }
      `}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: 0,
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.45,
            background: p.color,
            borderRadius: 1,
            animation: `ps-confetti-fall ${p.duration}s ${p.delay}s cubic-bezier(0.25,0.46,0.45,0.94) forwards`,
            ["--drift" as string]: `${p.drift}px`,
          }}
        />
      ))}
    </div>
  )
}
