const DEFAULT_BINDINGS = {

  moveForward: ['KeyW'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],
  jump: ['Space'],
  crouch: ['ShiftLeft'],
  silentWalk: ['ControlLeft'],

  fire: ['Mouse0'],
  altAction: ['Mouse2'],
  reload: ['KeyR'],
  slotPrimary: ['Digit1'],
  slotSecondary: ['Digit2'],
  slotMelee: ['Digit3'],
  inspect: ['KeyF'],
  abilityQ: ['KeyQ'],
  abilityE: ['KeyE'],
  abilityC: ['KeyC'],
  abilityX: ['KeyX'],

  scoreboard: ['Tab'],
  menu: ['Escape'],
};

export class InputManager {
  constructor(target = document, bindings = DEFAULT_BINDINGS) {
    this.bindings = bindings;
    this.target = target;

    this._down = new Set();
    this._pressedEdge = new Set();
    this._mouse = { dx: 0, dy: 0 };
    this.pointerLocked = false;
    this._touch = null;

    this._onKeyDown = (e) => {

      if (this._isBound(e.code)) e.preventDefault();
      if (!this._down.has(e.code)) this._pressedEdge.add(e.code);
      this._down.add(e.code);
    };
    this._onKeyUp = (e) => { this._down.delete(e.code); };
    this._onMouseDown = (e) => {
      const code = 'Mouse' + e.button;
      if (!this._down.has(code)) this._pressedEdge.add(code);
      this._down.add(code);
    };
    this._onMouseUp = (e) => { this._down.delete('Mouse' + e.button); };
    this._onContext = (e) => e.preventDefault();
    this._onMouseMove = (e) => {
      if (!this.pointerLocked) return;
      this._mouse.dx += e.movementX || 0;
      this._mouse.dy += e.movementY || 0;
    };
    this._onLockChange = () => {
      this.pointerLocked = document.pointerLockElement != null;
      if (!this.pointerLocked) { this._down.clear(); this._pressedEdge.clear(); }
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    target.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    target.addEventListener('contextmenu', this._onContext);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  _isBound(code) {
    for (const codes of Object.values(this.bindings)) {
      if (codes.includes(code)) return true;
    }
    return false;
  }

  requestPointerLock(el) {

    try { const p = el.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); }
    catch (_) {  }
  }

  attachTouch(t) { this._touch = t; }

  get engaged() { return this.pointerLocked || (this._touch && this._touch.engaged); }

  isDown(action) {
    const codes = this.bindings[action];
    if (codes) for (const c of codes) if (this._down.has(c)) return true;
    return this._touch ? this._touch.isDown(action) : false;
  }

  wasPressed(action) {
    const codes = this.bindings[action];
    if (codes) for (const c of codes) if (this._pressedEdge.has(c)) return true;
    return this._touch ? this._touch.wasPressed(action) : false;
  }

  consumeMouseDelta() {
    const d = { dx: this._mouse.dx, dy: this._mouse.dy };
    this._mouse.dx = 0; this._mouse.dy = 0;
    if (this._touch) { const t = this._touch.consumeLook(); d.dx += t.dx; d.dy += t.dy; }
    return d;
  }

  endFrame() { this._pressedEdge.clear(); if (this._touch) this._touch.endFrame(); }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.target.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.target.removeEventListener('contextmenu', this._onContext);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }
}
