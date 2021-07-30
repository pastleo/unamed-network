import ConnManager, { RequestToConnEvent } from './base';
import WsConn from '../conn/ws';
import WebSocket, { Server as WebSocketServer, ServerOptions as WsServerOptions } from 'ws';
import { PeerIdentity } from '../misc/identity';
import { Message, toMessage, newRequestToConnMessage, newRequestToConnResultMessage, RequestToConnResultMessage } from '../misc/message';

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

  private onNewConnection(ws: WebSocket) {
    let ok = false;
    ws.addEventListener('message', async event => {
      const message = toMessage(JSON.parse(event.data.toString()));
      switch (message.term) {
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
        ws.close();
      }
    }, this.config.newConnTimeout);
  }

  private async onNewConnSentRequestToConn(ws: WebSocket, message: Message): Promise<boolean> {
    const requestToConnMessage = newRequestToConnMessage(message);
    if (requestToConnMessage) {
      const { myAddr: peerAddr } = requestToConnMessage;
      const peerIdentity = new PeerIdentity(
        peerAddr,
        requestToConnMessage.signingPubKey,
        requestToConnMessage.encryptionPubKey,
      );

      if (await this.verifyPeerIdentity(peerIdentity, requestToConnMessage.signature)) {
        const event = new RequestToConnEvent({ peerAddr, peerIdentity });
        this.dispatchEvent(event);

        if (!event.defaultPrevented) {
          const acceptMessage: RequestToConnResultMessage = {
            term: 'requestToConnResult',
            myAddr: this.myIdentity.addr, peerAddr,
            signingPubKey: this.myIdentity.exportedSigningPubKey,
            encryptionPubKey: this.myIdentity.expoertedEncryptionPubKey,
            signature: await this.myIdentity.signature(),
            ok: true,
          };
          ws.send(JSON.stringify(acceptMessage));

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
      }
    }

    return false;
  }

  private async onNewConnSentRequestToConnResult(ws: WebSocket, message: Message): Promise<boolean> {
    const requestToConnResultMessage = newRequestToConnResultMessage(message);
    if (requestToConnResultMessage) {
      const { myAddr: peerAddr } = requestToConnResultMessage;
      const conn = this.pendingWsConns[peerAddr];

      if (conn) {
        delete this.pendingWsConns[peerAddr];

        conn.peerIdentity.setSigningPubKey(requestToConnResultMessage.signingPubKey);
        conn.peerIdentity.setEncryptionPubKey(requestToConnResultMessage.encryptionPubKey);

        if (await this.verifyPeerIdentity(conn.peerIdentity, requestToConnResultMessage.signature)) {
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

  async connectUnnamed(peerAddr: string, viaAddr: string): Promise<void> {
    const conn = new WsConn();
    this.pendingWsConns[peerAddr] = conn;

    await conn.startLink({
      peerAddr, myIdentity: this.myIdentity,
      peerIdentity: new PeerIdentity(peerAddr),
      timeout: this.config.requestToConnTimeout,
      beingConnected: false,
      askToBeingConn: true,
      connVia: this.connVia(viaAddr),
    });
  }

  protected onReceiveRequestToConnResult(message: RequestToConnResultMessage, _fromAddr: string) {
    if (message.peerAddr === this.myIdentity.addr) {
      const peerAddr = message.myAddr;
      const pendingConn = this.pendingWsConns[peerAddr];
      if (pendingConn) {
        pendingConn.requestToConnResult(message.ok);
      }
    } else {
      this.send(message.peerAddr, message);
    }
  }
}

export default WssConnManager;
