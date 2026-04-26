/**
 * Extract discrete rules from a plain-English strategy description.
 * Tries numbered/bulleted lines first, falls back to sentence splitting.
 */
export function parseStrategyRules(strategy) {
  if (!strategy?.trim()) return []

  // Try numbered or bulleted lines
  const bulletPattern = /^\s*(?:\d+[.)]\s+|[-*•→►]\s+)/

  const bulletLines = strategy
    .split('\n')
    .filter((l) => bulletPattern.test(l))
    .map((l) => l.replace(bulletPattern, '').trim())
    .filter((l) => l.length > 8 && l.length < 220)

  if (bulletLines.length >= 2) {
    return dedupe(bulletLines).slice(0, 12)
  }

  // Fall back: split on sentence-ending punctuation and colons
  const sentences = strategy
    .split(/[.\n;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12 && s.length < 220)
    // Keep lines that sound like rules
    .filter((s) =>
      /\b(must|only|never|always|require|need|wait|look|use|avoid|enter|exit|confirm|check|ensure|take)\b/i.test(s)
    )

  return dedupe(sentences).slice(0, 10)
}

function dedupe(arr) {
  const seen = new Set()
  return arr.filter((s) => {
    const key = s.toLowerCase().slice(0, 40)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
