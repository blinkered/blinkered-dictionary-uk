/**
 * The collections that attest Ukrainian, and where each comes from.
 *
 * The smallest candidate list in the queue with real book supply: 20,903 words against
 * 24,367 Internet Archive texts. Russian already proved the Cyrillic fold.
 *
 * Every URL here was probed before it was written down. A collection that 404s does not fail
 * loudly — the build skips it with a warning and reports a healthy number over fewer families.
 */
import { createReadStream, existsSync, readFileSync, readdirSync } from 'node:fs'
import { createInterface } from 'node:readline'
import {
  fileDocuments,
  fineweb2Documents,
  gutenbergBody,
  harvestDocuments,
  leipzigLocators,
  leipzigSentences,
  tatoebaDocuments,
  verseDocuments,
  wikiDocuments,
} from '@blinkered/attestation'

export const LANGUAGE = 'uk'

const CACHE = new URL('.cache/raw/', import.meta.url).pathname

/** A Leipzig package, with its sentence-to-URL index resolved up front. */
function leipzig(pkg) {
  const base = `${CACHE}${pkg}/${pkg}`
  const locators = leipzigLocators(
    readFileSync(`${base}-inv_so.txt`, 'utf8'),
    readFileSync(`${base}-sources.txt`, 'utf8'),
  )
  const lines = createInterface({
    input: createReadStream(`${base}-sentences.txt`),
    crlfDelay: Infinity,
  })
  return leipzigSentences(lines, locators)
}

// News only. The Leipzig Wikipedia packages are deliberately absent: they are Wikipedia text
// wearing a Leipzig label, so including one would corroborate `wiki:uk` while looking
// like another family. That is the exact failure the three-families rule exists to catch.
const LEIPZIG = [
  'ukr_news_2024_1M',
  'ukr_news_2023_1M',
]

const ALL = [
  {
    id: 'wiki:uk',
    what: 'Ukrainian Wikipedia — modern encyclopedic prose',
    needs: `${CACHE}ukwiki.xml.bz2`,
    documents: () => wikiDocuments(`${CACHE}ukwiki.xml.bz2`),
  },
  {
    id: 'wikisource:uk',
    what: 'Ukrainian Wikisource — same Wikimedia family, so it corroborates rather than counts',
    needs: `${CACHE}ukwikisource.xml.bz2`,
    documents: () => wikiDocuments(`${CACHE}ukwikisource.xml.bz2`),
  },
  ...LEIPZIG.map((pkg) => ({
    id: `lz:${pkg}`,
    from: `https://downloads.wortschatz-leipzig.de/corpora/${pkg}.tar.gz`,
    what: `Leipzig ${pkg} — modern news, cited by the page each sentence came from`,
    needs: `${CACHE}${pkg}`,
    documents: () => leipzig(pkg),
  })),
  {
    id: 'tat',
    from: 'https://downloads.tatoeba.org/exports/per_language/ukr/ukr_sentences.tsv.bz2',
    what: 'Tatoeba Ukrainian — contemporary and conversational',
    needs: `${CACHE}ukr_sentences.tsv`,
    documents: () => tatoebaDocuments(`${CACHE}ukr_sentences.tsv`),
  },
  {
    id: 'fw2',
    from: 'https://huggingface.co/datasets/HuggingFaceFW/fineweb-2/resolve/main/data/ukr_Cyrl/train/000_00000.parquet',
    what: 'FineWeb-2 Ukrainian — a web crawl nobody here made',
    needs: `${CACHE}fineweb2-ukr.parquet`,
    documents: () => fineweb2Documents(`${CACHE}fineweb2-ukr.parquet`),
  },
  {
    id: 'ebible:ukr1996',
    from: 'https://ebible.org/Scriptures/ukr1996_vpl.zip',
    what: 'Ukrainian 1996 — a family nothing else here belongs to',
    needs: `${CACHE}ebible-ukr1996/ukr1996_vpl.txt`,
    documents: () => verseDocuments(`${CACHE}ebible-ukr1996/ukr1996_vpl.txt`),
  },
  {
    id: 'ia',
    // Scanned books are OCR, and OCR fails in a way that looks like text. Clean Gutenberg scores
    // a median 52% known words and never below 36%; the worst of these scored 1%, an English
    // book read as Cyrillic. Below this floor a book is not legible enough to attest anything.
    legible: 0.35,
    what: 'Internet Archive Ukrainian books — literature, and the register a newspaper never reaches',
    needs: `${CACHE}archive-uk`,
    from: 'https://archive.org/search?query=mediatype%3Atexts+AND+language%3A%22Ukrainian%22',
    documents: () => {
      const dir = `${CACHE}archive-uk`
      // A locator names the text, not the item: the catalogue page holds no word of the book.
      const named = new Map(
        readFileSync(`${dir}/files.tsv`, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => line.split('\t')),
      )
      const books = readdirSync(dir)
        .filter((file) => file.endsWith('.txt'))
        .map((file) => file.replace('.txt', ''))
        .filter((id) => named.has(id))
        // Percent-encoded: two thirds of Archive filenames contain spaces, and the evidence
        // format spends spaces as separators.
        .map((id) => ({
          locator: `${id}/${encodeURIComponent(named.get(id))}`,
          path: `${dir}/${id}.txt`,
        }))
      return fileDocuments(books, async (path) => readFileSync(path, 'utf8'))
    },
  },
]

export const SOURCES = ALL.filter((source) => {
  if (source.needs === undefined || existsSync(source.needs)) return true
  process.stderr.write(`  (skipping ${source.id}: ${source.needs} is not in .cache/raw)\n`)
  return false
})

/**
 * Ukrainian publishers, for the harvest.
 *
 * Chosen because they publish in Ukrainian rather than because they are large. A harvester
 * reads whatever it fetches and has no idea what language it is in, so a domain that publishes
 * mostly in another language would attest that language's words against these candidates. The
 * last group is literary and cultural, for a register the dailies never reach — which is where
 * the words one family short of the rule tend to live.
 */
export const DOMAINS = [
  'pravda.com.ua', 'ukrinform.ua', 'suspilne.media', 'nv.ua', 'zn.ua',
  'hromadske.ua', 'lb.ua', 'texty.org.ua', 'day.kyiv.ua', 'tyzhden.ua',
  'chytomo.com', 'litcentr.in.ua', 'ukrlib.com.ua',
]

export const HARVEST = existsSync(new URL('searched.tsv', import.meta.url).pathname)
  ? () => harvestDocuments(new URL('searched.tsv', import.meta.url).pathname)
  : undefined

/** Carried over from Blinkered's calibration; must be re-measured before anything ships. */
export const COMMON_CUT = 17000
