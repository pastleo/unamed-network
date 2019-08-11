import { EventDispatcher, request, onRequested } from './utils.js';
import WsConn from './conn/ws.js';

const knownAddrsKey = 'knownAddrs'

class Client { // fullConnClient
  constructor(connManager, localStorage) {
    this._connManager = connManager;
    this._localStorage = localStorage;
    this._knownAddrs = JSON.parse(this._localStorage.getItem(knownAddrsKey) || '[]');
    this._connecting = [];
    this._eventDispatcher = new EventDispatcher();
  }

  know(addr) {
    this._makeKnown(addr);
    if (this._started && !this._connManager.isConnected(addr)) {
      this._connectAndAll(addr);
    }
  }
  forget(addr) {
    this._makeUnknown(addr);
    if (this._connManager.isConnected(addr)) {
      this._connManager.close(addr);
    }
  }
  known(addr) {
    return this._knownAddrs.indexOf(addr) >= 0;
  }
  _makeKnown(addr) {
    if (
      this._knownAddrs.indexOf(addr) === -1 &&
      WsConn.protocols.indexOf((new URL(addr)).protocol) >= 0
    ) {
      this._knownAddrs.push(addr);
      this._writeLocalStorage();
    }
  }
  _makeUnknown(addr) {
    const knownAddrIndex = this._knownAddrs.indexOf(addr);
    if (knownAddrIndex >= 0) {
      this._knownAddrs.splice(knownAddrIndex, 1);
      this._writeLocalStorage();
    }
  }

  _writeLocalStorage() {
    this._localStorage.setItem(knownAddrsKey, JSON.stringify(this._knownAddrs));
  }

  async startLink() {
    this._connManager.on('req', ({ addr, accept }) => {
      accept(this._connectingCheck(addr));
    });
    this._connManager.on('req-relay', ({ toAddr, fromAddr, accept }) => {
      accept(true);
    });
    this._connManager.on('ready', ({ addr }) => {
      this._makeKnown(addr);
    });
    this._connManager.on('close', ({ addr }) => {
      this._connectingRelease(addr);
    });

    onRequested(this._connManager, 'query-peers', () => {
      return { addrs: this._connManager.getConnectedAddrs() };
    });
    this._connManager.on('receive:broadcast', ({ addr, payload: { term, payload } }) => {
      this._eventDispatcher.emit(term, { addr, payload });
    });

    this._connManager.start();
    this._started = true;

    await Promise.all(this._knownAddrs.map(newAddr => this._connectAndAll(newAddr)));
  }

  async _connectAndAll(addr, viaAddr) {
    if (this._connectingCheck(addr)) {
      try {
        await this._connManager.connect(addr, { viaAddr });
      } catch (error) {
        console.warn('connecting to:', addr, 'failed:', error);
        this._connectingRelease(addr);
        this._makeUnknown(addr);
        return;
      }
      const { addrs: newAddrs } = await request(this._connManager, addr, 'query-peers');
      await Promise.all(newAddrs.map(newAddr => this._connectAndAll(newAddr, addr)))
    }
  }

  _connectingCheck(addr) {
    if (
      addr === this._connManager.getMyAddr() ||
      this._connecting.indexOf(addr) >= 0
    ) { return false; }
    this._connecting.push(addr);
    return true;
  }
  _connectingRelease(addr) {
    const connectingIndex = this._connecting.indexOf(addr);
    if (connectingIndex >= 0) {
      this._connecting.splice(connectingIndex, 1);
    }
  }

  /**
   * .on(term, ({ addr, payload })  => {})
   */
  on(eventName, callback) {
    return this._eventDispatcher.on(eventName, callback);
  }

  broadcast(term, payload) {
    this._connManager.getConnectedAddrs().forEach(addr => {
      this._connManager.send(addr, 'broadcast', { term, payload });
    });
  }
}

export default Client;
