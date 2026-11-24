/**
 * cartValidator.js
 *
 * Single source of truth for what a valid CartItem is.
 * Used by the CSV cart input and the PDF cart input.
 */

/** "Rs.1,299" / "₹1,299" / "1299" -> 1299. Returns NaN if it isn't a clean number. */
export function parsePrice(value) {
  const cleaned = String(value ?? '').replace(/rs\.?|₹|inr|,|\s/gi, '')
  return cleaned === '' ? NaN : Number(cleaned)
}

export function validateCartItem(raw) {
  const errors = []
  const product = String(raw.product ?? '').trim()
  const brand = String(raw.brand ?? '').trim()
  const platform = String(raw.platform ?? '').trim()
  const itemId = String(raw.itemId ?? '').trim()
  const price = parsePrice(raw.basePrice)

  const missing = []
  if (!itemId) missing.push('item_id')
  if (!product) missing.push('product')
  if (!brand) missing.push('brand')
  if (!platform) missing.push('platform')
  if (raw.basePrice === undefined || String(raw.basePrice).trim() === '') missing.push('base_price')
  if (missing.length) errors.push(`missing ${missing.join(', ')}`)

  if (!missing.includes('base_price') && (!Number.isFinite(price) || price <= 0)) {
    errors.push(`base price must be a positive number, got "${String(raw.basePrice).trim()}"`)
  }

  if (errors.length) return { item: null, errors }
  return {
    item: { itemId, product, brand, platform, basePrice: Math.round(price) },
    errors: [],
  }
}
