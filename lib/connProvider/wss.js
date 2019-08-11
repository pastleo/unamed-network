import ConnProvider from './base.js';

import WsConn from '../conn/ws.js';

import { terms } from '../const.js';

class WssConnProvider extends ConnProvider {
  constructor(wss) {
    super();
    this._wss = wss;
    this._connectings = {};
  }

  start(connManager) {
    this._connManager = connManager;
    this._wss.on('connection', ws => {
      ws.onmessage = async ({ data }) => {
        const dataParsed = JSON.parse(data);
        if (dataParsed.term === terms.connReq && (dataParsed.payload || {}).myAddr) {
          const { myAddr: addr, offer } = dataParsed.payload;
          if (this._connManager.isConnected(addr)) { return ws.close(); }

          const resolveConnecting = this._connectings[addr];
          if (resolveConnecting) {
            resolveConnecting(ws);
            delete this._connectings[addr];
            return;
          }

          const accepted = await new Promise(
            accept => this._eventDispatcher.emit('req', { addr, offer, accept })
          );
          if (!accepted) {
            ws.send(JSON.stringify({ term: terms.connReject }));
            ws.close();
            return;
          }

          const newConn = new WsConn();
          await newConn.startLink({ wsPromise: ws, ...this._connManager.getAcceptingOpts() });
          this._eventDispatcher.emit('new', { addr, newConn });
        }
      }
    });
  }

  async connect(addr, { viaAddr, offer, ...opts }) { // invite to connect
    if (viaAddr) {
      const newConn = new WsConn();
      await newConn.startLink({
        addr, offer, connVia: this._connManager.getConn(viaAddr),
        wsPromise: new Promise(resolve => {
          this._connectings[addr] = resolve;
        }),
        ...opts,
      });
      return newConn;
    }

    throw new Error(`cannot connect to '${addr}' without viaAddr`);
  }
}

export default WssConnProvider;
