import { ref, uploadString, getDownloadURL } from 'firebase/storage'
import { storage } from '../firebase/config'

/**
 * Compress an image File to a JPEG data URL.
 */
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

/**
 * Upload a base64 data URL to Firebase Storage.
 * Returns the download URL.
 */
export async function uploadScreenshot(userId, tradeId, dataUrl, type = 'entry') {
  try {
    const path = `screenshots/${userId}/${tradeId}_${type}_${Date.now()}.jpg`
    const storageRef = ref(storage, path)
    await uploadString(storageRef, dataUrl, 'data_url')
    return await getDownloadURL(storageRef)
  } catch (err) {
    console.warn('Storage upload failed, using base64:', err.message)
    // Fall back to the data URL itself so the image still displays
    return dataUrl
  }
}
