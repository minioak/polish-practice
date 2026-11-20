import {
  readDeck, writeDeck, clearDeck, LEARNED_BOX, MAX_BOX,
} from '../../scripts/progress.js';
import {
  getPolishVoice, speak, playAudio, stopSpeaking,
} from '../../scripts/speech.js';

const AUDIO_PATTERN = /\.(mp3|m4a|aac|ogg|oga|wav|webm)(\?|#|$)/i;
const HEADER_PATTERN = /^(front|letters?|polish|cards?|graphemes?|sounds?)$/i;
const SEE_AGAIN_AFTER = 3;

let keyboardOwner = null;

/**
 * Text of a cell with collapsed whitespace.
 * @param {Element} [cell]
 */
function cellText(cell) {
  return cell ? cell.textContent.replace(/\s+/g, ' ').trim() : '';
}

/**
 * Copies a cell's content into a fresh element, unwrapping links so the
 * card stays a single tap target.
 * @param {Element} cell
 * @param {string} className
 */
function cloneCell(cell, className) {
  const out = document.createElement('div');
  out.className = className;
  if (!cell) return out;
  out.append(...[...cell.childNodes].map((node) => node.cloneNode(true)));
  out.querySelectorAll('a').forEach((a) => {
    if (AUDIO_PATTERN.test(a.getAttribute('href') || '')) a.remove();
    else a.replaceWith(...a.childNodes);
  });
  out.querySelectorAll('picture, img').forEach((media) => media.remove());
  return out;
}

/**
 * Works out which Polish words a card should speak.
 * Bold text in the example cell wins; otherwise the text before a dash.
 * @param {Element} [example]
 */
function speechFor(example) {
  if (!example) return [];
  const bold = [...example.querySelectorAll('strong, b')]
    .map((node) => cellText(node))
    .filter(Boolean);
  if (bold.length) return bold;
  const text = cellText(example);
  if (!text) return [];
  const [polish] = text.split(/\s[–—-]\s|[(:=]/);
  return polish.trim() ? [polish.trim()] : [];
}

/**
 * Turns an authored row into a card.
 * Columns: front | sound | tip | example (bold = Polish word) | optional audio link.
 * @param {Element} row
 */
function parseRow(row) {
  const cells = [...row.children];
  const front = cellText(cells[0]);
  if (!front) return null;
  const [, sound, tip, example] = cells;
  const audioLink = [...row.querySelectorAll('a[href]')]
    .find((a) => AUDIO_PATTERN.test(a.getAttribute('href')));
  return {
    id: front,
    front,
    sound: cellText(sound),
    tipEl: cellText(tip) ? cloneCell(tip, 'flashcards-tip') : null,
    exampleEl: cellText(example) ? cloneCell(example, 'flashcards-example') : null,
    speech: speechFor(example),
    audio: audioLink ? audioLink.href : null,
  };
}

/**
 * Finds the card's letter inside its example word, for the "spell it" mode.
 * @param {object} card
 * @returns {{before: string, target: string, after: string}|null}
 */
function findGap(card) {
  if (card.speech.length !== 1) return null;
  const word = card.speech[0];
  const lower = word.toLocaleLowerCase('pl');
  const candidates = [...new Set(card.front.toLocaleLowerCase('pl').split(/[\s/·,|]+/))]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const match = candidates.find((c) => lower.includes(c));
  if (!match) return null;
  const index = lower.indexOf(match);
  return {
    before: word.slice(0, index),
    target: word.slice(index, index + match.length),
    after: word.slice(index + match.length),
  };
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className, label, ariaLabel) {
  const b = el('button', `button ${className}`, label);
  b.type = 'button';
  if (ariaLabel) b.setAttribute('aria-label', ariaLabel);
  return b;
}

/**
 * Builds the toggle group used for modes and filters.
 * @param {string} label Accessible group label
 * @param {Array<[string, string]>} options value/label pairs
 * @param {string} selected Initially selected value
 * @param {Function} onChange
 */
function toggleGroup(label, options, selected, onChange) {
  const group = el('div', 'flashcards-toggle');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  options.forEach(([value, text]) => {
    const b = el('button', '', text);
    b.type = 'button';
    b.dataset.value = value;
    b.setAttribute('aria-pressed', String(value === selected));
    b.addEventListener('click', () => {
      group.querySelectorAll('button').forEach((other) => other.setAttribute('aria-pressed', String(other === b)));
      onChange(value);
    });
    group.append(b);
  });
  return group;
}

export default async function decorate(block) {
  const rows = [...block.children];
  if (rows[0] && HEADER_PATTERN.test(cellText(rows[0].children[0]))) rows.shift();
  const cards = rows.map(parseRow).filter(Boolean);

  // dedupe ids so progress never collides
  const seen = new Map();
  cards.forEach((card) => {
    const count = seen.get(card.id) || 0;
    seen.set(card.id, count + 1);
    if (count) card.id = `${card.id} (${count + 1})`;
  });

  block.textContent = '';
  if (!cards.length) {
    block.append(el('p', 'flashcards-empty', 'This deck has no cards yet.'));
    return;
  }

  const blocks = [...document.querySelectorAll('main .flashcards')];
  const position = blocks.indexOf(block);
  const deckId = position > 0
    ? `${window.location.pathname}#${position + 1}`
    : window.location.pathname;
  const title = document.querySelector('main h1')?.textContent.trim() || document.title;

  const state = {
    mode: 'say', // 'say': letter -> sound, 'spell': word -> letter
    focus: false, // only cards not yet learned
    queue: [],
    sessionSize: 0,
    done: new Set(),
    firstTry: 0,
    missed: new Set(),
    flipped: false,
    canSpeak: false,
    voiceChecked: false,
  };

  let progress = readDeck(deckId);
  const save = () => writeDeck(deckId, { ...progress, title, total: cards.length });
  const boxOf = (card) => progress.boxes[card.id] || 0;
  const learnedCount = () => cards.filter((c) => boxOf(c) >= LEARNED_BOX).length;

  // ---- DOM ----
  const toolbar = el('div', 'flashcards-toolbar');
  const modeToggle = toggleGroup('Practice mode', [['say', 'Say it'], ['spell', 'Spell it']], state.mode, (value) => {
    state.mode = value;
    // eslint-disable-next-line no-use-before-define
    renderCard();
  });
  const focusToggle = toggleGroup('Cards to practise', [['all', 'All'], ['focus', 'Still learning']], 'all', (value) => {
    state.focus = value === 'focus';
    // eslint-disable-next-line no-use-before-define
    startSession();
  });
  toolbar.append(modeToggle, focusToggle);

  const status = el('div', 'flashcards-status');
  const bar = el('div', 'flashcards-bar');
  const barFill = el('span');
  bar.append(barFill);
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', 'Session progress');
  bar.setAttribute('aria-valuemin', '0');
  const count = el('p', 'flashcards-count');
  count.setAttribute('aria-live', 'polite');
  status.append(bar, count);

  const stage = el('div', 'flashcards-stage');
  const card = el('div', 'flashcards-card');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  const inner = el('div', 'flashcards-inner');
  const front = el('div', 'flashcards-face flashcards-front');
  const back = el('div', 'flashcards-face flashcards-back');
  inner.append(front, back);
  card.append(inner);
  stage.append(card);

  const actions = el('div', 'flashcards-actions');
  const againBtn = button('secondary flashcards-again', 'Again', 'Again: show this card again soon');
  const hearBtn = button('secondary flashcards-hear', 'Hear it', 'Hear the Polish word');
  const flipBtn = button('primary flashcards-flip', 'Show answer');
  const knowBtn = button('primary flashcards-know', 'Got it', 'Got it: I knew this one');
  actions.append(againBtn, hearBtn, flipBtn, knowBtn);

  const note = el('p', 'flashcards-note');
  note.hidden = true;

  const summary = el('div', 'flashcards-summary');
  summary.hidden = true;
  summary.setAttribute('aria-live', 'polite');

  const footer = el('div', 'flashcards-footer');
  const deckStats = el('p', 'flashcards-deck-stats');
  const resetBtn = el('button', 'flashcards-reset', 'Reset progress');
  resetBtn.type = 'button';
  footer.append(deckStats, resetBtn);

  block.append(toolbar, status, stage, actions, note, summary, footer);

  // ---- rendering ----
  const current = () => state.queue[0];

  function updateStatus() {
    const total = state.sessionSize;
    const doneCount = state.done.size;
    barFill.style.width = total ? `${(doneCount / total) * 100}%` : '0';
    bar.setAttribute('aria-valuemax', String(total));
    bar.setAttribute('aria-valuenow', String(doneCount));
    count.textContent = `${doneCount} of ${total} done`;
    deckStats.textContent = `${learnedCount()} of ${cards.length} learned in this deck`;
  }

  function setFlipped(flipped) {
    state.flipped = flipped;
    card.classList.toggle('is-flipped', flipped);
    card.setAttribute('aria-label', flipped ? 'Answer shown. Tap to see the question' : 'Tap to show the answer');
    front.setAttribute('aria-hidden', String(flipped));
    back.setAttribute('aria-hidden', String(!flipped));
    flipBtn.hidden = flipped;
    againBtn.hidden = !flipped;
    knowBtn.hidden = !flipped;
  }

  function canHear(c) {
    return Boolean(c && (c.audio || (state.canSpeak && c.speech.length)));
  }

  function hear() {
    const c = current();
    if (!c) return;
    if (c.audio) playAudio(c.audio);
    else if (state.canSpeak) speak(c.speech);
  }

  function renderFront(c) {
    front.textContent = '';
    if (state.mode === 'spell') {
      const gap = findGap(c);
      front.append(el('p', 'flashcards-prompt', 'Which letter fills the gap?'));
      const word = el('p', 'flashcards-word');
      word.lang = 'pl';
      if (gap) {
        const blank = el('span', 'flashcards-gap', '_'.repeat(gap.target.length));
        blank.setAttribute('aria-label', 'missing letters');
        word.append(gap.before, blank, gap.after);
      } else {
        word.textContent = canHear(c) ? '?' : (c.sound || '?');
      }
      front.append(word);
      if (!gap && c.speech.length) front.append(el('p', 'flashcards-hint', 'Listen, then name the spelling'));
    } else {
      const big = el('p', 'flashcards-letter', c.front);
      big.lang = 'pl';
      front.append(el('p', 'flashcards-prompt', 'How does this sound?'), big);
    }
  }

  function renderBack(c) {
    back.textContent = '';
    const letter = el('p', 'flashcards-letter flashcards-letter-small', c.front);
    letter.lang = 'pl';
    back.append(letter);
    if (c.sound) back.append(el('p', 'flashcards-sound', c.sound));
    if (c.tipEl) back.append(c.tipEl.cloneNode(true));
    if (c.exampleEl) {
      const example = c.exampleEl.cloneNode(true);
      example.lang = 'pl';
      back.append(example);
    }
  }

  function renderSummary() {
    stopSpeaking();
    summary.textContent = '';
    const learned = learnedCount();
    summary.append(
      el('h2', '', state.sessionSize ? 'Dobra robota!' : 'Nothing to practise'),
      el('p', '', state.sessionSize
        ? `You knew ${state.firstTry} of ${state.sessionSize} cards first time.`
        : 'You have learned every card in this deck.'),
      el('p', '', `${learned} of ${cards.length} learned in this deck.`),
    );
    if (learned < cards.length) {
      summary.append(el('p', 'flashcards-summary-tip', `A card counts as learned once you know it in ${LEARNED_BOX} sessions. Come back tomorrow!`));
    }
    const again = button('primary', state.missed.size ? 'Practise the tricky ones' : 'Practise again');
    again.addEventListener('click', () => {
      // eslint-disable-next-line no-use-before-define
      startSession(state.missed.size ? [...state.missed] : null);
    });
    const all = button('secondary', 'Practise all cards');
    all.addEventListener('click', () => {
      focusToggle.querySelector('[data-value="all"]').click();
    });
    const home = el('a', 'button secondary', 'All decks');
    home.href = '/';
    const buttons = el('div', 'flashcards-summary-actions');
    buttons.append(again);
    if (!state.sessionSize || state.focus) buttons.append(all);
    buttons.append(home);
    summary.append(buttons);
  }

  function renderCard() {
    const c = current();
    const finished = !c;
    stage.hidden = finished;
    actions.hidden = finished;
    toolbar.hidden = false;
    summary.hidden = !finished;
    updateStatus();
    if (finished) {
      note.hidden = true;
      renderSummary();
      summary.querySelector('button')?.focus({ preventScroll: true });
      return;
    }
    card.classList.remove('is-entering');
    renderFront(c);
    renderBack(c);
    setFlipped(false);
    hearBtn.hidden = !canHear(c);
    note.hidden = !state.voiceChecked || state.canSpeak || !c.speech.length || Boolean(c.audio);
    // restart the entrance animation
    // eslint-disable-next-line no-unused-expressions
    card.offsetWidth;
    card.classList.add('is-entering');
  }

  function startSession(only = null) {
    stopSpeaking();
    let pool = only || cards;
    if (!only && state.focus) pool = cards.filter((c) => boxOf(c) < LEARNED_BOX);
    // weakest cards first, shuffled within each box
    state.queue = shuffle(pool).sort((a, b) => boxOf(a) - boxOf(b));
    state.sessionSize = state.queue.length;
    state.done = new Set();
    state.missed = new Set();
    state.firstTry = 0;
    renderCard();
  }

  function grade(known) {
    const c = current();
    if (!c || !state.flipped) return;
    const box = boxOf(c);
    progress.boxes[c.id] = known ? Math.min(box + 1, MAX_BOX) : 0;
    save();
    state.queue.shift();
    if (known) {
      if (!state.missed.has(c)) state.firstTry += 1;
      state.done.add(c);
    } else {
      state.missed.add(c);
      state.queue.splice(Math.min(SEE_AGAIN_AFTER, state.queue.length), 0, c);
    }
    renderCard();
  }

  function flip() {
    if (!current()) return;
    setFlipped(!state.flipped);
    if (state.flipped && state.mode === 'spell') hear();
  }

  // ---- events ----
  card.addEventListener('click', () => {
    if (card.dataset.dragged) {
      delete card.dataset.dragged;
      return;
    }
    flip();
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      flip();
    }
  });
  flipBtn.addEventListener('click', flip);
  hearBtn.addEventListener('click', hear);
  againBtn.addEventListener('click', () => grade(false));
  knowBtn.addEventListener('click', () => grade(true));
  resetBtn.addEventListener('click', () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Forget your progress in “${title}”?`)) return;
    clearDeck(deckId);
    progress = readDeck(deckId);
    startSession();
  });

  // swipe right = got it, swipe left = again (once the answer is showing)
  let drag = null;
  card.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, dx: 0 };
    try {
      card.setPointerCapture(e.pointerId);
    } catch (err) {
      // not supported; swipes still work while the pointer stays on the card
    }
  });
  card.addEventListener('pointermove', (e) => {
    if (!drag || !state.flipped) return;
    drag.dx = e.clientX - drag.x;
    if (Math.abs(drag.dx) < 10 || Math.abs(drag.dx) < Math.abs(e.clientY - drag.y)) return;
    card.classList.add('is-dragging');
    card.style.setProperty('--drag', `${drag.dx}px`);
    card.dataset.swipe = drag.dx > 0 ? 'know' : 'again';
  });
  const endDrag = () => {
    if (!drag) return;
    const { dx } = drag;
    drag = null;
    card.classList.remove('is-dragging');
    card.style.removeProperty('--drag');
    delete card.dataset.swipe;
    if (state.flipped && Math.abs(dx) > 80) {
      card.dataset.dragged = 'true';
      grade(dx > 0);
    } else if (Math.abs(dx) > 10) {
      card.dataset.dragged = 'true';
    }
  };
  card.addEventListener('pointerup', endDrag);
  card.addEventListener('pointercancel', endDrag);
  card.addEventListener('pointerleave', endDrag);

  // keyboard shortcuts go to the deck most recently used
  block.addEventListener('pointerdown', () => { keyboardOwner = block; });
  block.addEventListener('focusin', () => { keyboardOwner = block; });
  if (!keyboardOwner) keyboardOwner = block;
  document.addEventListener('keydown', (e) => {
    if (keyboardOwner !== block || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'ArrowRight') grade(true);
    else if (e.key === 'ArrowLeft') grade(false);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      flip();
    } else if (e.key.toLowerCase() === 'h') hear();
  });

  startSession();

  // speech voices load asynchronously
  getPolishVoice().then((voice) => {
    state.canSpeak = Boolean(voice);
    state.voiceChecked = true;
    note.textContent = 'To hear words, add a Polish voice in your device’s text-to-speech settings.';
    const c = current();
    hearBtn.hidden = !canHear(c);
    note.hidden = state.canSpeak || !c || !c.speech.length || Boolean(c.audio);
  });
}
