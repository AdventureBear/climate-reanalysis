'use client'

// Admin-only editor shortcuts on the public Synopsis pages. Static pages are
// baked identically for everyone; this renders nothing unless the signed-in
// visitor is an admin. Label is deliberately just "Edit" / "Editor".
import Link from 'next/link'
import { useAuth } from '../auth/authContext'

export function EditorLink({ postId }: { postId?: string }) {
  const { enabled, user, isAdmin } = useAuth()
  if (!enabled || !user || !isAdmin) return null
  const href = postId ? `/admin/post/?id=${postId}` : '/admin/posts/'
  return (
    <Link href={href}
      className="rounded-md border border-slate-600/70 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-700/60">
      {postId ? 'Edit' : 'Editor'}
    </Link>
  )
}
