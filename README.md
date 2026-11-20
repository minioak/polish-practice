# Polish Practice

An installable, offline-capable flash card app for practising the Polish
alphabet and sounds, built on AEM Edge Delivery Services.

- Preview: https://main--polish-practice--minioak.aem.page/
- Live: https://main--polish-practice--minioak.aem.live/

## How it works

| Piece | What it does |
| --- | --- |
| `blocks/flashcards` | Turns an authored table into a flash card deck: flip, swipe, "Say it" / "Spell it" modes, spaced repetition (Leitner boxes) saved in `localStorage`, and Polish text-to-speech. |
| `blocks/decks` | Home-page deck list with each deck's progress. Prefetches deck pages so they work offline. |
| `blocks/install` | Shows an "Install the app" button where the browser offers one, plus authored instructions (iOS). Hidden once installed. |
| `sw.js` | Service worker: network-first for pages, stale-while-revalidate for code, so the app works offline. |
| `manifest.webmanifest`, `icons/` | Makes the site installable as a home-screen app. |
| `scripts/progress.js`, `scripts/speech.js` | Shared progress storage and speech helpers. |

## Content

Pages live in the CMS. Ready-made versions of every page are in `content/`
(ignored by `.hlxignore`, so they are never served from code):

| Path | File |
| --- | --- |
| `/` | `content/index.html` |
| `/alphabet` | `content/alphabet.html` (32 cards) |
| `/digraphs` | `content/digraphs.html` (8 cards) |
| `/soft-sounds` | `content/soft-sounds.html` (10 cards) |
| `/sound-pairs` | `content/sound-pairs.html` (11 cards) |
| `/nav`, `/footer` | `content/nav.html`, `content/footer.html` |

If the content source is da.live, publish them all with
`DA_TOKEN=… tools/publish-content.sh`. For Google Drive or SharePoint, recreate
each page as a document: the HTML maps one-to-one to a document with block
tables.

### Authoring a deck

Add a **Flashcards** table to any page. Each row is one card:

| Flashcards | | | | |
| --- | --- | --- | --- | --- |
| Letter | Sound | How to say it | Example | |
| Ł ł | /w/ | Sounds like English "w" in "wet". | **łóżko** — bed | *(optional link to an .mp3)* |

- An optional first row of column headings is skipped.
- **Bold** words in the Example column are what "Hear it" reads aloud, and
  "Spell it" blanks out the card's letter in the bolded word.
- An audio link in any cell plays instead of text-to-speech.
- Only the first column is required.

Then link the page from the **Decks** table on the home page (one row per deck:
link, description) and from `/nav`.

## Development

```sh
npm i
npm run lint
npx -y @adobe/aem-cli up   # local code, previewed content
```
