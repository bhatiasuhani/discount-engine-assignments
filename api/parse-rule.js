/**
 * api/parse-rule.js — Vercel serverless function
 *
 * Turns a plain-English discount description into a RAW rule object using Gemini.
 * The API key lives only here (server-side env var), never in the browser bundle.
 *
 * This function does NOT decide whether the rule is valid — the browser runs
 * every result through the same validateRule() used by the CSV input.
 */

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash'

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
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildPrompt(text.trim(), safeKnown) }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    )

    if (!response.ok) {
      const detail = await response.text()
      console.error('Gemini error', response.status, detail)
      return res.status(502).json({ error: `The AI service returned an error (${response.status}). Please try again.` })
    }

    const data = await response.json()
    const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
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
    return res.status(502).json({ error: 'Could not reach the AI service. Please try again.' })
  }
}
