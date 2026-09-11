'use strict';

// Exercise the real Socket.IO handshake and events over Node's built-in WebSocket.
// The client only connects to the ephemeral loopback HTTP server created by tests.
class TestSocket {
  constructor(baseUrl, auth = {}) {
    this.messages = [];
    this.waiters = [];
    this.closed = false;
    this.socket = new WebSocket(`${baseUrl.replace('http:', 'ws:')}/socket.io/?EIO=4&transport=websocket`);
    this.socket.addEventListener('message', ({ data }) => {
      const packet = String(data);
      if (packet.startsWith('0')) {
        this.socket.send(`40${JSON.stringify(auth)}`);
      } else if (packet === '2') {
        this.socket.send('3');
      } else if (packet.startsWith('40')) {
        this.deliver('connect', JSON.parse(packet.slice(2) || '{}'));
      } else if (packet.startsWith('44')) {
        this.deliver('connect_error', JSON.parse(packet.slice(2)));
      } else if (packet.startsWith('42')) {
        const [event, payload] = JSON.parse(packet.slice(2));
        this.deliver(event, payload);
      } else if (packet === '41') {
        this.deliver('disconnect', {});
        this.socket.close();
      }
    });
    this.socket.addEventListener('error', () => this.deliver('transport_error', {}));
    this.socket.addEventListener('close', () => {
      this.closed = true;
      this.deliver('disconnect', {});
    });
  }

  deliver(event, payload) {
    const index = this.waiters.findIndex(waiter => waiter.events.includes(event));
    if (index === -1) {
      this.messages.push({ event, payload });
      return;
    }
    const [waiter] = this.waiters.splice(index, 1);
    clearTimeout(waiter.timer);
    waiter.resolve({ event, payload });
  }

  waitFor(...events) {
    const index = this.messages.findIndex(message => events.includes(message.event));
    if (index !== -1) return Promise.resolve(this.messages.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { events, resolve };
      waiter.timer = setTimeout(() => {
        this.waiters = this.waiters.filter(item => item !== waiter);
        reject(new Error(`Timed out waiting for Socket.IO event: ${events.join(', ')}`));
      }, 4000);
      this.waiters.push(waiter);
    });
  }

  emit(event, payload) {
    this.socket.send(`42${JSON.stringify([event, payload])}`);
  }

  async close() {
    if (this.closed) return;
    this.socket.close();
    await this.waitFor('disconnect');
  }
}

module.exports = TestSocket;
