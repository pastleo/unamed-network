import ConnManager, { RequestToConnEvent } from './base';
import WsConn from '../conn/ws';
import WebSocket, { Server as WebSocketServer, ServerOptions as WsServerOptions } from 'ws';
import { Message, toMessage, newRequestToConnMessage, newRequestToConnResultMessage, RequestToConnResultMessage } from '../utils/message';

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

    const { hostname, port } = new URL(this.myAddr);
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
    ws.addEventListener('message', event => {
      const message = toMessage(JSON.parse(event.data.toString()));
      switch (message.term) {
        case 'requestToConn':
          ok = this.onNewConnSentRequestToConn(ws, message);
          break;
        case 'requestToConnResult':
          ok = this.onNewConnSentRequestToConnResult(ws, message);
          break;
      }
    }, { once: true });

    setTimeout(() => {
      if (!ok) {
        ws.close();
      }
    }, this.config.newConnTimeout);
  }

  private onNewConnSentRequestToConn(ws: WebSocket, message: Message): boolean {
    const requestToConnMessage = newRequestToConnMessage(message);
    if (requestToConnMessage) {
      const { myAddr: peerAddr, connId } = requestToConnMessage;
      const event = new RequestToConnEvent({ peerAddr });
      this.dispatchEvent(event);

      if (!event.defaultPrevented) {
        const acceptMessage: RequestToConnResultMessage = {
          term: 'requestToConnResult',
          myAddr: this.myAddr, peerAddr,
          ok: true, connId,
        };
        ws.send(JSON.stringify(acceptMessage));

        const conn = new WsConn(connId);
        conn.startFromExisting(ws, {
          myAddr: this.myAddr, peerAddr,
          beingConnected: true,
          timeout: this.config.newConnTimeout,
        });
        this.addConn(peerAddr, conn);

        return true;
      }
    }

    return false;
  }

  private onNewConnSentRequestToConnResult(ws: WebSocket, message: Message): boolean {
    const requestToConnResultMessage = newRequestToConnResultMessage(message);
    if (requestToConnResultMessage) {
      const { myAddr: peerAddr } = requestToConnResultMessage;
      const conn = this.pendingWsConns[peerAddr];

      if (conn) {
        delete this.pendingWsConns[peerAddr];
        conn.startFromExisting(ws, {
          myAddr: this.myAddr, peerAddr,
          beingConnected: true,
          timeout: this.config.newConnTimeout,
        });
        this.addConn(peerAddr, conn);

        return true;
      }
    }

    return false;
  }

  async connectRtc(peerAddr: string, viaAddr: string): Promise<void> {
    const conn = new WsConn();
    this.pendingWsConns[peerAddr] = conn;

    await conn.startLink({
      peerAddr, myAddr: this.myAddr,
      timeout: this.config.requestToConnTimeout,
      beingConnected: false,
      askToBeingConn: true,
      connVia: this.connVia(viaAddr),
    });
  }

  protected receiveRequestToConnResult(message: RequestToConnResultMessage, _fromAddr: string) {
    if (message.peerAddr === this.myAddr) {
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
