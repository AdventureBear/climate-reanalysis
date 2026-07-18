'use client'

// Shared bits for the Synopsis editor pages (#36).
export function statusOf(p: { published: boolean; publish_at: string | null }): 'published' | 'scheduled' | 'draft' {
  if (p.published) return 'published'
  if (p.publish_at) return 'scheduled'
  return 'draft'
}

export function EditorGate({ msg }: { msg: string }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-[#16224a] py-24">
      <p className="text-slate-400">{msg}</p>
    </div>
  )
}
