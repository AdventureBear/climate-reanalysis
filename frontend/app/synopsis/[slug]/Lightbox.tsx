'use client'

// Lightbox for post images (#36): article images show at their chosen size;
// clicking one opens the full-resolution file in an overlay. Click anywhere
// or press Escape to close. Works by listening for clicks on any image
// inside the post body, so the static page needs no per-image wiring.
import { useEffect, useState } from 'react'

export function Lightbox() {
  const [src, setSrc] = useState<string | null>(null)
  const [alt, setAlt] = useState('')

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (target instanceof HTMLImageElement && target.closest('.faq-doc')) {
        e.preventDefault()
        setSrc(target.src)
        setAlt(target.alt)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSrc(null)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  if (!src) return null
  return (
    <div
      className="fixed inset-0 z-[80] flex cursor-zoom-out items-center justify-center bg-black/85 p-4"
      onClick={() => setSrc(null)}
      role="dialog"
      aria-label={alt || 'Full-size image'}
    >
      <img src={src} alt={alt} className="max-h-[92vh] max-w-[95vw] rounded-lg object-contain shadow-2xl" />
    </div>
  )
}
