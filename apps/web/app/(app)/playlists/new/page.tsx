import type { Metadata } from "next"

import { AddPlaylistFlow } from "@/components/add-playlist-flow"

export const metadata: Metadata = { title: "Add playlist" }

export default async function NewPlaylistPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>
}) {
  const { url } = await searchParams

  return (
    <div className="py-6">
      <div className="mx-auto mb-8 max-w-2xl">
        <h1 className="text-xl font-semibold">Add a playlist</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Paste a link, see exactly how long it takes, pick a pace you&apos;ll actually keep.
        </p>
      </div>
      <AddPlaylistFlow initialUrl={url} />
    </div>
  )
}
