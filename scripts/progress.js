/**
 * Flash card progress, kept per deck in localStorage.
 * Boxes follow the Leitner system: 0 = new / missed, 5 = solid.
 * A card counts as "learned" once it reaches LEARNED_BOX.
 */

const PREFIX = 'polish-practice:deck:';
export const LEARNED_BOX = 3;
export const MAX_BOX = 5;

function storage() {
  try {
    return window.localStorage;
  } catch (e) {
    return null;
  }
}

/**
 * Reads a deck's saved progress.
 * @param {string} deckId Deck identifier (usually the page path)
 * @returns {{title?: string, total: number, boxes: Object<string, number>, updated?: number}}
 */
export function readDeck(deckId) {
  const empty = { total: 0, boxes: {} };
  const store = storage();
  if (!store) return empty;
  try {
    const parsed = JSON.parse(store.getItem(PREFIX + deckId));
    if (!parsed || typeof parsed !== 'object') return empty;
    return { ...empty, ...parsed, boxes: parsed.boxes || {} };
  } catch (e) {
    return empty;
  }
}

/**
 * Saves a deck's progress. Fails silently when storage is unavailable.
 * @param {string} deckId Deck identifier
 * @param {object} data Deck progress
 */
export function writeDeck(deckId, data) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(PREFIX + deckId, JSON.stringify({ ...data, updated: Date.now() }));
  } catch (e) {
    // quota exceeded or blocked; progress just isn't remembered
  }
}

/**
 * Removes a deck's progress.
 * @param {string} deckId Deck identifier
 */
export function clearDeck(deckId) {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(PREFIX + deckId);
  } catch (e) {
    // ignore
  }
}

/**
 * Summarises progress for every deck stored under a page path.
 * A page may hold several flashcards blocks (`/path`, `/path#2`, ...).
 * @param {string} path Page path
 * @returns {{total: number, learned: number, strength: number, started: boolean}}
 */
export function summarisePath(path) {
  const result = {
    total: 0, learned: 0, strength: 0, started: false,
  };
  const store = storage();
  if (!store) return result;
  try {
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && key.startsWith(PREFIX)) {
        const id = key.slice(PREFIX.length);
        if (id === path || id.startsWith(`${path}#`)) {
          const deck = readDeck(id);
          result.started = true;
          const learned = Object.values(deck.boxes).filter((box) => box >= LEARNED_BOX).length;
          result.total += deck.total || 0;
          result.learned += Math.min(learned, deck.total || learned);
          result.strength += Object.values(deck.boxes)
            .reduce((sum, box) => sum + Math.min(box, LEARNED_BOX), 0);
        }
      }
    }
  } catch (e) {
    // ignore
  }
  // 0-1 score: partial credit for cards on their way to being learned
  result.strength = result.total
    ? Math.min(1, result.strength / (result.total * LEARNED_BOX))
    : 0;
  return result;
}
