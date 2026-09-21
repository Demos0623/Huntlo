export function isPerfMode() {
  try { return localStorage.getItem('valo_perf') === '1'; } catch (_) { return false; }
}
export function setPerfMode(on) {
  try { localStorage.setItem('valo_perf', on ? '1' : '0'); } catch (_) {  }
}
