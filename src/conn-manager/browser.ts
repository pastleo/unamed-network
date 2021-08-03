import ConnManager, { RequestToConnEvent } from './base';
import WsConn from '../conn/ws';
import RtcConn from '../conn/rtc';
import Tunnel from '../conn/tunnel';
import { PeerIdentity } from '../misc/identity';
import {
  RequestToConnMessage, newRequestToConnMessage,
} from '../message/message';

class BrowserConnManager extends ConnManager {
  private pendingRtcConns: Record<string, RtcConn> = {};

  async start() {
    await super.start();
    this.addEventListener('new-tunnel', event => {
      const { tunnel } = event.detail;
      tunnel.addEventListener('receive', event => {
        switch (event.detail.term) {
          case 'requestToConn':
            return this.onReceiveRequestToConn(newRequestToConnMessage(event.detail), event.fromConn.peerIdentity.addr, tunnel);
        }
      });
    });
  }

  private async onReceiveRequestToConn(message: RequestToConnMessage, fromAddr: string, connVia: Tunnel) {
    const { srcAddr: peerAddr } = message;
    const peerIdentity = new PeerIdentity(peerAddr, message.signingPubKey, message.encryptionPubKey);
    if (await peerIdentity.verify(message.signature)) {
      const event = new RequestToConnEvent({ peerAddr, peerIdentity });
      this.dispatchEvent(event);

      if (!event.defaultPrevented) {
        this.connect(peerAddr, fromAddr, {
          offer: message.offer,
          beingConnected: true,
          peerIdentity,
          connVia,
        });
      }
    }
  }


  protected async connectWs(peerAddr: string, _viaAddr: string, opts: ConnManager.ConnectOpts = {}): Promise<void> {
    const conn = new WsConn();
    const beingConnected = opts.beingConnected || false;
    await conn.startLink({
      myIdentity: this.myIdentity, peerAddr,
      peerIdentity: new PeerIdentity(peerAddr),
      timeout: beingConnected ? this.config.newConnTimeout : this.config.requestToConnTimeout,
      beingConnected,
      ...opts,
    });
    this.addConn(peerAddr, conn);
  }

  protected async connectUnnamed(peerAddr: string, viaAddr: string, opts: ConnManager.ConnectOpts = {}): Promise<void> {
    const rtcConn = new RtcConn();
    this.pendingRtcConns[peerAddr] = rtcConn;
    const connVia = opts.connVia || (await this.createTunnel(peerAddr, viaAddr));

    try {
      await rtcConn.startLink({
        myIdentity: this.myIdentity, peerAddr,
        peerIdentity: new PeerIdentity(peerAddr),
        timeout: this.config.requestToConnTimeout,
        connVia,
        ...opts,
      });
      this.addConn(peerAddr, rtcConn);
    } catch (error) {
      console.error(error);
    } finally {
      delete this.pendingRtcConns[peerAddr];
    }
  }
}

export default BrowserConnManager;
