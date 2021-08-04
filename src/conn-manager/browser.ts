import ConnManager, { RequestToConnEvent } from './base';
import WsConn from '../conn/ws';
import RtcConn from '../conn/rtc';
import Tunnel from '../conn/tunnel';
import { PeerIdentity } from '../misc/identity';
import {
  RequestToConnMessage, newRequestToConnMessage,
} from '../message/message';
import { extractAddrFromPath } from '../misc/utils';

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
    const { srcPath: peerPath } = message;
    
    const peerIdentity = new PeerIdentity(peerPath, message.signingPubKey, message.encryptionPubKey);
    if (await peerIdentity.verify(message.signature)) {
      const event = new RequestToConnEvent({ peerPath, peerIdentity });
      this.dispatchEvent(event);

      if (!event.defaultPrevented) {
        this.connect(peerPath, fromAddr, {
          offer: message.offer,
          beingConnected: true,
          peerIdentity,
          connVia,
        });
      }
    }
  }


  protected async connectWs(peerPath: string, _viaAddr: string, opts: ConnManager.ConnectOpts = {}): Promise<void> {
    const conn = new WsConn();
    const beingConnected = opts.beingConnected || false;
    await conn.startLink({
      myIdentity: this.myIdentity, peerPath,
      peerIdentity: new PeerIdentity(peerPath),
      timeout: beingConnected ? this.config.newConnTimeout : this.config.requestToConnTimeout,
      beingConnected,
      ...opts,
    });
    this.addConn(conn.peerIdentity.addr, conn);
  }

  protected async connectUnnamed(peerPath: string, viaAddr: string, opts: ConnManager.ConnectOpts = {}): Promise<void> {
    const rtcConn = new RtcConn();
    const peerAddr = extractAddrFromPath(peerPath);
    this.pendingRtcConns[peerAddr] = rtcConn;
    const connVia = opts.connVia || (await this.createTunnel(peerAddr, viaAddr));

    try {
      await rtcConn.startLink({
        myIdentity: this.myIdentity, peerPath,
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
