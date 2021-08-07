import Conn, { MessageReceivedEvent } from './base';
import ConnManager from '../conn-manager/base';
import { PeerIdentity } from '../misc/identity';
import { Message as OriMessage } from '../message/message';
import { extractAddrFromPath } from '../misc/utils';

declare namespace Tunnel {
  type MessageData = Omit<OriMessage, 'srcPath' | 'desPath'> & { [_: string]: any }
  interface Message extends OriMessage {
    tunnelConnId: string;
    // TODO: add ttl
  }

  interface StartLinkOpts {
    peerPath: string;
    myPath?: string;
    viaAddr: string; // TODO: remove, Router should handle this
  }
}

class Tunnel extends Conn {
  private connManager: ConnManager;
  private peerPath: string;
  private myPath: string;
  private viaAddr: string;

  constructor(connManager: ConnManager, tunnelConnId?: string) {
    super(tunnelConnId);
    this.connManager = connManager;
  }

  async startLink(opts: Tunnel.StartLinkOpts): Promise<void> {
    this.peerPath = opts.peerPath;
    this.peerIdentity = new PeerIdentity(opts.peerPath);
    this.viaAddr = opts.viaAddr;
    if (opts.myPath) {
      this.myPath = opts.myPath;
    } else {
      this.myPath = this.connManager.myIdentity.addr;
    }

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
      ...messageContent,
    }
    this.connManager.send(message);
  }

  async close(): Promise<void> {
    this.connManager.closeTunnel(this, this.connId);
  }

  setConnected(connected: boolean) {
    this.state = connected ? Conn.State.CONNECTED : Conn.State.CLOSED;
  }
}

export default Tunnel;

declare namespace TunnelThroughs {
  type tunnelConnId = string;
  type path = string;
  type peerAddr = string;

  type ConnIdToThroughs = Record<tunnelConnId, Record<path, peerAddr>>;
  export const enum Type { RECEIVE = 'RECEIVE', SEND = 'SEND' }
}

class TunnelThroughs {
  private connIdToThroughs: TunnelThroughs.ConnIdToThroughs = {};

  cache(peerAddr: string, message: OriMessage, type: TunnelThroughs.Type): void {
    const { tunnelConnId } = message as Tunnel.Message;
    if (tunnelConnId) {
      let path;
      switch (type) {
        case TunnelThroughs.Type.RECEIVE:
          path = message.srcPath;
          break;
        case TunnelThroughs.Type.SEND:
          path = message.desPath;
          break;
        default:
          return;
      }
      if (path === peerAddr) return;

      let through = this.connIdToThroughs[tunnelConnId];
      if (!through) {
        through = {};
        this.connIdToThroughs[tunnelConnId] = through;
      }

      if (!through[path] && Object.values(through).length < 2) {
        through[path] = peerAddr;
      }
    }
  }

  find(path: string, message: OriMessage): TunnelThroughs.peerAddr | null {
    const { tunnelConnId } = message as Tunnel.Message;

    if (tunnelConnId) {
      return this.connIdToThroughs[tunnelConnId]?.[path];
    }
  }
}

export { TunnelThroughs };
