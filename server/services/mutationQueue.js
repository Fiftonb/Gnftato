'use strict';

class PerServerMutationQueue {
  constructor() {
    this.tails = new Map();
  }

  run(serverId, operation) {
    const id = String(serverId);
    const previous = this.tails.get(id) || Promise.resolve();
    const current = previous.then(operation);
    // The internal tail always resolves so a failed mutation cannot create an
    // unhandled rejection or prevent the next queued mutation from running.
    const tail = current.then(() => undefined, () => undefined).finally(() => {
      if (this.tails.get(id) === tail) this.tails.delete(id);
    });
    this.tails.set(id, tail);
    return current.then(
      value => tail.then(() => value),
      error => tail.then(() => { throw error; })
    );
  }

  pending(serverId) {
    return this.tails.has(String(serverId));
  }
}

module.exports = { PerServerMutationQueue };
