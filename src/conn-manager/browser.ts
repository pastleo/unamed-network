import Agent from '../agent';
import ConnManager, { RequestToConnEvent } from './base';
import WsConn from '../conn/ws';
import RtcConn from '../conn/rtc';
import { PeerIdentity } from '../misc/identity';
import { TunnelConn } from '../tunnel';
import { RequestToConnMessage, newRequestToConnMessage } from '../message/message';

class BrowserConnManager extends ConnManager {
  private agent: Agent;
  private pendingRtcConns: Record<string, RtcConn> = {};

  async start(agent: Agent) {
    this.agent = agent;
    this.agent.tunnelManager.addEventListener('new-tunnel', event => {
      const { tunnel } = event.detail;
      tunnel.addEventListener('receive', event => {
        switch (event.detail.term) {
          case 'requestToConn':
            return this.onReceiveRequestToConn(newRequestToConnMessage(event.detail), tunnel);
        }
      });
    });
  }

  private async onReceiveRequestToConn(message: RequestToConnMessage, connVia: TunnelConn) {
    const { srcPath: peerPath } = message;
    
    const peerIdentity = new PeerIdentity(peerPath, message.signingPubKey, message.encryptionPubKey);
    if (await peerIdentity.verify(message.signature)) {
      const event = new RequestToConnEvent({ peerPath, peerIdentity });
      this.dispatchEvent(event);

      if (!event.defaultPrevented) {
        this.connect(peerPath, {
          offer: message.offer,
          beingConnected: true,
          peerIdentity,
          connVia,
        });
      }
    }
  }

  protected async connectWs(peerPath: string, opts: ConnManager.ConnectOptsImpl): Promise<void> {
    const conn = new WsConn();
    const peerIdentity = new PeerIdentity(peerPath);
    await conn.startLink({
      myIdentity: this.agent.myIdentity,
      peerIdentity, peerPath,
      ...opts,
    });
    this.addConn(conn.peerIdentity.addr, conn, peerPath);
  }

  protected async connectUnnamed(peerPath: string, opts: ConnManager.ConnectOptsImpl): Promise<void> {
    const rtcConn = new RtcConn();
    const peerIdentity = new PeerIdentity(peerPath);
    this.pendingRtcConns[peerIdentity.addr] = rtcConn;
    const connVia = await this.agent.tunnelManager.create(peerPath);

    try {
      await rtcConn.startLink({
        myIdentity: this.agent.myIdentity,
        peerIdentity, peerPath, connVia,
        ...opts,
      });
      this.addConn(peerIdentity.addr, rtcConn, peerPath);
    } catch (error) {
      console.error(error);
    } finally {
      delete this.pendingRtcConns[peerIdentity.addr];
    }
  }
}

export default BrowserConnManager;
