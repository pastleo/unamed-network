import ConnManager, { RequestToConnEvent } from './base';
import WsConn from '../conn/ws';
import WebSocket, { Server as WebSocketServer, ServerOptions as WsServerOptions } from 'ws';
import Tunnel from '../conn/tunnel';
import { PeerIdentity } from '../misc/identity';
import { Message, toMessage, newRequestToConnMessage, newRequestToConnResultMessage } from '../message/message';
import { makeRequestToConnMessage, makeRequestToConnResultMessage } from '../message/conn';

declare namespace WssConnManager {
  type ServerOptions = WsServerOptions
}

class WssConnManager extends ConnManager {
  private server: WebSocketServer;
  private serverOpts: WssConnManager.ServerOptions;

  private pendingWsConns: Record<string, WsConn> = {};

  constructor(config: Partial<ConnManager.Config> = {}, opts: WssConnManager.ServerOptions = {}) {
    super(config);
    this.serverOpts = opts;
  }

  async start() {
    await super.start();

    const { hostname, port } = new URL(this.myIdentity.addr);
    this.serverOpts = {
      host: hostname, port: parseInt(port),
      ...this.serverOpts,
    }

    this.server = new WebSocketServer(this.serverOpts);

    this.server.on('connection', (websocket: WebSocket) => {
      this.onNewConnection(websocket);
    });
  }

  protected async connectWs(peerAddr: string, _viaAddr: string, _opts: ConnManager.ConnectOpts = {}): Promise<void> {
    const conn = new WsConn();
    this.pendingWsConns[peerAddr] = conn;

    conn.startLink({
      myIdentity: this.myIdentity, peerAddr,
      peerIdentity: new PeerIdentity(peerAddr),
      waitForWs: true,
      timeout: this.config.requestToConnTimeout,
    });

    const ws = new WebSocket(peerAddr);
    ws.onopen = async () => {
      ws.send(JSON.stringify(await makeRequestToConnMessage(this.myIdentity, peerAddr)));
    };

    setTimeout(() => {
      ws.close();
    }, this.config.requestToConnTimeout);
  }

  protected async connectUnnamed(peerAddr: string, viaAddr: string): Promise<void> {
    const conn = new WsConn();
    this.pendingWsConns[peerAddr] = conn;

    const startLinkPromise = conn.startLink({
      peerAddr, myIdentity: this.myIdentity,
      peerIdentity: new PeerIdentity(peerAddr),
      timeout: this.config.requestToConnTimeout,
      waitForWs: true,
    });

    const connVia = await this.createTunnel(peerAddr, viaAddr);
    connVia.send(await makeRequestToConnMessage(this.myIdentity, peerAddr));

    await startLinkPromise;
  }

  private onNewConnection(ws: WebSocket) {
    let ok = false;
    ws.addEventListener('message', async event => {
      const message = toMessage(JSON.parse(event.data.toString()));
      switch (message?.term) {
        case 'requestToConn':
          ok = await this.onNewConnSentRequestToConn(ws, message);
          break;
        case 'requestToConnResult':
          ok = await this.onNewConnSentRequestToConnResult(ws, message);
          break;
      }
    }, { once: true });

    setTimeout(() => {
      if (!ok) {
        console.warn(`WssConnManager.onNewConnection: new connection timeout`);
        ws.close();
      }
    }, this.config.newConnTimeout);
  }

  private async onNewConnSentRequestToConn(ws: WebSocket, message: Message): Promise<boolean> {
    const requestToConnMessage = newRequestToConnMessage(message);
    if (requestToConnMessage) {
      const { srcAddr: peerAddr } = requestToConnMessage;
      const peerIdentity = new PeerIdentity(
        peerAddr,
        requestToConnMessage.signingPubKey,
        requestToConnMessage.encryptionPubKey,
      );

      if (await peerIdentity.verify(requestToConnMessage.signature)) {
        const event = new RequestToConnEvent({ peerAddr, peerIdentity });
        this.dispatchEvent(event);

        if (!event.defaultPrevented) {
          if (peerAddr.match(/^wss?:\/\//)) {
            return this.onNewConnSentRequestToConnByWs(ws, peerAddr);
          } else {
            return this.onNewConnSentRequestToConnByUnnamed(ws, peerAddr, peerIdentity);
          }
        }
      }
    }

    return false;
  }

  private async onNewConnSentRequestToConnByWs(ws: WebSocket, peerAddr: string): Promise<boolean> {
    ws.close();
    const conn = new WsConn();
    await conn.startLink({
      myIdentity: this.myIdentity, peerAddr,
      beingConnected: true,
      timeout: this.config.newConnTimeout
    });
    this.addConn(peerAddr, conn);
    return true;
  }

  private async onNewConnSentRequestToConnByUnnamed(ws: WebSocket, peerAddr: string, peerIdentity: PeerIdentity): Promise<boolean> {
    const message = await makeRequestToConnResultMessage(this.myIdentity, peerAddr);
    ws.send(JSON.stringify(message));

    const conn = new WsConn();
    conn.startFromExisting(ws, {
      myIdentity: this.myIdentity, peerAddr,
      peerIdentity,
      beingConnected: true,
      timeout: this.config.newConnTimeout,
    });
    this.addConn(peerAddr, conn);

    return true;
  }

  private async onNewConnSentRequestToConnResult(ws: WebSocket, message: Message): Promise<boolean> {
    const requestToConnResultMessage = newRequestToConnResultMessage(message);
    if (requestToConnResultMessage) {
      const { srcAddr: peerAddr } = requestToConnResultMessage;
      const conn = this.pendingWsConns[peerAddr];

      if (conn) {
        delete this.pendingWsConns[peerAddr];

        conn.peerIdentity.setSigningPubKey(requestToConnResultMessage.signingPubKey);
        conn.peerIdentity.setEncryptionPubKey(requestToConnResultMessage.encryptionPubKey);

        if (await conn.peerIdentity.verify(requestToConnResultMessage.signature)) {
          conn.startFromExisting(ws, {
            myIdentity: this.myIdentity, peerAddr,
            beingConnected: true,
            timeout: this.config.newConnTimeout,
          });
          this.addConn(peerAddr, conn);

          return true;
        }
      }
    }

    return false;
  }
}

export default WssConnManager;
