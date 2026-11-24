/**
 * ruleValidator.js
 *
 * Single source of truth for what a valid DiscountRule is.
 * Every input mode (CSV, LLM, future ones) passes raw data through here,
 * so the engine only ever sees clean, typed rules.
 */
export function validateRule(raw) {
  const errors = []
  const scope = String(raw.scope ?? '').trim().toLowerCase()
  const type = String(raw.type ?? '').trim().toLowerCase()
  const value = Number(raw.value)
  const appliesTo = String(raw.appliesTo ?? '').trim()
  const hasMin = raw.minCartValue !== '' && raw.minCartValue != null
  const minCartValue = hasMin ? Number(raw.minCartValue) : null

  if (!['brand', 'platform', 'cart'].includes(scope))
    errors.push(`scope must be brand, platform or cart (got "${raw.scope}")`)
  if (!['percentage', 'flat'].includes(type))
    errors.push(`type must be percentage or flat (got "${raw.type}")`)
  if (!Number.isFinite(value) || value <= 0)
    errors.push(`value must be a positive number (got "${raw.value}")`)
  if (type === 'percentage' && value > 100)
    errors.push('percentage cannot be more than 100')
  if (scope !== 'cart' && !appliesTo)
    errors.push('applies_to is required for brand/platform rules')
  if (scope === 'cart' && (!Number.isFinite(minCartValue) || minCartValue < 0))
    errors.push('cart rules need a valid min_cart_value')

  if (errors.length > 0) return { rule: null, errors }

  return {
    rule: {
      ruleId: String(raw.ruleId ?? '').trim(),
      scope,
      appliesTo: scope === 'cart' ? 'Entire cart' : appliesTo,
      type,
      value,
      stackable:
        raw.stackable === true ||
        ['true', '1', 'yes'].includes(String(raw.stackable ?? '').trim().toLowerCase()),
      minCartValue: scope === 'cart' ? minCartValue : null,
    },
    errors: [],
  }
}
