/**
 * api/parse-rule.js — Vercel serverless function
 *
 * Turns a plain-English discount description into a RAW rule object using Gemini.
 * The API key lives only here (server-side env var), never in the browser bundle.
 *
 * This function does NOT decide whether the rule is valid — the browser runs
 * every result through the same validateRule() used by the CSV input.
 */

// Tried in order. If one is overloaded (503) or rate-limited (429), the next is used.
// Override with GEMINI_MODEL="model-a,model-b" in env vars.
const MODELS = (process.env.GEMINI_MODEL || 'gemini-3.5-flash,gemini-4-hydrogen')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function buildPrompt(text, known) {
  return `You convert a shop admin's plain-English discount description into JSON.

Return ONLY a JSON object, no markdown, in exactly one of these two shapes:

1) If the description is clear enough:
{"status":"ok","rule":{"scope":"brand"|"platform"|"cart","appliesTo":string|null,"type":"percentage"|"flat","value":number,"stackable":boolean,"minCartValue":number|null}}

2) If a required detail is missing or genuinely ambiguous:
{"status":"unresolvable","reason":"<one short sentence for the user>","missing":["<field>", ...]}

Rules:
- scope "brand": applies to one brand. scope "platform": applies to one marketplace (e.g. Amazon India, Flipkart, Noon). scope "cart": a condition on the whole cart total.
- appliesTo: the brand or platform name; null for cart scope. Prefer the exact spelling from the known lists below when the text clearly refers to one of them.
- type "percentage": value is the percent number (20% -> 20). type "flat": value is rupees (Rs.100 -> 100).
- stackable: true ONLY if the text says it stacks / combines / applies on top of other offers. Otherwise false.
- minCartValue: the rupee threshold for cart rules ("more than Rs.5,000" -> 5000). null for brand/platform rules.
- NEVER invent a number. If the discount amount, or a cart rule's threshold, is not stated, return "unresolvable".
- If it is unclear whether a name is a brand or a platform, return "unresolvable".

Known brands: ${known.brands.join(', ') || 'none'}
Known platforms: ${known.platforms.join(', ') || 'none'}

Description: """${text}"""`
}

/** One HTTP call to Gemini. Returns { ok, status, data?, detail? } and never throws. */
async function requestOnce(apiKey, model, prompt, lowThinking) {
  const generationConfig = { responseMimeType: 'application/json' }
  // Parsing one sentence into JSON doesn't need deep reasoning; low thinking = much faster.
  if (lowThinking) generationConfig.thinkingConfig = { thinkingLevel: 'low' }
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig }),
        signal: AbortSignal.timeout(25000),
      }
    )
    if (response.ok) return { ok: true, status: 200, data: await response.json() }
    return { ok: false, status: response.status, detail: await response.text() }
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
    return { ok: false, status: timedOut ? 504 : 0, detail: String(err) }
  }
}

/** Calls Gemini with retries + model fallback. Returns { ok, status, data }. */
async function callGemini(apiKey, prompt) {
  let last = { ok: false, status: 0 }
  for (const model of MODELS) {
    let lowThinking = true
    for (let attempt = 1; attempt <= 2; attempt++) {
      let result = await requestOnce(apiKey, model, prompt, lowThinking)

      // Some models don't accept the thinking setting: retry once without it.
      if (!result.ok && result.status === 400 && lowThinking && /thinking/i.test(result.detail || '')) {
        lowThinking = false
        result = await requestOnce(apiKey, model, prompt, false)
      }
      if (result.ok) return result

      console.error(`Gemini ${model} attempt ${attempt} failed:`, result.status, (result.detail || '').slice(0, 300))
      last = result

      if (result.status === 404) break // model not available -> next model
      if (![0, 429, 500, 503, 504].includes(result.status)) return last // bad key / bad request -> stop
      if (result.status === 504) break // timed out -> don't wait again on the same model
      await sleep(800 * attempt)
    }
  }
  return last
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' })
  }

  const { text, known = {} } = req.body || {}
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Please type a rule description' })
  }
  if (text.length > 500) {
    return res.status(400).json({ error: 'Description is too long (max 500 characters)' })
  }

  const safeKnown = {
    brands: Array.isArray(known.brands) ? known.brands.slice(0, 50).map(String) : [],
    platforms: Array.isArray(known.platforms) ? known.platforms.slice(0, 50).map(String) : [],
  }

  try {
    const result = await callGemini(apiKey, buildPrompt(text.trim(), safeKnown))

    if (!result.ok) {
      const msg =
        result.status === 400 || result.status === 403
          ? 'The AI service rejected the request (check the API key).'
          : result.status === 429 || result.status === 503
          ? 'The AI service is busy right now. Please try again in a few seconds.'
          : result.status === 504
          ? 'The AI took too long to respond. Please try again.'
          : `The AI service returned an error (${result.status}). Please try again.`
      return res.status(502).json({ error: msg })
    }

    const raw = result.data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
    const cleaned = raw.replace(/```json|```/g, '').trim()

    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return res.status(502).json({ error: 'The AI returned something that was not valid JSON. Please rephrase and try again.' })
    }

    return res.status(200).json(parsed)
  } catch (err) {
    console.error(err)
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
    return res.status(504).json({
      error: timedOut ? 'The AI took too long to respond. Please try again.' : 'Could not reach the AI service. Please try again.',
    })
  }
}
