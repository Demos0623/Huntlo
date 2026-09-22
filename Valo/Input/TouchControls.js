const LAYOUT_KEY = 'valo_touch_layout';
const SENS_KEY = 'valo_touch_sens';

export class TouchControls {
  static isTouchDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
  }

  constructor(root) {
    this.engaged = false;
    this.editMode = false;
    this.lookFactor = this._loadSens();
    this._move = { f: false, b: false, l: false, r: false };
    this._held = new Set();
    this._pressed = new Set();
    this._look = { dx: 0, dy: 0 };
    this._build(root);
    this._bindZones();
    this._bindButtons();
    this._bindEditor();
    this._applyLayout(this._loadLayout());
  }

  isDown(action) {
    if (this.editMode) return false;
    switch (action) {
      case 'moveForward': return this._move.f;
      case 'moveBack': return this._move.b;
      case 'moveLeft': return this._move.l;
      case 'moveRight': return this._move.r;
      default: return this._held.has(action);
    }
  }
  wasPressed(action) { return this.editMode ? false : this._pressed.has(action); }
  consumeLook() {
    if (this.editMode) { this._look.dx = 0; this._look.dy = 0; return { dx: 0, dy: 0 }; }
    const d = { dx: this._look.dx, dy: this._look.dy }; this._look.dx = 0; this._look.dy = 0; return d;
  }
  endFrame() { this._pressed.clear(); }
  setVisible(v) { this.root.hidden = !v; }

  _build(root) {
    this.root = document.createElement('div');
    this.root.id = 'v-touch';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div id="tc-mobile-badge">MOBILE CONTROLS</div>
      <div id="tc-move"><div id="tc-stick"></div></div>
      <div id="tc-look"></div>
      <button id="tc-edit" class="tc-customize" type="button">⚙&nbsp; CUSTOMIZE CONTROLS</button>
      <div id="tc-buttons">
        <button class="tc-btn tc-w" data-press="slotMelee">3</button>
        <button class="tc-btn tc-w" data-press="slotSecondary">2</button>
        <button class="tc-btn tc-w" data-press="slotPrimary">1</button>
        <button class="tc-btn" data-press="reload">RELOAD</button>
        <button class="tc-btn" data-hold="crouch">CROUCH</button>
        <button class="tc-btn" data-press="jump">JUMP</button>
        <button class="tc-btn tc-aim" data-hold="altAction">AIM</button>
        <button class="tc-btn tc-fire" data-hold="fire">FIRE</button>
      </div>
      <div id="tc-editbar" hidden>
        <span class="tc-edit-title">CUSTOMIZE CONTROLS</span>
        <span class="tc-edit-hint">Drag buttons to move them</span>
        <label class="tc-edit-sens">Look&nbsp;sens
          <input id="tc-sens" type="range" min="4" max="34" step="1" />
        </label>
        <button id="tc-reset" class="tc-edit-b">RESET</button>
        <button id="tc-done" class="tc-edit-b tc-edit-done">DONE</button>
      </div>`;
    root.appendChild(this.root);
    this.$ = (s) => this.root.querySelector(s);
    this.buttons = [...this.root.querySelectorAll('#tc-buttons .tc-btn')];
  }

  _actionOf(b) { return b.dataset.hold || b.dataset.press; }

  _bindButtons() {
    for (const b of this.buttons) {
      const hold = b.dataset.hold, press = b.dataset.press;
      const onStart = (e) => {
        if (this.editMode) return;
        e.preventDefault(); e.stopPropagation();
        b.classList.add('tc-active');
        if (hold) { this._held.add(hold); this._pressed.add(hold); }
        if (press) this._pressed.add(press);
      };
      const onEnd = (e) => {
        if (this.editMode) return;
        e.preventDefault(); e.stopPropagation();
        b.classList.remove('tc-active');
        if (hold) this._held.delete(hold);
      };
      b.addEventListener('touchstart', onStart, { passive: false });
      b.addEventListener('touchend', onEnd, { passive: false });
      b.addEventListener('touchcancel', onEnd, { passive: false });
    }
  }

  _bindZones() {
    const moveZone = this.$('#tc-move');
    const stick = this.$('#tc-stick');
    const lookZone = this.$('#tc-look');
    const R = 55;
    let baseX = 0, baseY = 0, moveId = null;
    const setStick = (dx, dy) => {
      const len = Math.hypot(dx, dy) || 1, cl = Math.min(len, R);
      stick.style.transform = `translate(${(dx / len) * cl}px, ${(dy / len) * cl}px)`;
      const fx = dx / R, fy = dy / R, dead = 0.35;
      this._move.r = fx > dead; this._move.l = fx < -dead;
      this._move.b = fy > dead; this._move.f = fy < -dead;
    };
    const reset = () => { stick.style.transform = 'translate(0,0)'; this._move.f = this._move.b = this._move.l = this._move.r = false; };
    moveZone.addEventListener('touchstart', (e) => { if (this.editMode) return; e.preventDefault(); const t = e.changedTouches[0]; moveId = t.identifier; baseX = t.clientX; baseY = t.clientY; }, { passive: false });
    moveZone.addEventListener('touchmove', (e) => { if (this.editMode) return; e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === moveId) setStick(t.clientX - baseX, t.clientY - baseY); }, { passive: false });
    const endMove = (e) => { for (const t of e.changedTouches) if (t.identifier === moveId) { moveId = null; reset(); } };
    moveZone.addEventListener('touchend', endMove, { passive: false });
    moveZone.addEventListener('touchcancel', endMove, { passive: false });

    let lookId = null, lastX = 0, lastY = 0;
    lookZone.addEventListener('touchstart', (e) => { if (this.editMode || lookId !== null) return; e.preventDefault(); const t = e.changedTouches[0]; lookId = t.identifier; lastX = t.clientX; lastY = t.clientY; }, { passive: false });
    lookZone.addEventListener('touchmove', (e) => { if (this.editMode) return; e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === lookId) { this._look.dx += (t.clientX - lastX) * this.lookFactor; this._look.dy += (t.clientY - lastY) * this.lookFactor; lastX = t.clientX; lastY = t.clientY; } }, { passive: false });
    const endLook = (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
    lookZone.addEventListener('touchend', endLook, { passive: false });
    lookZone.addEventListener('touchcancel', endLook, { passive: false });
  }

  _bindEditor() {
    this.$('#tc-edit').addEventListener('click', (e) => { e.stopPropagation(); this._enterEdit(); });
    this.$('#tc-done').addEventListener('click', (e) => { e.stopPropagation(); this._exitEdit(); });
    this.$('#tc-reset').addEventListener('click', (e) => { e.stopPropagation(); this._resetLayout(); });
    const sens = this.$('#tc-sens');
    sens.value = String(this.lookFactor);
    sens.addEventListener('input', () => { this.lookFactor = +sens.value; this._saveSens(); });

    let drag = null;
    const onDown = (e) => {
      if (!this.editMode) return;
      e.preventDefault(); e.stopPropagation();
      drag = e.currentTarget;
      drag.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (!drag) return;
      e.preventDefault();
      const w = drag.offsetWidth, h = drag.offsetHeight;
      let right = window.innerWidth - e.clientX - w / 2;
      let bottom = window.innerHeight - e.clientY - h / 2;
      right = Math.max(0, Math.min(window.innerWidth - w, right));
      bottom = Math.max(0, Math.min(window.innerHeight - h, bottom));
      drag.style.left = 'auto'; drag.style.top = 'auto';
      drag.style.right = right + 'px'; drag.style.bottom = bottom + 'px';
    };
    const onUp = () => { if (drag) { drag = null; this._saveLayout(); } };
    for (const b of this.buttons) b.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  _enterEdit() { this.editMode = true; this.root.classList.add('tc-editing'); this.$('#tc-editbar').hidden = false; }
  _exitEdit() { this.editMode = false; this.root.classList.remove('tc-editing'); this.$('#tc-editbar').hidden = true; }

  _applyLayout(layout) {
    if (!layout) return;
    for (const b of this.buttons) {
      const p = layout[this._actionOf(b)];
      if (p) { b.style.left = 'auto'; b.style.top = 'auto'; b.style.right = p.right + 'px'; b.style.bottom = p.bottom + 'px'; }
    }
  }

  _saveLayout() {
    const layout = {};
    for (const b of this.buttons) {
      const r = b.getBoundingClientRect();
      layout[this._actionOf(b)] = {
        right: Math.round(window.innerWidth - r.right),
        bottom: Math.round(window.innerHeight - r.bottom),
      };
    }
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch (_) {  }
  }

  _resetLayout() {
    try { localStorage.removeItem(LAYOUT_KEY); } catch (_) {  }
    for (const b of this.buttons) { b.style.right = ''; b.style.bottom = ''; b.style.left = ''; b.style.top = ''; }
  }

  _loadLayout() { try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null'); } catch (_) { return null; } }
  _loadSens() { try { const v = +localStorage.getItem(SENS_KEY); return v >= 4 && v <= 40 ? v : 13; } catch (_) { return 13; } }
  _saveSens() { try { localStorage.setItem(SENS_KEY, String(this.lookFactor)); } catch (_) {  } }
}
