// Downscale a rendered map PNG into a small thumbnail blob, entirely client-side
// (the full-res PNG is already on screen after a render, so no backend call).

const THUMB_MAX_WIDTH = 480

export async function makeThumbnailBlob(fullPng: Blob, maxWidth = THUMB_MAX_WIDTH): Promise<Blob> {
  const bitmap = await createImageBitmap(fullPng)
  try {
    const scale = Math.min(1, maxWidth / bitmap.width)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D canvas context for thumbnail')
    ctx.drawImage(bitmap, 0, 0, width, height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('Thumbnail encoding failed'))),
        'image/png',
      )
    })
  } finally {
    bitmap.close()
  }
}

// Fetch the currently displayed map (a blob: URL) back into a Blob so it can be
// uploaded as the stored full-resolution image.
export async function blobFromObjectUrl(objectUrl: string): Promise<Blob> {
  const res = await fetch(objectUrl)
  if (!res.ok) throw new Error(`Could not read rendered map image (HTTP ${res.status})`)
  return await res.blob()
}
