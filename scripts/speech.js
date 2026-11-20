/**
 * Polish text-to-speech using the device's own voices (works offline once
 * a Polish voice is installed), with authored audio files as an override.
 */

let voicePromise;

function findPolishVoice() {
  const voices = window.speechSynthesis.getVoices();
  const polish = voices.filter((v) => (v.lang || '').toLowerCase().replace('_', '-').startsWith('pl'));
  // prefer on-device voices so audio keeps working offline
  return polish.find((v) => v.localService) || polish[0] || null;
}

/**
 * Resolves to a Polish SpeechSynthesisVoice, or null if the device has none.
 * @returns {Promise<SpeechSynthesisVoice|null>}
 */
export function getPolishVoice() {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    return Promise.resolve(null);
  }
  if (!voicePromise) {
    voicePromise = new Promise((resolve) => {
      const voice = findPolishVoice();
      if (voice) {
        resolve(voice);
        return;
      }
      const timer = setTimeout(() => resolve(findPolishVoice()), 2000);
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        const found = findPolishVoice();
        if (found) {
          clearTimeout(timer);
          resolve(found);
        }
      });
    });
  }
  return voicePromise;
}

let currentAudio;

/**
 * Stops anything currently being spoken or played.
 */
export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

/**
 * Plays an audio file.
 * @param {string} src Audio URL
 * @returns {Promise<boolean>} whether playback started
 */
export async function playAudio(src) {
  stopSpeaking();
  try {
    currentAudio = new Audio(src);
    await currentAudio.play();
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Speaks one or more Polish words or phrases, in order.
 * @param {string[]} phrases Text to speak
 * @param {object} [options]
 * @param {number} [options.rate] Speech rate (1 = normal)
 * @returns {Promise<boolean>} whether speech was attempted
 */
export async function speak(phrases, { rate = 0.8 } = {}) {
  const voice = await getPolishVoice();
  if (!voice || !phrases.length) return false;
  stopSpeaking();
  phrases.forEach((phrase) => {
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.voice = voice;
    utterance.lang = voice.lang || 'pl-PL';
    utterance.rate = rate;
    window.speechSynthesis.speak(utterance);
  });
  return true;
}
