import Agent from './agent';
import EventTarget, { CustomEvent } from './misc/event-target'
import Conn, { MessageReceivedEvent } from './conn/base';
import { PeerIdentity } from './misc/identity';
import { Message as OriMessage } from './message/message';
import { extractAddrFromPath } from './misc/utils';

declare namespace Tunnel {
  type MessageData = Omit<OriMessage, 'srcPath' | 'desPath'> & { [_: string]: any }
  export const enum Direction { A = 'A', B = 'B' }
  interface Message extends OriMessage {
    tunnelConnId: string;
    direction: Direction;
  }

  interface StartLinkOpts {
    peerPath: string;
    myPath: string;
    send: (message: Tunnel.Message) => void;
    close: () => void;
  }

  type tunnelConnId = string;
  type ConnIdToThroughs = Record<tunnelConnId, Record<string, [path: string, peerAddr: string]>>;
}

interface NewTunnelEventDetail {
  tunnel: TunnelConn;
}
class NewTunnelEvent extends CustomEvent<NewTunnelEventDetail> {
  type = 'new-tunnel'
}

interface EventMap {
  'new-tunnel': NewTunnelEvent;
}

class TunnelManager extends EventTarget<EventMap> {
  private agent: Agent;
  private tunnels: Record<string, TunnelConn> = {};

  private connIdToThroughs: Tunnel.ConnIdToThroughs = {};

  constructor(agent: Agent) {
    super();
    this.agent = agent;
  }

  start() {
  }

  async onReceiveMessage(event: MessageReceivedEvent) {
    const { tunnelConnId } = event.detail as Tunnel.Message;
    const tunnel = this.tunnels[tunnelConnId];
    if (tunnel) {
      tunnel.onReceive(event);
    } else if (tunnelConnId) {
      const newTunnel = new TunnelConn(tunnelConnId);

      const newTunnelEvent = new NewTunnelEvent({ tunnel: newTunnel });
      this.dispatchEvent(newTunnelEvent);

      if (!newTunnelEvent.defaultPrevented) {
        const { srcPath: peerPath } = event.detail;
        this.tunnels[newTunnel.connId] = newTunnel;
        await this.startTunnel(peerPath, newTunnel);
        newTunnel.onReceive(event);
      }
    }
  }

  async create(peerPath: string, tunnelConnId?: string): Promise<TunnelConn> {
    const tunnel = new TunnelConn(tunnelConnId);
    this.tunnels[tunnel.connId] = tunnel;
    await this.startTunnel(peerPath, tunnel);

    return tunnel;
  }

  private async startTunnel(peerPath: string, tunnel: TunnelConn): Promise<TunnelConn> {
    await tunnel.startLink({
      myPath: this.agent.myIdentity.addr, // TODO: subspace
      peerPath,
      send: (message: Tunnel.Message) => {
        this.agent.route(message);
      },
      close: () => {
        delete this.tunnels[tunnel.connId];
      },
    });

    return tunnel;
  }

  cacheReceive(fromPeerAddr: string, message: OriMessage): void {
    const { tunnelConnId, direction } = message as Tunnel.Message;

    switch (direction) {
      case Tunnel.Direction.A:
        return this.saveCache(tunnelConnId, Tunnel.Direction.B, message.srcPath, fromPeerAddr);
      case Tunnel.Direction.B:
        return this.saveCache(tunnelConnId, Tunnel.Direction.A, message.srcPath, fromPeerAddr);
    }
  }

  cacheSend(toPeerAddr: string, message: OriMessage): void {
    const { tunnelConnId, direction } = message as Tunnel.Message;

    this.saveCache(tunnelConnId, direction, message.desPath, toPeerAddr);
  }

  private saveCache(tunnelConnId: string, direction: Tunnel.Direction, desPath: string, peerAddr: string) {
    let through = this.connIdToThroughs[tunnelConnId];
    if (!through) {
      through = {};
      this.connIdToThroughs[tunnelConnId] = through;
    }

    if (!through[direction] && Object.values(through).length < 2) {
      through[direction] = [desPath, peerAddr];
    }
  }

  route(message: OriMessage): string | null {
    const { tunnelConnId, direction } = message as Tunnel.Message;

    if (tunnelConnId && direction) {
      const through = this.connIdToThroughs[tunnelConnId]?.[direction];
      if (through) {
        const [desPath, peerAddr] = through;
        if (message.desPath === desPath) return peerAddr;
      }
    }
  }
}

export default TunnelManager;

class TunnelConn extends Conn {
  private peerPath: string;
  private myPath: string;
  private direction: Tunnel.Direction;
  private sendFunc: (message: Tunnel.Message) => void;
  private closeFunc: () => void;

  constructor(tunnelConnId?: string) {
    super(tunnelConnId);
    this.direction = tunnelConnId ? Tunnel.Direction.B : Tunnel.Direction.A;
  }

  async startLink(opts: Tunnel.StartLinkOpts): Promise<void> {
    this.peerPath = opts.peerPath;
    this.peerIdentity = new PeerIdentity(opts.peerPath);
    this.myPath = opts.myPath;
    this.sendFunc = opts.send;
    this.closeFunc = opts.close;

    this.state = Conn.State.CONNECTED;
  }

  onReceive(event: MessageReceivedEvent) {
    const detail = event.detail as Tunnel.Message;
    const srcAddr = extractAddrFromPath(detail.srcPath);
    if (
      srcAddr === this.peerIdentity.addr &&
      detail.tunnelConnId === this.connId
    ) {
      this.dispatchEvent(event);
    }
  }

  send(messageContent: Tunnel.MessageData) {
    const message: Tunnel.Message = {
      srcPath: this.myPath,
      desPath: this.peerPath,
      tunnelConnId: this.connId,
      direction: this.direction,
      ...messageContent,
    }
    this.sendFunc(message);
  }

  async close(): Promise<void> {
    this.state = Conn.State.CLOSED;
    this.closeFunc();
  }
}

export { TunnelConn, NewTunnelEvent };
