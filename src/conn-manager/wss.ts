import ConnManager, { RequestToConnEvent, NewConnEvent } from './base';
import WsConn from '../conn/ws';
import WebSocket, { Server as WebSocketServer, ServerOptions } from 'ws';
import { toRequestToConnMessage, RequestToConnResultMessage } from '../utils/message';

class WssConnManager extends ConnManager {
  private server: WebSocketServer;
  private serverOpts: ServerOptions;

  constructor(opts: ServerOptions) {
    super();
    this.serverOpts = opts;
  }

  async start(myAddr: string) {
    await super.start(myAddr);

    this.server = new WebSocketServer(this.serverOpts);

    this.server.on('connection', (websocket: WebSocket) => {
      this.onNewConnection(websocket);
    });
    console.log('wss server started');
  }

  private onNewConnection(ws: WebSocket) {
    let ok = false;
    ws.addEventListener('message', event => {
      const requestToConnMessage = toRequestToConnMessage(JSON.parse(event.data.toString()));
      if (requestToConnMessage) {
        const addr = requestToConnMessage.addr;
        const event = new RequestToConnEvent({ addr });
        this.dispatchEvent(event);

        if (!event.defaultPrevented) {
          const acceptMessage: RequestToConnResultMessage = { ok: true };
          ws.send(JSON.stringify(acceptMessage));

          const conn = new WsConn();
          conn.startFromExisting(ws, requestToConnMessage.addr);
          this.conns.push(conn);
          this.dispatchEvent(new NewConnEvent({ addr, conn }));
          ok = true;
        }
      }

    }, { once: true });

    setTimeout(() => {
      if (!ok) {
        ws.close();
      }
    }, 1000);
  }

  async connectRtc(addr: string, viaAddr: string): Promise<void> {
  }
}

export default WssConnManager;
