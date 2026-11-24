# Opptra Discount Engine — FDE Intern Assignment
 
A customer-facing cart pricing engine. It picks the offer that saves the customer the most, stacks stackable offers, applies cart-level offers, and explains every price in plain language.
 
**Live app:** https://discount-engine-assignments.vercel.app
**Walkthrough (Loom):** https://www.loom.com/share/33090facbb9a460ead2781a290b6140d
 
## Run locally
 
```bash
git clone https://github.com/bhatiasuhani/discount-engine-assignments && cd discount-engine-assignments
npm install
npm run dev        # open http://localhost:5173
```
 
The natural-language rule input needs a free Gemini key: create `.env.local` with `GEMINI_API_KEY=your-key`. Everything else works without it.
 
## Try it
 
1. Upload `sample-data/rules.csv` and `sample-data/cart.csv` (or `sample-data/cart.pdf`).
2. Results appear automatically: six item prices, Subtotal **Rs.5,932**, cart offer **−Rs.593**, Final Cart Total **Rs.5,339**, matching the expected results table in the brief.
3. Type a rule in plain English, e.g. *"20% off for Natura Casa brand, stackable with other offers"*, review the parsed fields, and confirm. The cart re-prices immediately.
4. Upload `sample-data/cart-malformed.pdf` to see how bad rows are handled.
## What was built
 
| Task | What it does |
|---|---|
| Foundation | Base engine deployed on Vercel; verified against the expected results table. |
| Task 1 — Cart-level offer | `scope: cart` rules with `min_cart_value`. Evaluated after item discounts, against the sum of final item prices. Shown as a separate row ("Cart offer: 10% off — Rs.593 saved"); the row is absent when the threshold isn't met. |
| Task 2 — Natural-language rules | Plain-English text → Gemini → validated `DiscountRule` → confirmation card (confirm / discard) → engine re-runs on the current cart. Vague input ("Give a discount for big orders") is surfaced as unresolvable with what's missing and an example. |
| Task 3 — PDF cart upload | Order PDF with columns Product, Brand, Platform, Base Price → `CartItem[]` → replaces the cart → engine re-runs with the active rules. |
 
## Architecture
 
```
api/
  parse-rule.js          Serverless function: holds the Gemini key, calls the model
src/
  engine/                Pure logic, no UI, no I/O
    discountEngine.js    Item discounts (unchanged from base) + applyCartOffer()
    ruleValidator.js     The one definition of a valid DiscountRule
    cartValidator.js     The one definition of a valid CartItem
    csvParser.js         CSV → validators
  inputs/                Input adapters: raw input → validated engine objects
    nlRuleInput.js       LLM response → validateRule() + soft warnings
    pdfCartInput.js      PDF text positions → table rows → validateCartItem()
    pdfTextExtractor.js  pdf.js wrapper (browser only, lazy-loaded)
  components/            UI only
  App.jsx                Wires inputs to the engine through one runEngine()
```
 
**Inputs adapt to the engine, not the other way round.** The item-level discount logic from the base repo is untouched; the only engine change is the *added* `applyCartOffer()` step. Each input mode is an adapter that produces the same validated objects, and every path ends in the same `runEngine()`.
 
**Adding a third input mode** (e.g. a spreadsheet, an API, a voice command) means writing one adapter in `src/inputs/` that calls `validateRule()` or `validateCartItem()`, plus a component. The discount calculator doesn't change.
 
## Design decisions and trade-offs
 
**LLM output is untrusted.** The model's JSON goes through the same `validateRule()` as CSV rows. If it returns an unknown scope, a negative value, a percentage over 100, a cart rule without a threshold, or not-JSON at all, the user sees a specific error and nothing is added. The engine never sees an invalid rule.
 
**The LLM is told never to invent numbers.** If the amount or threshold is missing, or it's unclear whether a name is a brand or a platform, it must return `unresolvable` with a reason. The UI shows the reason plus an example of a clear rule.
 
**Soft warnings in the confirmation step.** A valid rule can still be suspicious: a brand or platform that isn't in the current cart ("won't change any price yet"), or a percentage of 50% or more. These are shown on the confirmation card but don't block confirmation. The admin may be preparing a rule for a future cart.
 
**The API key never reaches the browser.** The Gemini call runs in a Vercel serverless function. A purely client-side call would put the key in the JavaScript bundle where anyone could read it.
 
**The LLM failing is a normal case, not a crash.** The function retries on 429/503/timeouts, then falls back through a configurable list of models (`GEMINI_MODEL`, comma-separated). It asks for low "thinking" effort, since turning one sentence into JSON doesn't need deep reasoning and it's much faster. If every model is unavailable, the user gets "busy, try again" and the cart and rules are untouched. This came from real testing: Gemini returned 503 "high demand" and timeouts during development.
 
**Malformed PDF rows are skipped individually, never silently.** Each skipped row is listed with its reason (`base price must be a positive number, got "Rs.abc"`, `missing platform`). One bad row doesn't block the good ones.
 
**An unusable PDF keeps the current cart.** If there's no recognisable table, or no valid rows, the existing cart stays and an error is shown. Replacing a good cart with an empty one would be worse than doing nothing.
 
**PDF parsing uses the header's column positions,** not a fixed format. It handles both text-style PDFs (one line of spaced text per row, like the brief's example) and true table PDFs (one text item per cell). Lines above the header (order number, date) and separator lines are ignored. Prices like `Rs.1,299`, `₹1,299` and `1299` are all accepted.
 
**Just below the cart threshold:** the offer row is hidden as the brief requires, and the customer sees "Add Rs.X more to unlock 10% off your cart". At exactly the threshold the offer applies (≥).
 
**Multiple cart rules:** if more than one is eligible, the one with the largest saving applies, consistent with the item-level "max saving wins" rule. Cart rules don't stack with each other.
 
**Auto re-run everywhere.** The brief asks for re-runs after a PDF upload and after confirming a rule. CSV uploads now re-run automatically too, so results are never stale and every input behaves the same. The Calculate button is kept as a manual re-run.
 
**Rounding:** each discount amount is rounded to the nearest rupee (as in the base engine), so the customer only ever sees whole-rupee prices and savings that add up.
 
## Where I'd push back on the brief
 
- **Task numbering:** the evaluation section refers to the natural-language input as "Task 1" and the PDF input as "Task 2", while the build section calls them Tasks 2 and 3. I followed the build section's numbering.
- **Confirmation step:** I kept it and think it's right for rules, because a wrong rule changes prices for every customer. For a high-volume admin I'd add a "trusted mode" that auto-confirms rules whose parse has no warnings.
- **PDF format assumption:** a fixed four-column table is fine for a prototype, but real order PDFs vary (extra columns, quantities, multi-line product names). Next step would be header synonyms (e.g. "Price", "MRP", "Marketplace") and ignoring unknown columns. For scanned PDFs, OCR or an LLM with vision would be needed.
## Limitations
 
- State is in memory only (per the brief); refreshing the page clears rules and cart.
- Uploading a new rules CSV replaces all rules, including ones added in plain English.
- Item IDs from a PDF are assigned in order (ITEM-01, ITEM-02, …) since the PDF format has no ID column.
 
