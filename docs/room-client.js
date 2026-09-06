(() => {
  'use strict';

  const MAX_PLAYERS = 8;

  class EncoreRoom extends EventTarget {
    constructor(config, player) {
      super();
      this.config = config || {};
      this.player = player;
      this.client = null;
      this.channel = null;
      this.connected = false;
      this.lastStateAt = 0;
      this.members = new Map();
    }

    async connect() {
      if (!this.config.url || !this.config.key || !window.supabase?.createClient) {
        this.dispatchEvent(new CustomEvent('status', { detail: { connected: false, reason: 'offline' } }));
        return false;
      }
      this.client = window.supabase.createClient(this.config.url, this.config.key, { auth: { persistSession: false } });
      const room = `bcdkc-encore-${String(this.config.roomId || 'royal').replace(/[^a-z0-9_-]/gi, '-').slice(0, 60)}`;
      this.channel = this.client.channel(room, { config: { presence: { key: this.player.id } } });
      this.channel
        .on('presence', { event: 'sync' }, () => this.syncPresence())
        .on('broadcast', { event: 'state' }, ({ payload }) => this.dispatchEvent(new CustomEvent('state', { detail: payload })))
        .on('broadcast', { event: 'hit' }, ({ payload }) => this.dispatchEvent(new CustomEvent('hit', { detail: payload })))
        .on('broadcast', { event: 'eliminated' }, ({ payload }) => this.dispatchEvent(new CustomEvent('eliminated', { detail: payload })))
        .on('broadcast', { event: 'capture' }, ({ payload }) => this.dispatchEvent(new CustomEvent('capture', { detail: payload })))
        .subscribe(status => {
          this.connected = status === 'SUBSCRIBED';
          if (this.connected) this.track();
          this.dispatchEvent(new CustomEvent('status', { detail: { connected: this.connected, reason: status } }));
        });
      return true;
    }

    async track() {
      if (!this.channel) return;
      await this.channel.track({ ...this.player, joinedAt: Date.now() });
    }

    syncPresence() {
      const state = this.channel?.presenceState?.() || {};
      const next = new Map();
      Object.entries(state).forEach(([id, entries]) => {
        const member = entries?.[0];
        if (member?.id) next.set(id, member);
      });
      const ids = [...next.keys()].sort();
      const accepted = new Set(ids.slice(0, MAX_PLAYERS));
      const wasHere = new Set(this.members.keys());
      this.members = new Map([...next].filter(([id]) => accepted.has(id)));
      for (const [id, member] of this.members) {
        if (id !== this.player.id && !wasHere.has(id)) this.dispatchEvent(new CustomEvent('join', { detail: member }));
      }
      for (const id of wasHere) {
        if (id !== this.player.id && !this.members.has(id)) this.dispatchEvent(new CustomEvent('leave', { detail: { id } }));
      }
      this.dispatchEvent(new CustomEvent('presence', { detail: { count: this.members.size, full: !accepted.has(this.player.id) } }));
      if (!accepted.has(this.player.id)) this.dispatchEvent(new CustomEvent('full'));
    }

    publishState(state) {
      const now = performance.now();
      if (!this.connected || !this.channel || now - this.lastStateAt < 80) return;
      this.lastStateAt = now;
      this.channel.send({ type: 'broadcast', event: 'state', payload: { id: this.player.id, ...state } });
    }

    send(event, payload) {
      if (this.connected && this.channel) this.channel.send({ type: 'broadcast', event, payload });
    }

    async leave() {
      this.connected = false;
      const client = this.client;
      this.channel = null;
      this.client = null;
      try { await client?.removeAllChannels(); }
      finally { client?.realtime.disconnect(); }
    }
  }

  window.EncoreRoom = EncoreRoom;
})();
