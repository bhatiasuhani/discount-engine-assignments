/**
 * NlRuleInput.jsx
 *
 * Text box -> LLM parse -> confirmation card -> onConfirm(rule).
 * Knows nothing about discount maths; it only hands a validated rule to App.
 */
import { useState } from 'react'
import { parseRuleFromText, describeRule } from '../inputs/nlRuleInput.js'

const EXAMPLES = [
  '20% off for Natura Casa brand, stackable with other offers',
  'Rs.100 flat discount on all Flipkart items',
  '10% off if cart value is more than Rs.5,000',
]

const box = (bg, border) => ({
  background: bg, border: `1px solid ${border}`, borderRadius: 4,
  padding: '0.75rem 0.9rem', marginTop: '0.75rem', fontSize: 13,
})
const btn = (bg, color = '#fff') => ({
  background: bg, color, border: bg === '#fff' ? '1px solid #CECECE' : 'none', borderRadius: 4,
  padding: '0.5rem 1.1rem', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  textTransform: 'uppercase', letterSpacing: '0.04em',
})

export default function NlRuleInput({ rules, cartItems, onConfirm }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null) // { kind, rule?, warnings?, message?, errors? }

  async function handleParse() {
    if (!text.trim() || loading) return
    setLoading(true)
    setResult(null)
    const r = await parseRuleFromText(text.trim(), { rules, cartItems })
    setResult(r)
    setLoading(false)
  }

  function handleConfirm() {
    onConfirm(result.rule)
    setResult(null)
    setText('')
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: '#555', marginBottom: 6 }}>
        Describe a new offer in plain English. You'll review it before it's added.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleParse()}
          placeholder='e.g. "15% off all LivSpace Pro products"'
          maxLength={500}
          style={{ flex: 1, padding: '0.55rem 0.7rem', border: '1px solid #CECECE', borderRadius: 4, fontSize: 13 }}
        />
        <button
          style={btn(loading || !text.trim() ? '#CECECE' : '#131A48')}
          disabled={loading || !text.trim()}
          onClick={handleParse}
        >
          {loading ? 'Reading…' : 'Parse rule'}
        </button>
      </div>

      <div style={{ marginTop: 6, fontSize: 11, color: '#888' }}>
        Try:{' '}
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => { setText(ex); setResult(null) }}
            style={{ background: 'none', border: 'none', color: '#FF5800', cursor: 'pointer', fontSize: 11, padding: '0 6px 0 0', textDecoration: 'underline' }}
          >
            {ex}
          </button>
        ))}
      </div>

      {result?.kind === 'ok' && (
        <div style={box('#f2f8f3', '#9ccaa5')}>
          <div style={{ fontWeight: 700, color: '#1e5c2c', marginBottom: 6 }}>
            Is this the rule you meant? ({result.rule.ruleId})
          </div>
          <div style={{ color: '#131A48' }}>{describeRule(result.rule).join(' · ')}</div>
          {result.warnings.map((w) => (
            <div key={w} style={{ color: '#9a5b00', marginTop: 6 }}>⚠ {w}</div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={btn('#FF5800')} onClick={handleConfirm}>Confirm & add</button>
            <button style={btn('#fff', '#131A48')} onClick={() => setResult(null)}>Discard</button>
          </div>
        </div>
      )}

      {result?.kind === 'unresolvable' && (
        <div style={box('#fff7e6', '#f0c36d')}>
          <div style={{ fontWeight: 700, color: '#8a5a00', marginBottom: 4 }}>Need a bit more detail</div>
          <div style={{ color: '#5a3d00' }}>{result.message}</div>
        </div>
      )}

      {result?.kind === 'invalid' && (
        <div style={box('#fce8e8', '#e57373')}>
          <div style={{ fontWeight: 700, color: '#8a1a1a', marginBottom: 4 }}>Couldn't create a rule</div>
          <div style={{ color: '#5a1010' }}>{result.message}</div>
          {result.errors?.map((e) => <div key={e} style={{ color: '#5a1010', marginTop: 2 }}>• {e}</div>)}
        </div>
      )}
    </div>
  )
}
