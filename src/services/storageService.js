// ─── Image compression ────────────────────────────────────────────────────────

export async function compressImageFile(file, maxWidth = 1280, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const ratio = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * ratio)
      canvas.height = Math.round(img.height * ratio)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')) }
    img.src = url
  })
}

// ─── Cloudinary upload ────────────────────────────────────────────────────────

function getCloudinaryConfig() {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

  console.log('[Cloudinary] Config check:', {
    cloudName: cloudName || '⚠️ MISSING VITE_CLOUDINARY_CLOUD_NAME',
    uploadPreset: uploadPreset || '⚠️ MISSING VITE_CLOUDINARY_UPLOAD_PRESET',
  })

  if (!cloudName || !uploadPreset) {
    throw new Error(
      'Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in your .env file.'
    )
  }

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`
  console.log('[Cloudinary] Upload URL:', url)
  return { cloudName, uploadPreset, url }
}

function withTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Upload timed out after ${ms / 1000}s`)), ms)
    ),
  ])
}

/**
 * Upload a compressed JPEG data URL to Cloudinary via unsigned upload.
 * Returns the secure_url on success, or null on failure/timeout.
 * Callers should check for null and show a warning — never block the trade save.
 */
export async function uploadScreenshot(userId, tradeId, dataUrl, type = 'entry') {
  console.log(`[Cloudinary] Starting ${type} screenshot upload for trade ${tradeId}`)

  let config
  try {
    config = getCloudinaryConfig()
  } catch (err) {
    console.error('[Cloudinary] Config error:', err.message)
    return null
  }

  try {
    const folder = `trackr/${userId}`
    const publicId = `${tradeId}_${type}_${Date.now()}`

    const formData = new FormData()
    formData.append('file', dataUrl)                  // Cloudinary accepts base64 data URIs
    formData.append('upload_preset', config.uploadPreset)
    formData.append('folder', folder)
    formData.append('public_id', publicId)

    console.log(`[Cloudinary] POSTing to ${config.url} — folder: ${folder}, public_id: ${publicId}`)

    const response = await withTimeout(
      fetch(config.url, { method: 'POST', body: formData }),
      10000
    )

    console.log(`[Cloudinary] Response status: ${response.status} ${response.statusText}`)

    const data = await response.json()

    if (!response.ok) {
      console.error('[Cloudinary] Upload error response:', data)
      throw new Error(data?.error?.message ?? `HTTP ${response.status}`)
    }

    console.log(`[Cloudinary] Upload success — secure_url: ${data.secure_url}`)
    return data.secure_url
  } catch (err) {
    console.error(`[Cloudinary] ${type} upload failed:`, err.message)
    return null
  }
}
