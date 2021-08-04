import EventTarget, { CustomEvent } from '../misc/event-target';
import Identity, { PeerIdentity } from '../misc/identity';
import Conn, { MessageReceivedEvent, ConnCloseEvent } from '../conn/base';
import WsConn from '../conn/ws';
import RtcConn from '../conn/rtc';
import Tunnel from '../conn/tunnel';
import { Message } from '../message/message';
import { extractAddrFromPath } from '../misc/utils';

interface RequestToConnEventDetail {
  peerPath: string;
  peerIdentity: PeerIdentity;
}
export class RequestToConnEvent extends CustomEvent<RequestToConnEventDetail> {
  type = 'request-to-conn'
  peerAddr: string;
  constructor(detail: RequestToConnEventDetail) {
    super(detail);
    this.peerAddr = extractAddrFromPath(detail.peerPath);
  }
  reject() {
    this.defaultPrevented = false;
  }
}

interface NewConnEventDetail {
  conn: Conn;
  reconnected: boolean;
}
export class NewConnEvent extends CustomEvent<NewConnEventDetail> {
  type = 'new-conn'
}

interface NewTunnelEventDetail {
  tunnel: Tunnel;
}
export class NewTunnelEvent extends CustomEvent<NewTunnelEventDetail> {
  type = 'new-tunnel'
}

interface RouteEventDetail {
  srcPath: string;
  desPath: string;
  fromConn: Conn;
  directToConn: Conn; // conn in connManager.conns that this message can be directly sent
  message: Message;
}
export class RouteEvent extends CustomEvent<RouteEventDetail> {
  type = 'route'
  toConn?: Conn; // set this from network layer decision for link layer (connManager)
}

interface ConnManagerEventMap {
  'request-to-conn': RequestToConnEvent;
  'new-conn': NewConnEvent;
  'close': ConnCloseEvent;
  'receive': MessageReceivedEvent;
  'new-tunnel': NewTunnelEvent;
  'route': RouteEvent;
}

declare namespace ConnManager {
  interface ConnManagerConfig {
    newConnTimeout: number;
    requestToConnTimeout: number;
    [opt: string]: any;
  }
  type Config = ConnManager.ConnManagerConfig | Identity.Config;
  type ConnectOpts = Partial<WsConn.StartLinkOpts | RtcConn.StartLinkOpts>;
}

const configDefault: ConnManager.Config = {
  newConnTimeout: 1000,
  requestToConnTimeout: 1000,
}

abstract class ConnManager extends EventTarget<ConnManagerEventMap> {
  protected conns: Record<string, Conn> = {};
  protected config: ConnManager.Config;
  myIdentity: Identity;

  private tunnels: Record<string, Tunnel> = {};

  constructor(config: Partial<ConnManager.Config> = {}) {
    super();
    this.config = { ...configDefault, ...config };
    this.myIdentity = new Identity(config);
  }

  async start(): Promise<void> {
    await this.myIdentity.generateIfNeeded();
  }

  connect(peerPath: string, viaAddr: string, opts: ConnManager.ConnectOpts = {}): Promise<void> {
    const peerAddr = extractAddrFromPath(peerPath);
    if (peerAddr in this.conns) {
      console.warn(`Peer '${peerAddr}' already connected, original conn will be closed`);
    }
    if (peerAddr.match(/^wss?:\/\//)) {
      return this.connectWs(peerPath, viaAddr, opts);
    } else {
      return this.connectUnnamed(peerPath, viaAddr, opts);
    }
  }

  protected abstract connectWs(peerPath: string, viaAddr: string, opts: ConnManager.ConnectOpts): Promise<void>;

  protected abstract connectUnnamed(peerPath: string, viaAddr: string, opts: ConnManager.ConnectOpts): Promise<void>;

  getConn(peerAddr: string): Conn {
    const conn = this.conns[peerAddr];
    if (!conn) {
      throw new Error(`conn not found for ${peerAddr}`);
    }
    return conn;
  }

  send(peerAddr: string, message: Message): void {
    this.getConn(peerAddr).send(message);
  }

  async createTunnel(peerPath: string, viaAddr: string, tunnelConnId?: string): Promise<Tunnel> {
    const tunnel = new Tunnel(this, tunnelConnId);
    await tunnel.startLink({ peerPath, viaAddr });
    this.tunnels[tunnel.connId] = tunnel;

    return tunnel;
  }

  closeTunnel(tunnel: Tunnel, tunnelConnId?: string) {
    if (tunnelConnId) {
      tunnel.setConnected(false);
      delete this.tunnels[tunnelConnId];
    } else {
      tunnel.close();
    }
  }

  protected addConn(peerAddr: string, conn: Conn): void {
    const reconnected = peerAddr in this.conns;
    if (reconnected) {
      this.conns[peerAddr].close();
    }

    this.conns[peerAddr] = conn;

    conn.addEventListener('receive', event => {
      this.onReceive(event);
    });
    conn.addEventListener('close', event => {
      this.dispatchEvent(event);
      if (conn.connId === this.conns[peerAddr].connId) { // prevent reconnect closing delete new connection
        delete this.conns[peerAddr];
      }
    });

    this.dispatchEvent(new NewConnEvent({ conn, reconnected }));
  }

  private onReceive(event: MessageReceivedEvent): void {
    const { srcPath, desPath } = event.detail;

    // TODO: what if this client is not in the dirname?
    if (event.desAddr === this.myIdentity.addr) {
      this.dispatchEvent(event);

      if (!event.defaultPrevented) {
        this.onReceiveMessage(event);
      }
    } else {
      this.onRouteMessage(srcPath, desPath, event);
    }
  }

  protected async onReceiveMessage(event: MessageReceivedEvent) {
    const { tunnelConnId } = event.detail as Tunnel.Message;
    const tunnel = this.tunnels[tunnelConnId];
    if (tunnel) {
      tunnel.onReceive(event);
    } else if (tunnelConnId) {
      const tunnel = new Tunnel(this, tunnelConnId);
      const newTunnelEvent = new NewTunnelEvent({ tunnel });
      this.dispatchEvent(newTunnelEvent);
      if (!newTunnelEvent.defaultPrevented) {
        const { srcPath: peerPath } = event.detail;
        this.tunnels[tunnel.connId] = tunnel;
        await tunnel.startLink({ peerPath, viaAddr: event.fromConn.peerIdentity.addr });
        tunnel.onReceive(event);
      }
    }
  }

  protected onRouteMessage(srcPath: string, desPath: string, event: MessageReceivedEvent) {
    const directToConn = this.conns[event.desAddr];
    const routeEvent = new RouteEvent({
      fromConn: event.fromConn,
      directToConn, srcPath, desPath,
      message: event.detail,
    });

    this.dispatchEvent(routeEvent);

    const toConn = routeEvent.toConn || directToConn;
    
    if (!routeEvent.defaultPrevented) {
      if (toConn) toConn.send(event.detail);
      else console.warn(`desAddr '${event.desAddr}' (path: '${desPath}') not connected`);
    }
  }
}

export default ConnManager;
