export class Net {
  constructor(url) {
    this.url = url;
    this.id = null;
    this.connected = false;
    this.handlers = {};
    this._ws = null;
    this._retry = null;
    this._connect();
  }

  on(type, fn) { this.handlers[type] = fn; return this; }

  _connect() {
    let ws;
    try { ws = new WebSocket(this.url); } catch (_) { this._scheduleRetry(); return; }
    this._ws = ws;
    ws.onopen = () => { this.connected = true; };
    ws.onclose = () => { this.connected = false; this.id = null; this._emit('down', {}); this._scheduleRetry(); };
    ws.onerror = () => { try { ws.close(); } catch (_) {} };
    ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (msg.t === 'welcome') { this.id = msg.id; this.connected = true; }
      this._emit(msg.t, msg);
    };
  }

  _scheduleRetry() {
    if (this._retry) return;
    this._retry = setTimeout(() => { this._retry = null; this._connect(); }, 1500);
  }

  _emit(type, msg) { const h = this.handlers[type]; if (h) h(msg); }

  send(obj) {
    if (this._ws && this._ws.readyState === 1) {
      try { this._ws.send(JSON.stringify(obj)); } catch (_) {}
    }
  }
}
