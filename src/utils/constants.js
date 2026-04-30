export const MISTAKES = [
  { value: '', label: 'None — No mistake' },
  { value: 'revenge_trade', label: 'Revenge Trade' },
  { value: 'moved_stop_loss', label: 'Moved Stop Loss' },
  { value: 'entered_too_early', label: 'Entered Too Early' },
  { value: 'entered_too_late', label: 'Entered Too Late' },
  { value: 'no_clear_setup', label: 'No Clear Setup' },
  { value: 'overtraded', label: 'Overtraded' },
  { value: 'ignored_rules', label: 'Ignored Rules' },
  { value: 'chased_price', label: 'Chased Price' },
  { value: 'other', label: 'Other' },
]

export const MISTAKE_LABELS = Object.fromEntries(MISTAKES.map((m) => [m.value, m.label]))
