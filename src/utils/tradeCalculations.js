/**
 * Calculate P&L based on trade direction and prices.
 * Works for any asset class — uses raw price difference × position size.
 */
export function calcPnL({ direction, entryPrice, exitPrice, positionSize }) {
  const entry = parseFloat(entryPrice)
  const exit = parseFloat(exitPrice)
  const size = parseFloat(positionSize)
  if (isNaN(entry) || isNaN(exit) || isNaN(size) || size <= 0) return null
  const diff = direction === 'long' ? exit - entry : entry - exit
  return parseFloat((diff * size).toFixed(2))
}

/**
 * Calculate R multiple: how many R's gained or lost.
 */
export function calcRMultiple({ pnl, riskAmount }) {
  const risk = parseFloat(riskAmount)
  if (isNaN(pnl) || isNaN(risk) || risk <= 0) return null
  return parseFloat((pnl / risk).toFixed(2))
}

/**
 * Calculate risk amount from account balance and risk %.
 */
export function calcRiskAmount(accountBalance, riskPercent) {
  const bal = parseFloat(accountBalance)
  const pct = parseFloat(riskPercent)
  if (isNaN(bal) || isNaN(pct)) return ''
  return parseFloat((bal * pct / 100).toFixed(2))
}

/**
 * Calculate risk % from account balance and risk amount.
 */
export function calcRiskPercent(accountBalance, riskAmount) {
  const bal = parseFloat(accountBalance)
  const amt = parseFloat(riskAmount)
  if (isNaN(bal) || isNaN(amt) || bal <= 0) return ''
  return parseFloat((amt / bal * 100).toFixed(2))
}

/**
 * Estimate position size from risk amount and stop loss distance.
 */
export function calcPositionSize({ riskAmount, entryPrice, stopLoss, direction }) {
  const risk = parseFloat(riskAmount)
  const entry = parseFloat(entryPrice)
  const sl = parseFloat(stopLoss)
  if (isNaN(risk) || isNaN(entry) || isNaN(sl) || risk <= 0) return ''
  const dist = direction === 'long' ? entry - sl : sl - entry
  if (dist <= 0) return ''
  return parseFloat((risk / dist).toFixed(4))
}

/**
 * Determine trade outcome from prices.
 */
export function inferOutcome({ pnl }) {
  if (pnl == null) return ''
  if (pnl > 0) return 'win'
  if (pnl < 0) return 'loss'
  return 'breakeven'
}
