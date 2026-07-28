'use client'

// Lightbox for scoped image groups. Synopsis posts use regular images;
// generated package results use explicit data-lightbox-src triggers.
import { useEffect, useState } from 'react'

type LightboxProps = {
  rootSelector?: string
}

export function Lightbox({ rootSelector = '.faq-doc' }: LightboxProps) {
  const [src, setSrc] = useState<string | null>(null)
  const [alt, setAlt] = useState('')

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      const trigger = target.closest<HTMLElement>('[data-lightbox-src]')
      const image = target instanceof HTMLImageElement ? target : null
      if (!target.closest(rootSelector)) return
      if (trigger) {
        e.preventDefault()
        const nextSrc = trigger.dataset.lightboxSrc
        if (!nextSrc) return
        setSrc(nextSrc)
        setAlt(trigger.dataset.lightboxAlt || '')
      } else if (image) {
        e.preventDefault()
        setSrc(image.src)
        setAlt(image.alt)
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
  }, [rootSelector])

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
