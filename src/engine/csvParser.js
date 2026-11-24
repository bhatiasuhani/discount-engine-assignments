/**
 * csvParser.js
 *
 * Converts raw CSV text into the typed objects the discount engine expects.
 * Uses papaparse for reliable CSV parsing, then maps column names to the
 * internal data shapes.
 *
 * Expected rules.csv columns:
 *   rule_id, scope, applies_to, type, value, stackable
 *
 * Expected cart.csv columns:
 *   item_id, product, brand, platform, base_price
 */

import Papa from 'papaparse'
import { validateRule } from './ruleValidator.js'
import { validateCartItem } from './cartValidator.js'

/**
 * Parses the raw text of rules.csv into an array of DiscountRule objects.
 * Returns { data, errors } where errors is an array of row-level issues.
 */
export function parseRulesCSV(csvText) {
  const { data: rows, errors: parseErrors } = Papa.parse(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  if (parseErrors.length > 0) {
    return { data: [], errors: parseErrors.map((e) => e.message) }
  }

  const data = []
  const errors = []

  rows.forEach((row, i) => {
    const { rule, errors: rowErrors } = validateRule({
      ruleId: row.rule_id,
      scope: row.scope,
      appliesTo: row.applies_to,
      type: row.type,
      value: row.value,
      stackable: row.stackable,
      minCartValue: row.min_cart_value,
    })
    if (rule) data.push(rule)
    else errors.push(`Row ${i + 2}: ${rowErrors.join('; ')}`)
  })

  return { data, errors }
}

/**
 * Parses the raw text of cart.csv into an array of CartItem objects.
 * Returns { data, errors } where errors is an array of row-level issues.
 */
export function parseCartCSV(csvText) {
  const { data: rows, errors: parseErrors } = Papa.parse(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  if (parseErrors.length > 0) {
    return { data: [], errors: parseErrors.map((e) => e.message) }
  }

  const data = []
  const errors = []

  rows.forEach((row, i) => {
    const { item, errors: rowErrors } = validateCartItem({
      itemId: row.item_id,
      product: row.product,
      brand: row.brand,
      platform: row.platform,
      basePrice: row.base_price,
    })
    if (item) data.push(item)
    else errors.push(`Row ${i + 2}: ${rowErrors.join('; ')}`)
  })

  return { data, errors }
}
