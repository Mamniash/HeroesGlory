/**
 * The town theme of the faction picker (docs/rules.md §2.7): plays on the
 * faction's confirm screen, only on this client (no socket), looped, on the
 * «Интерфейс» volume channel; switches with the faction, fades out on «Нет»,
 * on confirm and when the window closes. Playlists are not touched.
 *
 * Pure apart from the default `play` (Foundry's AudioHelper), which tests
 * replace — so the switching and the race guard are unit-tested.
 */

/** How long a theme fades out when it stops, ms. */
export const THEME_FADE_MS = 1000;

/**
 * What to do when the screen wants `wanted` while `playing` is on.
 * @param {string|null} playing   the theme's src now, or null
 * @param {string|null} wanted    the screen's theme src, or null
 * @returns {'keep'|'start'|'switch'|'stop'}
 */
export function themeAction(playing, wanted) {
  if ((playing ?? null) === (wanted ?? null)) return 'keep';
  if (!wanted) return 'stop';
  return playing ? 'switch' : 'start';
}

/**
 * Starts a looped sound on this client only.
 * @param {string} src
 * @returns {Promise<{stop: Function}>}
 */
function playLocally(src) {
  return foundry.audio.AudioHelper.play({ src, channel: 'interface', volume: 1, loop: true }, false);
}

/** One picker window's theme. */
export class PickerThemePlayer {
  /** @type {(src: string) => Promise<{stop: Function}>} */
  #play;

  /** @type {string|null} the theme asked for last */
  #src = null;

  /** @type {{stop: Function}|null} */
  #sound = null;

  /** Bumped on every change — a sound that loads after a newer change is stale. */
  #request = 0;

  /** @param {{play?: (src: string) => Promise<{stop: Function}>}} [options] */
  constructor({ play = playLocally } = {}) {
    this.#play = play;
  }

  /**
   * Makes `src` the playing theme (null — none): the current one fades out,
   * the new one starts. A sound that finishes loading after the window
   * closed or another theme was asked for is stopped at once.
   * @param {string|null} src
   * @returns {Promise<void>}
   */
  async set(src) {
    const action = themeAction(this.#src, src);
    if (action === 'keep') return;
    this.#src = src ?? null;
    const request = ++this.#request;
    this.#sound?.stop({ fade: THEME_FADE_MS });
    this.#sound = null;
    if (action === 'stop') return;
    let sound;
    try {
      sound = await this.#play(src);
    } catch (err) {
      console.warn(`heroes-glory | faction theme "${src}" did not play`, err);
      return;
    }
    if (request !== this.#request) {
      sound?.stop();
      return;
    }
    this.#sound = sound ?? null;
  }
}
