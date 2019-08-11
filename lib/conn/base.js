import { EventDispatcher } from '../utils.js'

class Conn {
  constructor() {
    this._eventDispatcher = new EventDispatcher();
  }

  async startLink() {
    throw new Error("startLink() not implemented");
  }
  close() {
    throw new Error("close() not implemented");
  }

  /**
   * .on('receive', ({ term, payload }) => {})
   * .on('close', () => {})
   */
  on(eventName, callback) {
    return this._eventDispatcher.on(eventName, callback);
  }

  send(term, payload = {}) {
    throw new Error("send(term, payload) not implemented");
  }
}

Conn.protocols = [];

export const reasons = {
  ERROR: 'ERROR',
  REJECTED: 'REJECTED',
  DISCONNECT: 'DISCONNECT',
  PEER_DISCONNECT: 'PEER_DISCONNECT',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN_PEER: 'UNKNOWN_PEER',
  UNHANDLED: 'UNHANDLED',
};

export default Conn;
