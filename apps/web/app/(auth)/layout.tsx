import Link from "next/link"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center text-lg font-semibold tracking-tight">
          Peak<span className="text-primary">Streak</span>
        </Link>
        <div className="bg-card border-border rounded-xl border p-6">{children}</div>
      </div>
    </div>
  )
}
