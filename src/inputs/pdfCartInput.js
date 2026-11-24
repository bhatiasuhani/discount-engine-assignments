/**
 * pdfCartInput.js
 *
 * Input adapter: text positions from a cart PDF  ->  validated CartItem[].
 *
 * Pure functions only (no pdf.js, no DOM) so the table logic can be tested
 * on its own. pdfTextExtractor.js does the actual PDF reading in the browser.
 *
 * Expected layout (from the brief): a header row "Product | Brand | Platform | Base Price"
 * followed by one item per line. Anything above the header (order number, date)
 * is ignored; separator lines (─── / ---) are skipped.
 */
import { validateCartItem } from '../engine/cartValidator.js'

const COLUMNS = [
  { key: 'product', header: /^product$/i },
  { key: 'brand', header: /^brand$/i },
  { key: 'platform', header: /^platform$/i },
  { key: 'basePrice', header: /^(base\s*)?price$/i },
]

/**
 * Some PDFs give one text item per cell, others one item per whole line
 * ("Cushion Cover    Natura Casa    Amazon India    Rs.1,299").
 * Split every item on runs of 2+ spaces and estimate each piece's x position,
 * so both layouts end up as a list of positioned cells.
 */
function toCells(items) {
  const cells = []
  for (const it of items) {
    const str = it.str
    if (!str || !str.trim()) continue
    const charWidth = str.length ? (it.width || 0) / str.length : 0
    const re = /\S+(?: \S+)*/g // words separated by single spaces stay together
    let m
    while ((m = re.exec(str))) {
      cells.push({ text: m[0], x: it.x + charWidth * m.index, y: it.y })
    }
  }
  return cells
}

/** Groups cells into lines (top to bottom), cells sorted left to right. */
export function groupIntoLines(items, yTolerance = 3) {
  const cells = toCells(items).sort((a, b) => b.y - a.y || a.x - b.x)
  const lines = []
  for (const c of cells) {
    const line = lines.find((l) => Math.abs(l.y - c.y) <= yTolerance)
    if (line) line.cells.push(c)
    else lines.push({ y: c.y, cells: [c] })
  }
  lines.forEach((l) => l.cells.sort((a, b) => a.x - b.x))
  return lines
}

/** Finds the header row and the x position where each column starts. */
function findHeader(lines) {
  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].cells
    const starts = COLUMNS.map((col) => cells.find((c) => col.header.test(c.text.trim()))?.x)
    if (starts.every((x) => x !== undefined)) return { index: i, starts }
  }
  return null
}

// "-----", "─────", or any single character repeated (fonts sometimes mangle box-drawing chars)
const isSeparator = (text) => {
  const t = text.replace(/\s/g, '')
  return t.length >= 5 && (/^[-─━═_=|.]+$/.test(t) || /^(.)\1+$/.test(t))
}

/**
 * Main entry: positioned text items -> { items, warnings, error }.
 *   items    valid CartItems (ITEM-01, ITEM-02, ...)
 *   warnings one message per skipped row, so nothing is dropped silently
 *   error    set when the PDF can't be used at all (cart should NOT be replaced)
 */
export function cartItemsFromTextItems(textItems) {
  const lines = groupIntoLines(textItems)
  const header = findHeader(lines)
  if (!header) {
    return {
      items: [], warnings: [],
      error: 'Could not find a table with the columns Product, Brand, Platform, Base Price in this PDF.',
    }
  }

  // Column i owns everything from (its header x - slack) up to the next column's start.
  const slack = 4
  const columnFor = (x) => {
    let idx = 0
    header.starts.forEach((start, i) => { if (x >= start - slack) idx = i })
    return idx
  }

  const items = []
  const warnings = []
  let rowNumber = 0

  for (const line of lines.slice(header.index + 1)) {
    const lineText = line.cells.map((c) => c.text).join(' ')
    if (isSeparator(lineText)) continue
    rowNumber++

    const raw = { product: '', brand: '', platform: '', basePrice: '' }
    for (const cell of line.cells) {
      const key = COLUMNS[columnFor(cell.x)].key
      raw[key] = raw[key] ? `${raw[key]} ${cell.text}` : cell.text
    }

    const itemId = `ITEM-${String(items.length + 1).padStart(2, '0')}`
    const { item, errors } = validateCartItem({ ...raw, itemId })
    if (item) items.push(item)
    else warnings.push(`Row ${rowNumber} skipped ("${lineText}"): ${errors.join('; ')}`)
  }

  if (items.length === 0) {
    return {
      items: [], warnings,
      error: 'The PDF table had no valid item rows, so the current cart was kept.',
    }
  }
  return { items, warnings, error: null }
}
