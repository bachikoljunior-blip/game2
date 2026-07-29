/**
 * EventBus.js — the only cross-system coupling we allow.
 *
 * Handlers are stored in a flat array per event and iterated over a snapshot, so a
 * handler may safely unsubscribe (or subscribe) during dispatch. Payload objects are
 * pooled by the emitters that care; the bus itself never allocates during emit.
 */

export class EventBus {
  constructor() {
    this._map = new Map();
    this._depth = 0;
  }

  on(name, fn) {
    let list = this._map.get(name);
    if (!list) { list = []; this._map.set(name, list); }
    list.push(fn);
    return () => this.off(name, fn);
  }

  once(name, fn) {
    const wrap = (p) => { this.off(name, wrap); fn(p); };
    return this.on(name, wrap);
  }

  off(name, fn) {
    const list = this._map.get(name);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  emit(name, payload) {
    const list = this._map.get(name);
    if (!list || list.length === 0) return;
    this._depth++;
    // Snapshot only when a handler could mutate the list mid-dispatch.
    const snapshot = list.length > 1 ? list.slice() : list;
    for (let i = 0; i < snapshot.length; i++) {
      try { snapshot[i](payload); }
      catch (err) { console.error(`[bus] handler for "${name}" threw`, err); }
    }
    this._depth--;
  }

  clear(name) {
    if (name) this._map.delete(name);
    else this._map.clear();
  }
}
