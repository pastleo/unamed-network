import Agent from '../agent';
import ConnManager, { RequestToConnEvent } from './base';
import WsConn from '../conn/ws';
import WebSocket, { Server as WebSocketServer, ServerOptions as WsServerOptions } from 'ws';
import { PeerIdentity } from '../misc/identity';
import { Message, toMessage } from '../message/message';
import { newRequestToConnMessage, newRequestToConnResultMessage } from '../message/conn';
import { makeRequestToConnMessage, makeRequestToConnResultMessage } from '../message/conn';
import { extractAddrFromPath } from '../misc/utils';

declare namespace WssConnManager {
  type ServerOptions = WsServerOptions
}

class WssConnManager extends ConnManager {
  private agent: Agent;
  private server: WebSocketServer;
  private serverOpts: WssConnManager.ServerOptions;

  private pendingWsConns: Record<string, WsConn> = {};

  constructor(config: Partial<ConnManager.Config> = {}, opts: WssConnManager.ServerOptions = {}) {
    super(config);
    this.serverOpts = opts;
  }

  async start(agent: Agent) {
    this.agent = agent;

    const { hostname, port } = new URL(this.agent.myIdentity.addr);
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
      const { srcPath: peerPath } = requestToConnMessage;
      const peerIdentity = new PeerIdentity(
        peerPath,
        requestToConnMessage.signingPubKey,
        requestToConnMessage.encryptionPubKey,
      );

      if (await peerIdentity.verify(requestToConnMessage.signature)) {
        const event = new RequestToConnEvent({ peerPath, peerIdentity });
        this.dispatchEvent(event);

        if (!event.defaultPrevented) {
          if (event.peerAddr.match(/^wss?:\/\//)) {
            return this.onNewConnSentRequestToConnByWs(ws, peerPath, peerIdentity);
          } else {
            return this.onNewConnSentRequestToConnByUnnamed(ws, peerPath, peerIdentity);
          }
        }
      }
    }

    return false;
  }

  private async onNewConnSentRequestToConnByWs(ws: WebSocket, peerPath: string, peerIdentity: PeerIdentity): Promise<boolean> {
    ws.close();
    const conn = new WsConn();
    await conn.startLink({
      myIdentity: this.agent.myIdentity, peerPath,
      peerIdentity,
      beingConnected: true,
      timeout: this.config.newConnTimeout
    });
    this.addConn(peerIdentity.addr, conn, peerPath);
    return true;
  }

  private async onNewConnSentRequestToConnByUnnamed(ws: WebSocket, peerPath: string, peerIdentity: PeerIdentity): Promise<boolean> {
    const message = await makeRequestToConnResultMessage(this.agent.myIdentity, peerPath);
    ws.send(JSON.stringify(message));

    const conn = new WsConn();
    conn.startFromExisting(ws, { peerIdentity });
    this.addConn(peerIdentity.addr, conn, peerPath);

    return true;
  }

  private async onNewConnSentRequestToConnResult(ws: WebSocket, message: Message): Promise<boolean> {
    const requestToConnResultMessage = newRequestToConnResultMessage(message);
    if (requestToConnResultMessage) {
      const { srcPath: peerPath } = requestToConnResultMessage;
      const peerAddr = extractAddrFromPath(peerPath);
      const conn = this.pendingWsConns[peerAddr];

      if (conn) {
        delete this.pendingWsConns[peerAddr];

        conn.peerIdentity.setSigningPubKey(requestToConnResultMessage.signingPubKey);
        conn.peerIdentity.setEncryptionPubKey(requestToConnResultMessage.encryptionPubKey);

        if (await conn.peerIdentity.verify(requestToConnResultMessage.signature)) {
          conn.startFromExisting(ws, {});
          this.addConn(peerAddr, conn, peerPath);

          return true;
        }
      }
    }

    return false;
  }

  protected async connectWs(peerPath: string, _opts: ConnManager.ConnectOptsImpl): Promise<void> {
    const conn = new WsConn();
    const peerIdentity = new PeerIdentity(peerPath);
    this.pendingWsConns[peerIdentity.addr] = conn;

    conn.startLink({
      myIdentity: this.agent.myIdentity, peerPath,
      peerIdentity,
      waitForWs: true,
      timeout: this.config.requestToConnTimeout,
    });

    const ws = new WebSocket(peerIdentity.addr);
    ws.onopen = async () => {
      ws.send(JSON.stringify(await makeRequestToConnMessage(this.agent.myIdentity, peerPath)));
    };

    setTimeout(() => {
      ws.close();
    }, this.config.requestToConnTimeout);
  }

  protected async connectUnnamed(peerPath: string, _opts: ConnManager.ConnectOptsImpl): Promise<void> {
    const conn = new WsConn();
    const peerIdentity = new PeerIdentity(peerPath);
    this.pendingWsConns[peerIdentity.addr] = conn;

    const startLinkPromise = conn.startLink({
      myIdentity: this.agent.myIdentity, peerPath,
      peerIdentity,
      timeout: this.config.requestToConnTimeout,
      waitForWs: true,
    });

    const connVia = await this.agent.tunnelManager.create(peerPath);
    connVia.send(await makeRequestToConnMessage(this.agent.myIdentity, peerPath));

    await startLinkPromise;
  }
}

export default WssConnManager;
