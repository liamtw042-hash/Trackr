// ─────────────────────────────────────────────────────────────────────────────
// Screenshot handling: compress in the browser, then push to Cloudinary via an
// unsigned upload preset (carried over from the previous build).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Downscale and re-encode to JPEG. Chart screenshots come off a 4K monitor at
 * several megabytes; 1600px wide is plenty for the vision model to read price
 * labels and keeps the upload fast.
 */
export function compressImage(file: File, maxWidth = 1600, quality = 0.86): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      try {
        const scale = Math.min(1, maxWidth / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)

        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas not available')
        // Charts are mostly flat colour on a dark ground; a white matte behind
        // any transparency keeps text from turning into black-on-black.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Image compression failed'))
      } finally {
        URL.revokeObjectURL(url)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image file'))
    }

    img.src = url
  })
}

export function cloudinaryConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_CLOUDINARY_CLOUD_NAME && import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  )
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Upload timed out after ${ms / 1000}s`)), ms)
    ),
  ])
}

/**
 * Upload a compressed data URL. Returns the hosted URL, or null on any failure.
 *
 * Callers must treat null as non-fatal: a screenshot that fails to upload must
 * never block the trade from being saved. Losing the image is recoverable;
 * losing the trade you just closed is not.
 */
export async function uploadImage(
  userId: string,
  kind: 'entry' | 'exit' | 'ticket',
  dataUrl: string
): Promise<string | null> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  if (!cloudName || !preset) {
    console.warn('[cloudinary] not configured — screenshot not uploaded')
    return null
  }

  try {
    const body = new FormData()
    body.append('file', dataUrl)
    body.append('upload_preset', preset)
    // Deliberately still "trackr" after the rename. Every screenshot already
    // uploaded lives under this folder, and changing it would split the media
    // library in two for no benefit — the stored URLs are absolute either way.
    body.append('folder', `trackr/${userId}/${kind}`)

    const res = await withTimeout(
      fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body,
      }),
      20000
    )

    const data = await res.json()
    if (!res.ok) {
      console.error('[cloudinary] upload rejected:', data?.error?.message ?? res.status)
      return null
    }
    return typeof data.secure_url === 'string' ? data.secure_url : null
  } catch (err) {
    console.error('[cloudinary] upload failed:', err)
    return null
  }
}

/** Read a pasted or dropped file straight to a data URL, no re-encoding. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

/** Pull the first image off a clipboard paste event, if there is one. */
export function imageFromClipboard(e: ClipboardEvent): File | null {
  const items = e.clipboardData?.items
  if (!items) return null
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return null
}
