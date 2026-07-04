import type { Metadata } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"

import "@workspace/ui/globals.css"
import { Toaster } from "@workspace/ui/components/sonner"
import { cn } from "@workspace/ui/lib/utils"

import { ThemeProvider } from "@/components/theme-provider"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: {
    default: "PeakStreak",
    template: "%s · PeakStreak",
  },
  description:
    "Paste a YouTube playlist. See exactly how long it takes. Actually finish it.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", inter.variable)}
    >
      <body>
        {/* Dark-only in v1 per DESIGN.md — no light theme exists yet. */}
        <ThemeProvider forcedTheme="dark">
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
