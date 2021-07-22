import ConnManager from './base';
import { Server as WebSocketServer, ServerOptions } from 'ws';

class WssConnManager extends ConnManager {
  private server: WebSocketServer;
  private serverOpts: ServerOptions;

  constructor(opts: ServerOptions) {
    super();
    this.serverOpts = opts;
  }

  async start() {
    this.server = new WebSocketServer(this.serverOpts);

    this.server.on('connection', ws => {
      //ws.on('message', function incoming(message) {
        //console.log('received: %s', message);
      //});

      ws.send(JSON.stringify({ msg: 'ping' }));
      console.log('connected');
    });
    console.log('wss server started');
  }

  async connect(addr: string, viaAddr: string) {
  }
}

export default WssConnManager;
