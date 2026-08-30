import { useCallback, useEffect, useRef, useState } from 'react'
import { compressImage, imageFromClipboard } from '@/lib/images'
import { Spinner } from './Primitives'

/**
 * Drop / click / paste target for a screenshot.
 *
 * Paste matters more than the other two: the fastest path from CMC to this app
 * is a screen clip straight out of the clipboard, no file ever touching disk.
 * When `pasteAnywhere` is set, a paste landing on the page — not just on this
 * element — is captured.
 */
export function ImageDrop({
  value, onChange, label, hint, pasteAnywhere = false, compact = false,
}: {
  value: string | null
  onChange: (dataUrl: string | null) => void
  label: string
  hint?: string
  pasteAnywhere?: boolean
  compact?: boolean
}) {
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const accept = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return
      if (!file.type.startsWith('image/')) {
        setError('That file is not an image')
        return
      }
      setBusy(true)
      setError(null)
      try {
        onChange(await compressImage(file))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read that image')
      } finally {
        setBusy(false)
      }
    },
    [onChange]
  )

  useEffect(() => {
    if (!pasteAnywhere) return
    const handler = (e: ClipboardEvent) => {
      const file = imageFromClipboard(e)
      if (file) {
        e.preventDefault()
        void accept(file)
      }
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [pasteAnywhere, accept])

  if (value) {
    return (
      <div className="relative border border-ink-700 group bg-ink-950">
        <img
          src={value}
          alt={label}
          className={`w-full object-contain bg-ink-950 ${compact ? 'h-28' : 'h-44'}`}
        />
        <div className="absolute inset-0 bg-ink-950/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} className="btn-ghost btn-sm">
            Replace
          </button>
          <button type="button" onClick={() => onChange(null)} className="btn-danger btn-sm">
            Remove
          </button>
        </div>
        <span className="absolute bottom-1 left-1 bg-ink-950/90 border border-ink-700 text-ink-300 text-2xs px-1.5 py-0.5 uppercase tracking-label">
          {label}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void accept(e.target.files?.[0])}
        />
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void accept(e.dataTransfer.files?.[0])
      }}
      onPaste={(e) => {
        const file = imageFromClipboard(e.nativeEvent)
        if (file) {
          e.preventDefault()
          void accept(file)
        }
      }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      role="button"
      tabIndex={0}
      className={`border border-dashed cursor-pointer transition-colors duration-100
        flex flex-col items-center justify-center text-center
        ${compact ? 'h-28 px-3' : 'h-44 px-4'}
        ${dragging
          ? 'border-brass bg-brass/5'
          : 'border-ink-600 bg-ink-950 hover:border-ink-500 hover:bg-ink-900'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void accept(e.target.files?.[0])}
      />

      {busy ? (
        <div className="flex items-center gap-2 text-ink-300 text-xs">
          <Spinner /> Processing…
        </div>
      ) : (
        <>
          <svg className="w-5 h-5 text-ink-500 mb-2" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25">
            <rect x="2.5" y="4" width="15" height="12" />
            <path d="M2.5 13l4-4 3 3 3.5-4 4.5 5" />
            <circle cx="7" cy="7.5" r="1.25" />
          </svg>
          <div className="text-xs text-ink-200 font-medium">{label}</div>
          <div className="text-2xs text-ink-400 mt-1">
            {hint ?? 'Paste, drop, or click'}
          </div>
          {error && <div className="text-2xs text-down mt-1.5">{error}</div>}
        </>
      )}
    </div>
  )
}
