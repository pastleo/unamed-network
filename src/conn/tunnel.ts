import Conn, { MessageReceivedEvent } from './base';
import ConnManager from '../conn-manager/base';
import { PeerIdentity } from '../misc/identity';
import { Message as OriMessage } from '../message/message';

declare namespace Tunnel {
  type MessageData = Omit<OriMessage, 'srcAddr' | 'desAddr'> & { [_: string]: any }
  interface Message extends OriMessage {
    tunnelConnId: string;
  }

  interface StartLinkOpts {
    peerAddr: string;
    viaAddr: string; // TODO
  }
}

class Tunnel extends Conn {
  private connManager: ConnManager;
  private viaAddr: string;

  constructor(connManager: ConnManager, tunnelConnId?: string) {
    super(tunnelConnId);
    this.connManager = connManager;
  }

  async startLink(opts: Tunnel.StartLinkOpts): Promise<void> {
    this.peerIdentity = new PeerIdentity(opts.peerAddr);
    this.viaAddr = opts.viaAddr;
    this.state = Conn.State.CONNECTED;
  }

  onReceive(event: MessageReceivedEvent) {
    const detail = event.detail as Tunnel.Message;
    if (
      detail.srcAddr === this.peerIdentity.addr &&
      detail.tunnelConnId === this.connId
    ) {
      this.dispatchEvent(event);
    }
  }

  send(messageContent: Tunnel.MessageData) {
    const message: Tunnel.Message = {
      srcAddr: this.connManager.myIdentity.addr,
      desAddr: this.peerIdentity.addr,
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
