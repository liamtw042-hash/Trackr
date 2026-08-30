import { RULES, ruleScore, type RuleKey, type RuleState } from '@/types'

/**
 * The five rules, each answerable yes / no / unanswered.
 *
 * Leaving a rule blank is a first-class option. The alternative — a checkbox
 * that is either ticked or not — conflates "I broke this rule" with "I haven't
 * filled this in yet", and that ambiguity would quietly destroy the
 * rule-adherence-versus-outcome analysis this whole feature exists to support.
 */
export function RulesChecklist({
  value, onChange, disabled = false,
}: {
  value: RuleState
  onChange: (next: RuleState) => void
  disabled?: boolean
}) {
  const score = ruleScore(value)

  const set = (key: RuleKey, v: boolean | null) => {
    onChange({ ...value, [key]: value[key] === v ? null : v })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="label mb-0">Rules</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              const allYes = RULES.every((r) => value[r.key] === true)
              const next = { ...value }
              for (const r of RULES) next[r.key] = allYes ? null : true
              onChange(next)
            }}
            className="text-2xs text-ink-400 hover:text-azure-bright transition-colors"
          >
            {RULES.every((r) => value[r.key] === true) ? 'Clear all' : 'All followed'}
          </button>
          <span
            className={`font-mono text-2xs ${
              score.broken.length ? 'text-down' : score.complete ? 'text-up' : 'text-ink-400'
            }`}
          >
            {score.followed}/{RULES.length}
          </span>
        </div>
      </div>

      <div className="surface divide-y divide-ink-800 overflow-hidden">
        {RULES.map((rule) => {
          const state = value[rule.key]
          return (
            <div
              key={rule.key}
              className={`flex items-center gap-3 px-3 py-2.5 transition-colors
                ${state === false ? 'bg-down-wash' : state === true ? 'bg-up-wash' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs text-ink-100 leading-tight">{rule.label}</div>
                <div className="text-2xs text-ink-400 leading-snug mt-0.5">{rule.detail}</div>
              </div>

              <div className="flex bg-ink-750 rounded p-0.5 gap-0.5 shrink-0">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => set(rule.key, true)}
                  aria-pressed={state === true}
                  aria-label={`${rule.label}: followed`}
                  className={`px-2.5 py-1 text-2xs font-medium rounded-sm transition-colors
                    ${state === true
                      ? 'bg-up/20 text-up'
                      : 'text-ink-500 hover:text-ink-200 hover:bg-ink-800'}`}
                >
                  YES
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => set(rule.key, false)}
                  aria-pressed={state === false}
                  aria-label={`${rule.label}: broken`}
                  className={`px-2.5 py-1 text-2xs font-medium rounded-sm transition-colors
                    ${state === false
                      ? 'bg-down/20 text-down'
                      : 'text-ink-500 hover:text-ink-200 hover:bg-ink-800'}`}
                >
                  NO
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {!score.complete && (
        <p className="hint mt-1.5">
          {RULES.length - score.answered} unanswered — left blank rather than assumed, so the
          rule-versus-outcome numbers stay honest.
        </p>
      )}
    </div>
  )
}

/** Compact read-only rendering for the trade list and detail header. */
export function RulesBadge({ rules }: { rules: RuleState }) {
  const score = ruleScore(rules)
  if (score.answered === 0) {
    return <span className="text-2xs text-ink-500 font-mono" title="Rules not recorded">—</span>
  }
  return (
    <span
      className="inline-flex items-center gap-0.5"
      title={
        score.broken.length
          ? `Broke: ${score.broken.map((k) => RULES.find((r) => r.key === k)?.label).join(', ')}`
          : 'All answered rules followed'
      }
    >
      {RULES.map((r) => {
        const v = rules[r.key]
        return (
          <span
            key={r.key}
            className={`w-1 h-3 ${
              v === true ? 'bg-up' : v === false ? 'bg-down' : 'bg-ink-700'
            }`}
          />
        )
      })}
    </span>
  )
}
