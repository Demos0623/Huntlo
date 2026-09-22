const MAX_MESSAGE_BYTES = 8192;
const VALID_WEAPONS = new Set(['classic','shorty','frenzy','ghost','marker','stinger','spectre','bulldog','guardian','phantom','vantage','bucky','judge','marshal','outlaw','operator','ares','odin','karambit']);

export default {
  fetch(request, env) {
    const upgrade = request.headers.get('Upgrade');
    if (upgrade?.toLowerCase() !== 'websocket') {
      return new Response('Huntlo relay OK\n', { headers: { 'content-type': 'text/plain' } });
    }
    return env.HUNTLO_ROOM.get(env.HUNTLO_ROOM.idFromName('global')).fetch(request);
  },
};

export class HuntloRoom {
  constructor(state) {
    this.state = state;
    this.players = new Map();
    this.nextId = 1;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Huntlo relay OK\n');
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const id = this.nextId++;
    const peers = [...this.players.keys()];
    const player = { id, socket: server, seq: -1, view: null };
    this.players.set(id, player);
    this.send(player, { t: 'welcome', id, peers });
    this.send(player, { t: 'snapshot', players: [...this.players.values()].filter(p => p.id !== id && p.view).map(p => p.view) });
    this.broadcast({ t: 'join', id }, id);
    server.addEventListener('message', event => this.message(player, event));
    server.addEventListener('close', () => this.leave(id));
    server.addEventListener('error', () => this.leave(id));
    return new Response(null, { status: 101, webSocket: client });
  }

  message(player, event) {
    if (typeof event.data !== 'string' || event.data.length > MAX_MESSAGE_BYTES) return;
    let data; try { data = JSON.parse(event.data); } catch { return; }
    if (!data || typeof data !== 'object') return;
    if (data.t === 'ping') return this.send(player, { t: 'pong', seq: data.seq });
    if (data.t === 'state') {
      const state = this.cleanState(player, data);
      if (state) this.broadcast(state, player.id);
      return;
    }
    data.id = player.id;
    this.broadcast(data, player.id);
  }

  cleanState(player, d) {
    const finite = (...v) => v.every(Number.isFinite);
    if (!finite(d.x, d.y, d.z)) return null;
    const yaw = Number.isFinite(d.yaw) ? d.yaw : 0;
    const pitch = Number.isFinite(d.pitch) ? d.pitch : 0;
    const seq = Number.isInteger(d.seq) ? d.seq : player.seq + 1;
    // Keep an older state from overwriting a newer position after a delayed
    // client send. WebSockets preserve order normally; this is a safe guard
    // for reconnects and relay-edge timing.
    if (seq <= player.seq) return null;
    player.seq = seq;
    player.view = { t:'state', id:player.id, x:d.x, y:d.y, z:d.z, yaw, pitch,
      moving:!!d.moving, stance:d.stance === 'crouch' ? 'crouch' : 'stand', grounded:!!d.grounded,
      seq:player.seq, wid:VALID_WEAPONS.has(d.wid) ? d.wid : 'vantage', hp:Number.isFinite(d.hp) ? d.hp : 150,
      dead:!!d.dead, team:d.team === 'defender' ? 'defender' : 'attacker', flashed:!!d.flashed,
      muscle:!!d.muscle,
      name:String(d.name || `Player ${player.id}`).slice(0, 16) };
    return player.view;
  }

  send(player, value) { try { player.socket.send(JSON.stringify(value)); } catch { this.leave(player.id); } }
  broadcast(value, except) { for (const player of this.players.values()) if (player.id !== except) this.send(player, value); }
  leave(id) { if (!this.players.delete(id)) return; this.broadcast({ t: 'leave', id }); }
}
