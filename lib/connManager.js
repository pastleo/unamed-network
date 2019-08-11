import { randomStr, EventDispatcher } from './utils.js';

import WsConn from './conn/ws.js';

import { terms } from './const.js';

class ConnManager {
  constructor(myAddr, connProvider, opts) {
    this._conns = {};
    this._myAddr = myAddr;
    this._connProvider = connProvider;
    this._eventDispatcher = new EventDispatcher();
    this._relaying = [];
    this._opts = {
      relayingTimeout: 10000,
      acceptingOpts: {},
      ...opts,
    };
  }

  getMyAddr() {
    return this._myAddr;
  }

  start() {
    this._connProvider.on('req', ({ addr, offer, accept }) =>
      this._eventDispatcher.emit('req', { addr, offer: offer || {}, accept })
    );
    this._connProvider.on('new', ({ addr, newConn }) =>
      this._setupConn(addr, newConn)
    );
    this._connProvider.start(this);

    this.on(`receive:${terms.connReqRelay}`, async ({ addr: fromAddr, payload }) => {
      const { toAddr, offer } = payload
      let accepted = true;
      if (!this.isConnected(toAddr)) { accepted = false; }
      accepted = accepted && await new Promise(accept => {
        this._eventDispatcher.emit('req-relay', { toAddr, fromAddr, offer: offer || {}, accept })
      })
      if (!accepted) {
        this.trySend(fromAddr, terms.connReject, { fromAddr });
        return;
      }
      this._addRelaying(fromAddr, toAddr)
      this.trySend(toAddr, terms.connReq, { fromAddr, offer })
      setTimeout(
        () => this._rmRelaying(fromAddr, toAddr),
        this._opts.relayingTimeout
      )
    })
    this.on(`receive:${terms.connRejectRelay}`, ({ addr: fromAddr, payload }) => {
      if (this._isRelaying(fromAddr, payload.toAddr)) {
        this.trySend(payload.toAddr, terms.connReject, { fromAddr });
      }
    });
    this.on(`receive:${terms.connAcceptRelay}`, ({ addr: fromAddr, payload }) => {
      const { toAddr, answer } = payload
      if (this._isRelaying(fromAddr, toAddr)) {
        this.trySend(toAddr, terms.connAccept, { fromAddr, answer })
      }
    });
    this.on(`receive:${terms.rtcIceRelay}`, ({ addr: fromAddr, payload }) => {
      const { toAddr, candidate } = payload
      if (this._isRelaying(fromAddr, toAddr)) {
        this.trySend(toAddr, terms.rtcIce, { fromAddr, candidate })
      }
    });
  }

  _addRelaying(addr1, addr2) {
    this._relaying.push(this._relayingKey(addr1, addr2))
  }
  _isRelaying(addr1, addr2) {
    return this._relaying.indexOf(this._relayingKey(addr1, addr2)) >= 0
  }
  _rmRelaying(addr1, addr2) {
    this._relaying.splice(
      this._relaying.indexOf(this._relayingKey(addr1, addr2)), 1,
    )
  }
  _relayingKey(addr1, addr2) {
    return [addr1, addr2].sort().join(' <=> ')
  }

  async connect(addr, { viaAddr, offer, ...opts }) {
    if (this.isConnected(addr)) { throw new Error(`already connected to ${addr}`); }

    let newConn;
    if (WsConn.protocols.indexOf((new URL(addr)).protocol) >= 0) {
      newConn = new WsConn();
      await newConn.startLink({ addr, offer, myAddr: this._myAddr, ...opts });
    } else {
      newConn = await this._connProvider.connect(addr, { viaAddr, offer, ...opts });
    }

    this._setupConn(addr, newConn);
    return newConn;
  }

  _setupConn(addr, conn) {
    conn.on('receive', ({ term, payload }) => {
      this._eventDispatcher.emit(`receive:${term}`, { addr, payload })
    })
    conn.on('close', () => {
      this._eventDispatcher.emit('close', { addr })
      delete this._conns[addr]
    })
    this._conns[addr] = conn
    this._eventDispatcher.emit('ready', { addr })
  }

  /**
   * .on(`receive:${term}`, ({ addr, payload })  => {})
   * .on('req', ({ addr, offer, accept }) => {})
   * .on('req-relay', ({ toAddr, fromAddr, offer, accept }) => {})
   * .on('ready', ({ addr }) => {})
   * .on('close', ({ addr }) => {})
   */
  on(eventName, callback) {
    return this._eventDispatcher.on(eventName, callback);
  }

  isConnected(addr) {
    return !!this._conns[addr];
  }
  getConn(addr) {
    const conn = this._conns[addr];
    if (!conn) {
      throw new Error(`conn not found for ${addr}`);
    }
    return conn;
  }
  getConnectedAddrs() {
    return Object.keys(this._conns)
  }
  
  send(addr, term, payload = {}) {
    this.getConn(addr).send(term, payload);
  }
  trySend(addr, term, payload = {}) {
    try {
      this.send(addr, term, payload);
    } catch (error) {
      console.warn('send error', { addr, term, payload, error });
      return false;
    }
    return true;
  }
  close(addr) {
    this.getConn(addr).close();
  }
  tryClose(addr) {
    try {
      this.close(addr);
    } catch (error) {
      console.warn('close error', { addr, error });
      return false;
    }
    return true;
  }

  getAcceptingOpts() {
    return this._opts.acceptingOpts;
  }
}

export default ConnManager
