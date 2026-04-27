/**
 * Extract discrete rules from a plain-English strategy description.
 * Priority: numbered/bulleted lines → sentence split → conjunction split.
 */
export function parseStrategyRules(strategy) {
  if (!strategy?.trim()) return []

  // 1. Numbered or bulleted lines (e.g. "1. Only trade London session")
  const bulletPattern = /^\s*(?:\d+[.)]\s+|[-*•→►]\s+)/
  const bulletLines = strategy
    .split('\n')
    .filter((l) => bulletPattern.test(l))
    .map((l) => l.replace(bulletPattern, '').trim())
    .filter((l) => l.length > 5 && l.length < 220)

  if (bulletLines.length >= 2) return dedupe(bulletLines).slice(0, 12)

  // 2. Split on sentence-ending punctuation AND aggressive conjunction splitting
  const chunks = strategy
    // Treat newlines as sentence boundaries
    .replace(/\n+/g, '. ')
    // Split on sentence ends, semicolons, and "and/then/also/plus" used as list connectors
    .split(/[.!?;]|\s+[-–]\s+|(?:,\s*(?:and|then|also|plus|additionally|furthermore)\s+)/i)
    .flatMap((chunk) =>
      // Further split remaining commas followed by action words
      chunk.split(/,\s*(?=(?:only|never|always|wait|look|use|avoid|enter|exit|confirm|check|take|set|move|trail|target|risk|watch|ensure|require|need)\b)/i)
    )
    .map((s) => s.replace(/^[\s,]+|[\s,]+$/g, '').trim())
    // Remove fragments that are too short or too long
    .filter((s) => s.length > 8 && s.length < 220)
    // Drop lines that are clearly incomplete fragments (no verb-like word)
    .filter((s) => /\w{3,}/.test(s))

  return dedupe(chunks).slice(0, 12)
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
