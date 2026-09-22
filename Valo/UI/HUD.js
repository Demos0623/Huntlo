import { HUDConfig as H } from '../config.js';

export class HUD {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div id="v-crosshair" aria-hidden="true">
        <div class="v-ch v-ch-t"></div><div class="v-ch v-ch-b"></div>
        <div class="v-ch v-ch-l"></div><div class="v-ch v-ch-r"></div>
        <div id="v-dot"></div>
      </div>
      <div id="v-hitmarker" aria-hidden="true">
        <div class="v-hm v-hm-t"></div><div class="v-hm v-hm-b"></div>
        <div class="v-hm v-hm-l"></div><div class="v-hm v-hm-r"></div>
      </div>
      <div id="v-netstats">-- FPS · -- ms</div>
      <button id="v-network-toggle" type="button" aria-expanded="false">NETWORK</button>
      <section id="v-network-panel" hidden aria-label="Network statistics">
        <div class="v-network-title"><span>NETWORK</span><span id="v-network-state">CONNECTING</span></div>
        <div class="v-network-grid">
          <span>PING</span><b id="v-network-ping">--</b>
          <span>JITTER</span><b id="v-network-jitter">--</b>
          <span>PACKET LOSS</span><b id="v-network-loss">--</b>
          <span>STATE GAPS</span><b id="v-network-gaps">0</b>
          <span>SMOOTHING</span><b id="v-network-smoothing">--</b>
          <span>UPDATES</span><b id="v-network-rate">--</b>
          <span>BUFFER</span><b id="v-network-buffer">0 B</b>
          <span>RECONNECTS</span><b id="v-network-reconnects">0</b>
        </div>
      </section>
      <div id="v-scoreboard" hidden>
        <div class="sb-title">SCOREBOARD</div>
        <div class="sb-head"><span>PLAYER</span><span>K</span><span>D</span></div>
        <div class="sb-rows"></div>
      </div>
      <div id="v-damage" aria-hidden="true"></div>
      <div id="v-death" hidden>
        <div class="v-death-title">ELIMINATED</div>
        <button id="v-respawn" type="button">RESPAWN</button>
      </div>
      <div id="v-bottom-left">
        <div id="v-hp-row">
          <div id="v-health"><span class="v-num">100</span></div>
          <div id="v-shield" hidden><span class="v-num">0</span></div>
        </div>
        <div id="v-credits"><span class="v-num">0</span></div>
      </div>
      <div id="v-bottom-right">
        <div id="v-wname">—</div>
        <div id="v-ammo"><span id="v-mag">0</span><span id="v-sep">/</span><span id="v-reserve">0</span></div>
        <div id="v-mode"></div>
        <div id="v-status"></div>
      </div>
      <div id="v-toast"></div>
      <div id="v-killfeed"></div>
      <div id="v-killbanner">
        <svg class="v-kb-art" viewBox="0 0 220 200" aria-hidden="true">
          <g class="v-kb-brackets" fill="none" stroke="#f2f4f7" stroke-width="5" stroke-linecap="round">
            <path d="M46 54 A 80 80 0 0 0 46 130"/>
            <path d="M174 54 A 80 80 0 0 1 174 130"/>
          </g>
          <g class="v-kb-ring" fill="none" stroke="#f2f4f7" stroke-width="3" stroke-linecap="round">
            <circle cx="110" cy="92" r="66" stroke-dasharray="72 32" stroke-dashoffset="18"/>
            <line x1="110" y1="12" x2="110" y2="24"/>
            <line x1="99" y1="18" x2="121" y2="18" stroke-width="2"/>
            <line x1="110" y1="160" x2="110" y2="170"/>
            <line x1="30" y1="92" x2="40" y2="92" stroke-width="2"/>
            <line x1="180" y1="92" x2="190" y2="92" stroke-width="2"/>
            <g stroke-width="2" opacity="0.85">
              <line x1="52" y1="46" x2="60" y2="54"/><line x1="58" y1="42" x2="66" y2="50"/>
              <line x1="168" y1="46" x2="160" y2="54"/><line x1="162" y1="42" x2="154" y2="50"/>
              <line x1="52" y1="138" x2="60" y2="130"/><line x1="168" y1="138" x2="160" y2="130"/>
            </g>
            <line x1="110" y1="140" x2="110" y2="150"/>
            <circle cx="110" cy="154" r="3.5"/>
          </g>
          <g class="v-kb-skull">
            <path class="kb-white" fill="#f2f4f7" d="M110 44 c -24 0 -42 17 -42 40 c 0 14 6 25 16 32 l 0 14 c 0 6 5 10 11 10 l 30 0 c 6 0 11 -4 11 -10 l 0 -14 c 10 -7 16 -18 16 -32 c 0 -23 -18 -40 -42 -40 z"/>
            <path class="kb-dark" fill="#12161e" d="M85 80 l 22 6 l -4 19 l -20 -8 z"/>
            <path class="kb-dark" fill="#12161e" d="M135 80 l -22 6 l 4 19 l 20 -8 z"/>
            <path class="kb-accent" fill="#e0333a" d="M83 75 l 24 6 l -2 6 l -23 -7 z"/>
            <path class="kb-accent" fill="#e0333a" d="M137 75 l -24 6 l 2 6 l 23 -7 z"/>
            <path class="kb-accent-s" fill="none" stroke="#e0333a" stroke-width="2.6" stroke-linejoin="round" d="M110 52 l 10 10 l -10 10 l -10 -10 z"/>
            <line class="kb-accent-s" x1="110" y1="55" x2="110" y2="69" stroke="#e0333a" stroke-width="2"/>
            <path class="kb-dark" fill="#12161e" d="M110 98 l 6 13 l -12 0 z"/>
            <g class="kb-dark" stroke="#12161e" stroke-width="2.4">
              <line x1="99" y1="120" x2="99" y2="134"/>
              <line x1="110" y1="120" x2="110" y2="137"/>
              <line x1="121" y1="120" x2="121" y2="134"/>
            </g>
          </g>
        </svg>
      </div>
      <div id="v-scope" hidden>
        <div class="v-scope-dim"></div>
        <div class="v-scope-lens"></div>
        <div class="v-scope-glass"></div>
        <div class="v-scope-ring"></div>
        <div id="v-scope-reticle"></div>
      </div>
    `;
    this.$ = (id) => root.querySelector(id);
    this._hitTimer = 0;
    this._toastTimer = 0;
    this._bannerTimer = 0;
    this._setGap(H.crosshairBaseGap);
    const networkButton = this.$('#v-network-toggle');
    networkButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleNetworkPanel();
    });
    window.addEventListener('keydown', (e) => {
      // Support both the typed character and the physical Shift+- key, which
      // browsers report differently on some keyboard layouts. N is an
      // unbound in-game fallback for layouts where the underscore is awkward.
      const networkShortcut = e.key === '_' || (e.code === 'Minus' && e.shiftKey) || e.code === 'KeyN';
      if (e.repeat || !networkShortcut) return;
      const active = document.activeElement;
      if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
      e.preventDefault();
      this.toggleNetworkPanel();
    });
  }

  setHealth(hp) {
    this.$('#v-health .v-num').textContent = Math.max(0, Math.round(hp));
  }

  showDamage(intensity = 1) {
    const el = this.$('#v-damage');
    const peak = Math.min(0.85, 0.35 + intensity * 0.5);
    el.style.transition = 'none';
    el.style.opacity = String(peak);
    void el.offsetWidth;
    el.style.transition = 'opacity 500ms ease';
    el.style.opacity = '0';
  }

  showDeath(onRespawn) {
    const d = this.$('#v-death');
    d.hidden = false;
    const b = this.$('#v-respawn');
    b.onclick = (e) => { e.stopPropagation(); d.hidden = true; if (onRespawn) onRespawn(); };
  }

  hideDeath() { this.$('#v-death').hidden = true; }

  showScoreboard(on) { this.$('#v-scoreboard').hidden = !on; }
  setScoreboard(rows) {
    const el = this.$('#v-scoreboard .sb-rows');
    el.innerHTML = rows.map((r) =>
      `<div class="sb-row${r.me ? ' sb-me' : ''}"><span>${this._esc(r.name)}</span><span>${r.kills}</span><span>${r.deaths}</span></div>`
    ).join('');
  }
  _esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  setNetStats(fps, ping, jitter = null) {
    const el = this.$('#v-netstats');
    const net = ping == null ? '--' : `${ping} ms${jitter == null ? '' : ` · ±${jitter}`}`;
    el.textContent = `${fps} FPS · ${net}`;
    el.classList.toggle('v-net-bad', ping != null && (ping > 120 || jitter > 35));
    el.classList.toggle('v-net-warn', ping != null && !el.classList.contains('v-net-bad') && (ping > 60 || jitter > 15));
  }

  toggleNetworkPanel() {
    const panel = this.$('#v-network-panel');
    panel.hidden = !panel.hidden;
    this.$('#v-network-toggle').setAttribute('aria-expanded', String(!panel.hidden));
  }

  setNetworkDetails({ connected, reconnecting, ping, jitter, loss, stateGaps, txRate, rxRate, buffered, reconnects, interpolation }) {
    const set = (id, text) => { this.$(id).textContent = text; };
    const state = reconnecting ? 'RECONNECTING' : connected ? 'ONLINE' : 'OFFLINE';
    const stateEl = this.$('#v-network-state');
    stateEl.textContent = state;
    stateEl.className = `v-network-${state.toLowerCase()}`;
    set('#v-network-ping', ping == null ? '--' : `${Math.round(ping)} ms`);
    set('#v-network-jitter', jitter == null ? '--' : `±${Math.round(jitter)} ms`);
    set('#v-network-loss', loss == null ? '--' : `${loss.toFixed(1)}%`);
    set('#v-network-gaps', String(stateGaps || 0));
    set('#v-network-smoothing', interpolation == null ? '--' : `${Math.round(interpolation * 1000)} ms`);
    set('#v-network-rate', `${txRate.toFixed(0)}↑ / ${rxRate.toFixed(0)}↓ pkt/s`);
    set('#v-network-buffer', `${Math.max(0, buffered || 0).toLocaleString('en-US')} B`);
    set('#v-network-reconnects', String(reconnects || 0));
  }

  setShield(shield) {
    const el = this.$('#v-shield');
    el.hidden = !(shield > 0);
    el.querySelector('.v-num').textContent = Math.max(0, Math.round(shield));
  }

  setCredits(credits) {
    this.$('#v-credits .v-num').textContent = '₽' + (isFinite(credits) ? credits.toLocaleString('en-US') : '∞');
  }

  setWeapon(w) {
    this.$('#v-wname').textContent = w.name;

    if (w.melee) {
      this.$('#v-ammo').style.visibility = 'hidden';
      this.$('#v-mode').textContent = '';
      this.$('#v-status').textContent = ''; this.$('#v-status').className = '';
      return;
    }
    this.$('#v-ammo').style.visibility = '';
    this.$('#v-mag').textContent = w.mag;
    this.$('#v-reserve').textContent = w.reserve;
    this.$('#v-mode').textContent = '';

    const mag = this.$('#v-mag');
    const lowThreshold = Math.max(3, Math.ceil((w.capacity ?? 0) * 0.25));
    mag.classList.toggle('v-low', w.mag > 0 && w.mag <= lowThreshold);
    mag.classList.toggle('v-empty', w.empty);

    const status = this.$('#v-status');
    if (w.reloading) { status.textContent = 'RELOADING'; status.className = 'v-reloading'; }
    else if (w.equipping) { status.textContent = 'SWITCHING'; status.className = 'v-equip'; }
    else if (w.empty) { status.textContent = 'RELOAD (R)'; status.className = 'v-empty'; }
    else { status.textContent = ''; status.className = ''; }
  }

  setScoped(on, style = 'duplex') {
    if (this._scoped === on && this._scopeStyle === style) return;
    this._scoped = on;
    this._scopeStyle = style;
    this.$('#v-scope').hidden = !on;
    this.$('#v-crosshair').style.visibility = on ? 'hidden' : '';
    if (on) this.$('#v-scope-reticle').innerHTML = this._reticleSVG(style);
  }

  _reticleSVG(style) {
    const B = 'rgba(12,14,18,0.92)';
    const line = (x1, y1, x2, y2, w = 1) =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${B}" stroke-width="${w}" />`;

    let s = '';

    s += line(2, 100, 40, 100, 3) + line(40, 100, 88, 100, 1);
    s += line(160, 100, 198, 100, 3) + line(112, 100, 160, 100, 1);

    s += line(100, 2, 100, 40, 3) + line(100, 40, 100, 88, 1);
    s += line(100, 112, 100, 132, 1);

    if (style === 'mildot') {

      const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="1.6" fill="${B}" />`;
      for (const d of [26, 42, 58]) s += dot(100 - d, 100) + dot(100 + d, 100) + dot(100, 100 - d);

      s += line(88, 118, 112, 118, 1) + line(90, 128, 110, 128, 1);
    } else if (style === 'christmas') {

      const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="1.5" fill="${B}" />`;
      for (const d of [22, 40, 58, 76]) s += dot(100 - d, 100) + dot(100 + d, 100) + dot(100, 100 - d);
      const rows = [[132, 22], [144, 16], [156, 11], [168, 7]];
      for (const [y, half] of rows) {
        s += line(100 - half, y, 100 + half, y, 1);
        s += line(100, y - 4, 100, y, 0.8);
      }
    } else {

      s += line(92, 120, 108, 120, 1);
    }

    s += `<circle cx="100" cy="100" r="1.5" fill="#ff5a3c" />`;
    return `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet"
      style="width:100%;height:100%">${s}</svg>`;
  }

  setSpread(spread) {
    const gap = H.crosshairBaseGap + spread * H.crosshairSpreadPx;
    this._setGap(gap);
  }

  _setGap(gap) {
    const el = this.$('#v-crosshair');
    el.style.setProperty('--gap', gap.toFixed(1) + 'px');
    el.style.setProperty('--len', H.crosshairLen + 'px');
    el.style.setProperty('--thick', H.crosshairThickness + 'px');
  }

  onFire() {

    const el = this.$('#v-crosshair');
    el.classList.remove('v-fire');
    void el.offsetWidth;
    el.classList.add('v-fire');
  }

  showHitmarker(killed, headshot = false) {
    const hm = this.$('#v-hitmarker');
    hm.classList.toggle('v-kill', killed);
    hm.classList.toggle('v-head', headshot);
    hm.classList.remove('v-show');
    void hm.offsetWidth;
    hm.classList.add('v-show');
    this._hitTimer = (killed || headshot ? 260 : H.hitmarkerMs) / 1000;
  }

  flashWeaponSwitch(name) {
    this._toast(name);
  }

  onKill({ victim = 'DUMMY', weapon = '', headshot = false } = {}) {
    this._addKillFeed('YOU', victim, weapon, headshot);
    this._showKillBanner(headshot);
  }

  // A kill by someone else, received over the network — feed only, no banner.
  onRemoteKill({ killer = 'PLAYER', victim = 'PLAYER', weapon = '', headshot = false } = {}) {
    this._addKillFeed(killer, victim, weapon, headshot);
  }

  _addKillFeed(killer, victim, weapon, headshot) {
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const feed = this.$('#v-killfeed');
    const row = document.createElement('div');
    row.className = 'v-kill-entry' + (headshot ? ' v-hs' : '');
    row.innerHTML =
      `<span class="kf-killer">${esc(killer)}</span>` +
      `<span class="kf-weapon">${esc(weapon)}${headshot ? ' ◉' : ''}</span>` +
      `<span class="kf-victim">${esc(victim)}</span>`;
    feed.prepend(row);
    while (feed.children.length > 5) feed.removeChild(feed.lastChild);

    requestAnimationFrame(() => row.classList.add('v-in'));
    setTimeout(() => {
      row.classList.add('v-out');
      setTimeout(() => row.remove(), 400);
    }, 4000);
  }

  _showKillBanner(headshot) {
    const b = this.$('#v-killbanner');
    b.classList.toggle('v-hs', headshot);
    b.classList.remove('v-show');
    void b.offsetWidth;
    b.classList.add('v-show');
    this._bannerTimer = 1.4;
  }

  _toast(text) {
    const t = this.$('#v-toast');
    t.textContent = text;
    t.classList.remove('v-show');
    void t.offsetWidth;
    t.classList.add('v-show');
    this._toastTimer = 1.2;
  }

  update(dt) {
    if (this._hitTimer > 0) {
      this._hitTimer -= dt;
      if (this._hitTimer <= 0) this.$('#v-hitmarker').classList.remove('v-show');
    }
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) this.$('#v-toast').classList.remove('v-show');
    }
    if (this._bannerTimer > 0) {
      this._bannerTimer -= dt;
      if (this._bannerTimer <= 0) this.$('#v-killbanner').classList.remove('v-show');
    }
  }
}
