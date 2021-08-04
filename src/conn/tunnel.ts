import Conn, { MessageReceivedEvent } from './base';
import ConnManager from '../conn-manager/base';
import { PeerIdentity } from '../misc/identity';
import { Message as OriMessage } from '../message/message';
import { extractAddrFromPath } from '../misc/utils';

declare namespace Tunnel {
  type MessageData = Omit<OriMessage, 'srcPath' | 'desPath'> & { [_: string]: any }
  interface Message extends OriMessage {
    tunnelConnId: string;
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
    this.connManager.send(this.viaAddr, message);
  }

  async close(): Promise<void> {
    this.connManager.closeTunnel(this, this.connId);
  }

  setConnected(connected: boolean) {
    this.state = connected ? Conn.State.CONNECTED : Conn.State.CLOSED;
  }
}

export default Tunnel;
