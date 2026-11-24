/**
 * nlRuleInput.js
 *
 * Input adapter: plain-English text  ->  validated DiscountRule.
 *
 * Flow: text -> /api/parse-rule (LLM) -> interpretLlmResponse() -> validateRule()
 * The LLM output is treated as untrusted: it goes through the SAME validator
 * as CSV rows, so the engine never sees a rule the CSV path would reject.
 */
import { validateRule } from '../engine/ruleValidator.js'

/** Next free id: RULE-05 if RULE-01..04 exist. */
export function nextRuleId(rules) {
  const nums = rules
    .map((r) => parseInt(String(r.ruleId).replace(/\D/g, ''), 10))
    .filter(Number.isFinite)
  const next = (nums.length ? Math.max(...nums) : 0) + 1
  return `RULE-${String(next).padStart(2, '0')}`
}

/**
 * Pure function (no network) so it can be tested on its own.
 * Returns one of:
 *   { kind: 'ok', rule, warnings }
 *   { kind: 'unresolvable', message }
 *   { kind: 'invalid', message, errors }
 */
export function interpretLlmResponse(payload, { rules = [], cartItems = [] } = {}) {
  if (!payload || typeof payload !== 'object') {
    return { kind: 'invalid', message: 'The AI response was empty or unreadable.', errors: [] }
  }

  if (payload.status === 'unresolvable') {
    const missing = Array.isArray(payload.missing) && payload.missing.length
      ? ` Missing: ${payload.missing.join(', ')}.`
      : ''
    return {
      kind: 'unresolvable',
      message: `${payload.reason || 'That description is too vague to turn into a rule.'}${missing} Try something like "15% off on Flipkart" or "10% off if cart is over Rs.5,000".`,
    }
  }

  if (payload.status !== 'ok' || !payload.rule) {
    return { kind: 'invalid', message: 'The AI response was not in the expected format.', errors: [] }
  }

  const { rule, errors } = validateRule({ ...payload.rule, ruleId: nextRuleId(rules) })
  if (!rule) {
    return { kind: 'invalid', message: 'The AI produced a rule that failed validation, so it was not added.', errors }
  }

  // Soft checks: allowed, but the user should know before confirming.
  const warnings = []
  if (rule.scope === 'brand' && cartItems.length &&
      !cartItems.some((i) => i.brand.toLowerCase() === rule.appliesTo.toLowerCase())) {
    warnings.push(`No item in the current cart is from brand "${rule.appliesTo}", so this rule won't change any price yet.`)
  }
  if (rule.scope === 'platform' && cartItems.length &&
      !cartItems.some((i) => i.platform.toLowerCase() === rule.appliesTo.toLowerCase())) {
    warnings.push(`No item in the current cart is on "${rule.appliesTo}", so this rule won't change any price yet.`)
  }
  if (rule.type === 'percentage' && rule.value >= 50) {
    warnings.push(`${rule.value}% is an unusually large discount. Double-check before confirming.`)
  }

  return { kind: 'ok', rule: { ...rule, source: 'natural-language' }, warnings }
}

/** Calls the serverless function and interprets the result. */
export async function parseRuleFromText(text, context) {
  const known = {
    brands: [...new Set([
      ...context.cartItems.map((i) => i.brand),
      ...context.rules.filter((r) => r.scope === 'brand').map((r) => r.appliesTo),
    ])],
    platforms: [...new Set([
      ...context.cartItems.map((i) => i.platform),
      ...context.rules.filter((r) => r.scope === 'platform').map((r) => r.appliesTo),
    ])],
  }

  let res
  try {
    res = await fetch('/api/parse-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, known }),
    })
  } catch {
    return { kind: 'invalid', message: 'Network error: could not reach the rule parser.', errors: [] }
  }

  let payload
  try {
    payload = await res.json()
  } catch {
    return { kind: 'invalid', message: `The rule parser returned an unreadable response (HTTP ${res.status}).`, errors: [] }
  }

  if (!res.ok) {
    return { kind: 'invalid', message: payload.error || `Request failed (HTTP ${res.status}).`, errors: [] }
  }

  return interpretLlmResponse(payload, context)
}

/** Human-readable summary used in the confirmation card. */
export function describeRule(rule) {
  const parts = [
    `scope: ${rule.scope[0].toUpperCase() + rule.scope.slice(1)}`,
  ]
  if (rule.scope !== 'cart') parts.push(`applies to: ${rule.appliesTo}`)
  parts.push(`type: ${rule.type === 'percentage' ? 'Percentage' : 'Flat'}`)
  parts.push(`value: ${rule.type === 'percentage' ? `${rule.value}%` : `Rs.${rule.value.toLocaleString('en-IN')}`}`)
  if (rule.scope === 'cart') parts.push(`min cart value: Rs.${rule.minCartValue.toLocaleString('en-IN')}`)
  else parts.push(`stackable: ${rule.stackable ? 'Yes' : 'No'}`)
  return parts
}
