import Link from "next/link"
import { redirect } from "next/navigation"

import { Button } from "@workspace/ui/components/button"

import { auth } from "@/lib/auth"
import { UserMenu } from "@/components/user-menu"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  return (
    <div className="min-h-svh">
      <header className="border-border bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/dashboard" className="text-base font-semibold tracking-tight">
            Peak<span className="text-primary">Streak</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button size="sm" render={<Link href="/playlists/new" />}>
              Add playlist
            </Button>
            <UserMenu
              name={session.user.name ?? null}
              email={session.user.email ?? null}
              image={session.user.image ?? null}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
