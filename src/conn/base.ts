import EventTarget, { CustomEvent } from '../misc/event-target';
import Identity, { PeerIdentity } from '../misc/identity';
import Tunnel from '../conn/tunnel';
import { Message, toMessage } from '../message/message';
import { randomStr } from '../misc/utils';

export class MessageReceivedEvent extends CustomEvent<Message> {
  type = 'receive';
  fromConn: Conn;

  constructor(fromConn: Conn, detail: Message) {
    super(detail);
    this.fromConn = fromConn;
  }
}

interface ConnEventMap {
  'receive': MessageReceivedEvent
}

declare namespace Conn {
  interface StartLinkOpts {
    myIdentity: Identity;
    peerIdentity?: PeerIdentity;
    peerAddr: string;
    timeout: number;
    beingConnected?: boolean;
    connVia?: Tunnel;
  }
}

abstract class Conn extends EventTarget<ConnEventMap> {
  connId: string; // preserved, might be useful in the future, difference between 2 side
  peerIdentity: PeerIdentity;
  connected: boolean = false;

  constructor(connId?: string) {
    super();
    this.connId = connId || randomStr();
  }

  abstract startLink(opts: Conn.StartLinkOpts | {[_: string]: any}): Promise<void>;

  abstract close(): Promise<void>;

  abstract send(message: Message): void;

  protected onMessageData(data: string) {
    const messageContent = toMessage(JSON.parse(data));
    if (messageContent) {
      this.dispatchEvent(new MessageReceivedEvent(this, messageContent))
    }
  }
}

export default Conn;
