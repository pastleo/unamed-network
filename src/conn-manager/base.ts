import EventTarget, { CustomEvent } from '../misc/event-target';
import Identity, { PeerIdentity } from '../misc/identity';
import Conn, { MessageReceivedEvent, ConnCloseEvent } from '../conn/base';
import WsConn from '../conn/ws';
import RtcConn from '../conn/rtc';
import Tunnel, { TunnelThroughs } from '../conn/tunnel';
import { Message, NetworkMessage, deriveNetworkMessage } from '../message/message';
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
  peerPath: string;
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
  srcAddr: string;
  desAddr: string;
  fromAddr?: string;
  directToConn?: Conn; // conn in connManager.conns that this message can be directly sent
  tunnelThroughConn?: Conn; // conn 
  message: Message;
  send: (addrs: string[]) => void;
}
export class RouteEvent extends CustomEvent<RouteEventDetail> {
  type = 'route'
  toConn?: Conn; // set this from network layer decision for link layer (connManager)
}

interface EventMap {
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

abstract class ConnManager extends EventTarget<EventMap> {
  protected conns: Record<string, Conn> = {};
  protected config: ConnManager.Config;
  myIdentity: Identity;

  private tunnels: Record<string, Tunnel> = {};
  private tunnelThroughs: TunnelThroughs = new TunnelThroughs();

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

  send(message: Message, fromConn?: Conn): void {
    const { srcPath, desPath } = message;
    const srcAddr = extractAddrFromPath(srcPath);
    const desAddr = extractAddrFromPath(desPath);
    const directToConn = this.conns[desAddr];
    let tunnelThroughAddr, tunnelThroughConn;
    
    if (!directToConn) {
      tunnelThroughAddr = this.tunnelThroughs.find(desPath, message);
      tunnelThroughConn = this.conns[tunnelThroughAddr];
    }

    const networkMessage = deriveNetworkMessage(message);
    const routeEvent = new RouteEvent({
      srcPath, desPath,
      srcAddr, desAddr,
      fromAddr: fromConn?.peerIdentity?.addr,
      directToConn, tunnelThroughConn,
      message: networkMessage,
      send: (addrs: string[]) => {
        this.tunnelThroughs.cache(addrs[0], networkMessage, TunnelThroughs.Type.SEND)
        addrs.forEach(addr => {
          this.conns[addr].send(networkMessage);
        });
      },
    });

    this.dispatchEvent(routeEvent);
    
    if (!routeEvent.defaultPrevented) {
      if (directToConn) return directToConn.send(networkMessage);
      if (tunnelThroughConn) return tunnelThroughConn.send(networkMessage);
    }
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

  protected addConn(peerAddr: string, conn: Conn, peerPath: string): void {
    if (peerAddr === this.myIdentity.addr) {
      console.warn('adding conn of myself!?');
      conn.close();
      return;
    }
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

    this.dispatchEvent(new NewConnEvent({ conn, peerPath, reconnected }));
  }

  private onReceive(event: MessageReceivedEvent): void {
    this.tunnelThroughs.cache(event.fromConn.peerIdentity.addr, event.detail, TunnelThroughs.Type.RECEIVE);

    // TODO: what if this client is not in the dirname?
    if (event.desAddr === this.myIdentity.addr) {
      this.dispatchEvent(event);

      if (!event.defaultPrevented) {
        this.onReceiveMessage(event);
      }
    } else {
      this.send(event.detail, event.fromConn);
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
}

export default ConnManager;
