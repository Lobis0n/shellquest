/**
 * Panel lateral: mapa de progreso, historia, objetivos y pistas.
 * @module ui/sidebar
 */
import { el, escapeHtml } from './dom.js';

export class Sidebar {
  /**
   * @param {HTMLElement} root
   * @param {{game: import('../game/game.js').Game, onRunCommand:(cmd:string)=>void, onJump:(index:number)=>void}} opts
   */
  constructor(root, { game, onRunCommand, onJump }) {
    this.root = root;
    this.game = game;
    this.onRunCommand = onRunCommand;
    this.onJump = onJump;

    this.map = root.querySelector('[data-map]');
    this.chapter = root.querySelector('[data-chapter]');
    this.title = root.querySelector('[data-title]');
    this.story = root.querySelector('[data-story]');
    this.objectives = root.querySelector('[data-objectives]');
    this.commands = root.querySelector('[data-commands]');
    this.hints = root.querySelector('[data-hints]');
    this.hintButton = root.querySelector('[data-hint-button]');
    this.levelCard = root.querySelector('[data-level-card]');

    this.hintButton.addEventListener('click', () => {
      this.game.revealHint();
      this.renderHints();
    });
    this.commands.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-man]');
      if (chip) this.onRunCommand(`man ${chip.dataset.man}`);
    });
    this.map.addEventListener('click', (e) => {
      const node = e.target.closest('[data-level]');
      if (node && !node.disabled) this.onJump(Number(node.dataset.level));
    });
  }

  render() {
    this.renderMap();
    this.renderLevel();
  }

  renderMap() {
    const { state, levels } = this.game;
    const nodes = levels.map((lvl, i) => {
      const done = i < state.level || state.finished;
      const current = i === state.level && !state.finished;
      const unlocked = i <= state.unlocked;
      const cls = ['map__node', done && 'is-done', current && 'is-current'].filter(Boolean).join(' ');
      const label = unlocked ? `Nivel ${i + 1}: ${lvl.title}` : `Nivel ${i + 1}: bloqueado`;
      return `<button class="${cls}" data-level="${i}" ${unlocked ? '' : 'disabled'} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${i + 1}</button>`;
    });
    const chest = `<span class="map__chest${state.finished ? ' is-open' : ''}" title="El tesoro" aria-hidden="true">${state.finished ? '💰' : '🔒'}</span>`;
    this.map.innerHTML = nodes.join('') + chest;
  }

  renderLevel() {
    const lvl = this.game.level;
    this.chapter.textContent = `${lvl.chapter} · Nivel ${this.game.index + 1}/${this.game.levels.length}`;
    this.title.textContent = lvl.title;
    this.story.innerHTML = lvl.story.map((p) => `<p>${p}</p>`).join('');
    this.commands.innerHTML = lvl.commands
      .map((c) => {
        const base = c.split(/\s/)[0];
        const manable = /^[a-z][\w-]*$/.test(base) && !['i'].includes(base);
        return manable
          ? `<button class="chip" data-man="${escapeHtml(base)}" title="Ver: man ${escapeHtml(base)}">${escapeHtml(c)}</button>`
          : `<span class="chip chip--static">${escapeHtml(c)}</span>`;
      })
      .join('');
    this.renderObjectives(this.game.objectiveStatus());
    this.renderHints();
    this.levelCard.classList.remove('is-entering');
    void this.levelCard.offsetWidth;
    this.levelCard.classList.add('is-entering');
  }

  renderObjectives(status) {
    this.objectives.innerHTML = status
      .map((o) => `<li class="objective${o.done ? ' is-done' : ''}"><span class="objective__check" aria-hidden="true">${o.done ? '✔' : ''}</span><span>${o.text}</span><span class="sr-only">${o.done ? '(cumplido)' : '(pendiente)'}</span></li>`)
      .join('');
  }

  renderHints() {
    const lvl = this.game.level;
    const shown = this.game.hintsShown();
    this.hints.innerHTML = lvl.hints.slice(0, shown)
      .map((h, i) => `<li class="hint"><span class="hint__n">${i + 1}</span><span>${h}</span></li>`)
      .join('');
    const left = lvl.hints.length - shown;
    this.hintButton.disabled = left === 0;
    this.hintButton.textContent = left === 0 ? 'Sin más pistas' : `💡 Mostrar pista (${shown + 1}/${lvl.hints.length})`;
  }
}
