import ConnProvider from './base.js';

import RtcConn from '../conn/rtc.js';

import { terms } from '../const.js';

class BrowserConnProvider extends ConnProvider {
  constructor(rtcConfig) {
    super();
    this._rtcConfig = rtcConfig || {};
  }

  start(connManager) {
    this._connManager = connManager;
    this._connManager.on(`receive:${terms.connReq}`, async ({ addr: viaAddr, payload }) => {
      const { fromAddr: addr, offer } = payload;
      if (this._connManager.isConnected(addr)) { return; }
      const accepted = await new Promise(
        accept => this._eventDispatcher.emit('req', { addr, offer, accept })
      )
      if (!accepted) {
        this._connManager.send(viaAddr, terms.connRejectRelay, { toAddr: addr });
        return;
      }

      this._connManager.connect(addr, { viaAddr, offer, ...this._connManager.getAcceptingOpts() });
    });
  }

  async connect(addr, { viaAddr, offer, ...opts }) {
    if (
      viaAddr &&
      RtcConn.protocols.indexOf((new URL(addr)).protocol) >= 0
    ) {
      const newConn = new RtcConn(this._rtcConfig);
      await newConn.startLink({
        addr, offer, connVia: this._connManager.getConn(viaAddr), ...opts,
      });
      return newConn;
    }

    throw new Error(`cannot connect to '${addr}' with viaAddr: '${viaAddr}'`);
  }
}

export default BrowserConnProvider;
