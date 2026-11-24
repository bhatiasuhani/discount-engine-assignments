/**
 * pdfTextExtractor.js
 *
 * Browser-only: reads a PDF file with pdf.js and returns positioned text items
 * [{ str, x, y, width }] for pdfCartInput.js. pdf.js is loaded on demand so it
 * doesn't slow down the first page load.
 */
export async function extractTextItems(arrayBuffer) {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
  const items = []
  // Each page's y is offset so lines from later pages sort below earlier ones.
  let pageOffset = 0
  for (let p = pdf.numPages; p >= 1; p--) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    for (const it of content.items) {
      if (!('str' in it)) continue
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5] + pageOffset, width: it.width })
    }
    pageOffset += page.view[3] + 100
  }
  return items
}
