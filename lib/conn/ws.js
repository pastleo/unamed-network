import Conn, { reasons } from './base.js'

import { terms } from '../const.js'

let Ws;
if (typeof WebSocket === 'function') { // might be from window.WebSocket
  Ws = WebSocket;
}
export const setWsClass = _Ws => {
  Ws = _Ws;
}

class WsConn extends Conn {
  async startLink(opts) {
    const { addr, myAddr, offer, connVia, wsPromise, timeout } = opts || {};
    const timer = this._startEstTimer(timeout);
    if (wsPromise) {
      if (connVia) {
        connVia.send(terms.connReqRelay, { toAddr: addr, offer });
        this._ws = await Promise.race([
          wsPromise, timer, this._startEstConnViaRejected(addr, connVia),
        ]);
      } else {
        this._ws = await Promise.race([wsPromise, timer]);
      }
      this._setup();
      this.send(terms.connAccept);
    } else {
      await Promise.race([
        timer, new Promise((resolve, reject) => {
          this._ws = new Ws(addr);
          const dpsWaitingForStart = [];
          this._ws.onmessage = ({ data }) => {
            const dataParsed = JSON.parse(data);
            if (dataParsed.term === terms.connAccept) {
              this._setup();
              resolve();
              dpsWaitingForStart.forEach(
                dp => setTimeout(() => this._emitReceive(dp))
              );
            } else if (dataParsed.term === terms.connReject) {
              this._estError(reject, reasons.ERROR);
            } else {
              dpsWaitingForStart.push(dataParsed);
            }
          }
          this._ws.onopen = () => {
            this.send(terms.connReq, { myAddr, offer });
          }
          this._ws.onerror = () => {
            this._estError(reject, reasons.ERROR);
          }
        }),
      ]);
    }
  }
  _setup() {
    clearTimeout(this._estTimer);
    if (this._rmViaReceiveListener) { this._rmViaReceiveListener(); }
    this._ws.onopen = () => {}
    this._ws.onclose = () => {
      this._eventDispatcher.emit('close', { reason: reasons.DISCONNECT });
    }
    this._ws.onmessage = ({ data }) => {
      this._emitReceive(JSON.parse(data));
    }
    this._ws.onerror = () => {
      this._eventDispatcher.emit('close', { reason: reasons.ERROR });
    }
  }
  _startEstTimer(timeout) {
    return new Promise(
      (_, reject) => {
        this._estTimer = setTimeout(
          () => this._estError(reject, reasons.TIMEOUT),
          timeout || 10000
        );
      }
    );
  }
  _startEstConnViaRejected(addr, connVia) {
    return new Promise(
      (_, reject) => {
        this._rmViaReceiveListener = connVia.on('receive', ({ term, payload: { fromAddr }}) => {
          if (addr === fromAddr && terms.connReject === term) {
            this._estError(reject, reasons.REJECTED);
          }
        })
      }
    );
  }
  _estError(reject, reason) {
    if (this._ws) { this._ws.close(); }
    if (this._rmViaReceiveListener) { this._rmViaReceiveListener(); }
    clearTimeout(this._estTimer);
    reject(reason);
  }
  _emitReceive(dataParsed) {
    const { term, payload } = dataParsed;
    this._eventDispatcher.emit('receive', { term, payload: payload || {} });
  }

  close() {
    this._ws.close();
  }
  send(term, payload = {}) {
    this._ws.send(
      JSON.stringify(
        { term, payload }
      )
    );
  }
}

WsConn.protocols = ['ws:', 'wss:'];

export default WsConn;
