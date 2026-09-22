export class Net {
  constructor(url) {
    this.url = url;
    this.id = null;
    this.connected = false;
    this.handlers = {};
    this._ws = null;
    this._retry = null;
    this._attempt = 0;
    this._reconnects = 0;
    this._openedAt = 0;
    this._windowAt = performance.now();
    this._sentWindow = 0;
    this._receivedWindow = 0;
    this._txRate = 0;
    this._rxRate = 0;
    this._connect();
  }

  on(type, fn) { this.handlers[type] = fn; return this; }

  _connect() {
    let ws;
    try { ws = new WebSocket(this.url); } catch (_) { this._scheduleRetry(); return; }
    this._ws = ws;
    ws.onopen = () => {
      if (this._ws !== ws) return;
      this.connected = true;
      this._attempt = 0;
      this._openedAt = performance.now();
      this._emit('up', {});
    };
    ws.onclose = () => {
      if (this._ws !== ws) return;
      this.connected = false; this.id = null;
      this._emit('down', {});
      this._scheduleRetry();
    };
    ws.onerror = () => { try { ws.close(); } catch (_) {} };
    ws.onmessage = (ev) => {
      if (this._ws !== ws) return;
      let msg; try { msg = JSON.parse(ev.data); } catch (_) { return; }
      this._receivedWindow++;
      if (msg.t === 'welcome') { this.id = msg.id; this.connected = true; }
      this._emit(msg.t, msg);
    };
  }

  _scheduleRetry() {
    if (this._retry) return;
    // Exponential backoff with a small jitter avoids reconnect storms after a
    // Wi-Fi switch or a short relay outage, while recovering quickly at first.
    const base = Math.min(10000, 500 * (2 ** Math.min(this._attempt++, 5)));
    const wait = Math.round(base * (0.8 + Math.random() * 0.4));
    this._reconnects++;
    this._retry = setTimeout(() => { this._retry = null; this._connect(); }, wait);
  }

  _refreshRates() {
    const now = performance.now();
    const elapsed = now - this._windowAt;
    if (elapsed < 500) return;
    this._txRate = this._sentWindow * 1000 / elapsed;
    this._rxRate = this._receivedWindow * 1000 / elapsed;
    this._sentWindow = 0; this._receivedWindow = 0; this._windowAt = now;
  }

  stats() {
    this._refreshRates();
    return {
      connected: this.connected,
      reconnecting: !this.connected && !!this._retry,
      reconnects: this._reconnects,
      txRate: this._txRate,
      rxRate: this._rxRate,
      buffered: this._ws ? this._ws.bufferedAmount : 0,
    };
  }

  _emit(type, msg) { const h = this.handlers[type]; if (h) h(msg); }

  send(obj) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      try {
        this._ws.send(JSON.stringify(obj));
        this._sentWindow++;
        return true;
      } catch (_) { /* the close handler will reconnect */ }
    }
    return false;
  }
}
