import { Weapons, Armor, BuyColumns } from '../Weapons/WeaponData.js';

const CR = '₽';
const money = (n) => isFinite(n) ? CR + n.toLocaleString('en-US') : CR + '∞';

export class BuyMenu {
  constructor(root, { getCredits, getOwned, getInfinite, getLockedSlots, onBuyWeapon, onBuyArmor, onToggleInfinite, onToggle, getBlocked }) {
    this.getCredits = getCredits;
    this.getOwned = getOwned;
    this.getInfinite = getInfinite;
    this.getLockedSlots = getLockedSlots;
    this.getBlocked = getBlocked;
    this.onBuyWeapon = onBuyWeapon;
    this.onBuyArmor = onBuyArmor;
    this.onToggleInfinite = onToggleInfinite;
    this.onToggle = onToggle;
    this.isOpen = false;

    this.el = document.createElement('div');
    this.el.id = 'v-buymenu';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="bm-panel">
        <div class="bm-header">
          <span class="bm-title">BUY MENU</span>
          <span class="bm-credits"></span>
          <button type="button" class="bm-infinite">∞ MONEY</button>
          <span class="bm-hint">B or ESC to close</span>
          <button type="button" class="bm-close" aria-label="Close">✕</button>
        </div>
        <div class="bm-columns"></div>
      </div>`;
    root.appendChild(this.el);

    this.el.querySelector('.bm-infinite').addEventListener('click', () => {
      this.onToggleInfinite?.();
      this.refresh();
    });
    this.el.querySelector('.bm-close').addEventListener('click', () => this.close());

    this._byCategory = {};
    for (const w of Object.values(Weapons)) {
      (this._byCategory[w.category] ||= []).push(w);
    }
    for (const k in this._byCategory) this._byCategory[k].sort((a, b) => a.price - b.price);

    this._build();

    this._onKey = (e) => {
      if (e.repeat) return;
      if (this.getBlocked && this.getBlocked() && !this.isOpen) return;
      if (e.code === 'KeyB') { e.preventDefault(); this.toggle(); }
      else if (e.code === 'Escape' && this.isOpen) { e.preventDefault(); this.close(); }
    };
    window.addEventListener('keydown', this._onKey);
  }

  _build() {
    const cols = this.el.querySelector('.bm-columns');
    cols.innerHTML = '';
    for (const c of BuyColumns) {
      const col = document.createElement('div');
      col.className = 'bm-col';
      const groups = [];
      if (c.armor) groups.push({ title: c.title, armor: true });
      else {
        groups.push({ title: c.title, groups: c.groups });
        for (const ex of (c.extra || [])) groups.push(ex);
      }
      for (const grp of groups) {
        const section = document.createElement('div');
        section.className = 'bm-section';
        section.innerHTML = `<div class="bm-section-title">${grp.title}</div>`;
        const list = document.createElement('div');
        list.className = 'bm-list';
        if (grp.armor) {
          for (const a of Object.values(Armor)) list.appendChild(this._item(a.name, a.price, 'armor', a.id));
        } else {
          for (const cat of grp.groups) {
            for (const w of (this._byCategory[cat] || [])) list.appendChild(this._item(w.name, w.price, 'weapon', w.id, w.slot));
          }
        }
        section.appendChild(list);
        col.appendChild(section);
      }
      cols.appendChild(col);
    }
  }

  _item(name, price, kind, id, slot) {
    const b = document.createElement('button');
    b.className = 'bm-item';
    b.type = 'button';
    b.dataset.kind = kind; b.dataset.id = id; b.dataset.price = price; b.dataset.slot = slot || '';
    b.innerHTML = `<span class="bm-price">${price === 0 ? 'OWNED' : money(price)}</span><span class="bm-name">${name.toUpperCase()}</span>`;
    b.addEventListener('click', () => this._buy(kind, id, price));
    return b;
  }

  _buy(kind, id, price) {
    const credits = this.getCredits();
    if (price > credits) { this._flash(id, false); return; }
    const ok = kind === 'armor' ? this.onBuyArmor(id) : this.onBuyWeapon(id);
    this._flash(id, ok !== false);
    this.refresh();
  }

  _flash(id, ok) {
    const b = this.el.querySelector(`.bm-item[data-id="${id}"]`);
    if (!b) return;
    b.classList.remove('bm-bought', 'bm-deny');
    void b.offsetWidth;
    b.classList.add(ok ? 'bm-bought' : 'bm-deny');
  }

  refresh() {
    this.el.querySelector('.bm-credits').textContent = money(this.getCredits());
    const inf = this.getInfinite ? this.getInfinite() : false;
    this.el.querySelector('.bm-infinite').classList.toggle('bm-on', inf);
    this.el.querySelector('.bm-infinite').textContent = inf ? '∞ MONEY: ON' : '∞ MONEY: OFF';
    const credits = this.getCredits();
    const owned = new Set(this.getOwned ? this.getOwned() : []);
    const locked = new Set(this.getLockedSlots ? this.getLockedSlots() : []);
    for (const b of this.el.querySelectorAll('.bm-item')) {
      const price = +b.dataset.price;
      const isOwned = owned.has(b.dataset.id);

      const isLocked = b.dataset.kind === 'weapon' && locked.has(b.dataset.slot) && !isOwned;
      b.classList.toggle('bm-owned', isOwned);
      b.classList.toggle('bm-locked', isLocked);
      b.classList.toggle('bm-unaffordable', !isLocked && price > credits && !isOwned && price !== 0);
    }
  }

  open() { if (this.isOpen) return; this.isOpen = true; this.el.hidden = false; this.refresh(); this.onToggle?.(true); }
  close() { if (!this.isOpen) return; this.isOpen = false; this.el.hidden = true; this.onToggle?.(false); }
  toggle() { this.isOpen ? this.close() : this.open(); }

  dispose() { window.removeEventListener('keydown', this._onKey); this.el.remove(); }
}
