/**
 * Extract discrete rules from a plain-English strategy description.
 * Handles: numbered/bulleted lists, punctuated prose, and unpunctuated
 * run-on sentences that use conjunctions as connectors.
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

  // 2. Split on sentence-ending punctuation and semicolons
  const bySentence = strategy
    .split(/[.!?;]\s*|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5)

  // For each sentence, also split on conjunction connectors
  const chunks = bySentence
    .flatMap(splitOnConjunctions)
    .map((s) => {
      s = s.trim().replace(/^,\s*/, '')
      // Capitalise first letter
      return s.charAt(0).toUpperCase() + s.slice(1)
    })
    .filter((s) => s.length > 8 && s.length < 220)

  return dedupe(chunks).slice(0, 12)
}

/**
 * Split a single sentence on conjunction words that indicate new independent rules.
 * Splits on: "and then", ", and", "and I/my/we/the", bare "and" between long clauses.
 */
function splitOnConjunctions(text) {
  // Step 1: strong connectors that almost always separate independent clauses
  const step1 = text
    .split(/\s+and then\s+|\s+then\s+(?=[A-Za-z])/i)
    .flatMap((s) => s.split(/\s+also\s+(?=[A-Za-z])/i))
    .flatMap((s) => s.split(/,\s*(?:and|but|then|also|plus|however|additionally)\s+/i))

  // Step 2: split on bare "and" between sufficiently long clauses (likely independent)
  const step2 = step1.flatMap((s) => {
    const parts = s.split(/\s+and\s+/i)
    if (parts.length <= 1) return [s]

    const merged = []
    let acc = parts[0]
    for (let i = 1; i < parts.length; i++) {
      const next = parts[i]
      // Merge if either side is a short phrase (< 18 chars) — probably a compound noun
      if (acc.trim().length < 18 || next.trim().length < 14) {
        acc = acc + ' and ' + next
      } else {
        merged.push(acc.trim())
        acc = next
      }
    }
    merged.push(acc.trim())
    return merged
  })

  return step2
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
