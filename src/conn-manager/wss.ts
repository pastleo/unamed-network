import ConnManager, { RequestToConnEvent, NewConnEvent } from './base';
import WsConn from '../conn/ws';
import WebSocket, { Server as WebSocketServer, ServerOptions as WsServerOptions } from 'ws';
import { toRequestToConnMessage, RequestToConnResultMessage } from '../utils/message';

declare namespace WssConnManager {
  type ServerOptions = WsServerOptions
}

class WssConnManager extends ConnManager {
  private server: WebSocketServer;
  private serverOpts: WssConnManager.ServerOptions;

  constructor(config: Partial<ConnManager.WssConfig> = {}, opts: WssConnManager.ServerOptions = {}) {
    super(config);
    this.serverOpts = opts;
  }

  async start(myAddr: string) {
    await super.start(myAddr);

    const { hostname, port } = new URL(myAddr);
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
      const requestToConnMessage = toRequestToConnMessage(JSON.parse(event.data.toString()));
      if (requestToConnMessage) {
        const peerAddr = requestToConnMessage.addr;
        const event = new RequestToConnEvent({ peerAddr });
        this.dispatchEvent(event);

        if (!event.defaultPrevented) {
          const acceptMessage: RequestToConnResultMessage = { ok: true };
          ws.send(JSON.stringify(acceptMessage));

          const conn = new WsConn();
          conn.startFromExisting(ws, peerAddr);
          this.addConn(peerAddr, conn);
          ok = true;
        }
      }

    }, { once: true });

    setTimeout(() => {
      if (!ok) {
        ws.close();
      }
    }, this.config.newConnTimeout);
  }

  async connectRtc(peerAddr: string, viaAddr: string): Promise<void> {
  }
}

export default WssConnManager;
