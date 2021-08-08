import EventTarget, { CustomEvent } from '../misc/event-target';
import Identity, { PeerIdentity } from '../misc/identity';
import { Message, toMessage } from '../message/message';
import { randomStr } from '../misc/utils';
import { extractAddrFromPath } from '../misc/utils';

export class MessageReceivedEvent extends CustomEvent<Message> {
  type = 'receive';
  fromConn: Conn;
  srcAddr: string;
  desAddr: string;

  constructor(fromConn: Conn, detail: Message) {
    super(detail);
    this.fromConn = fromConn;
    this.srcAddr = extractAddrFromPath(detail.srcPath);
    this.desAddr = extractAddrFromPath(detail.desPath);
  }
}

interface CloseEventDetail {
  conn: Conn;
  bySelf: boolean;
  wsEvent?: CloseEvent
}

export class ConnCloseEvent extends CustomEvent<CloseEventDetail> {
  type = 'close'
}

interface ConnEventMap {
  'receive': MessageReceivedEvent;
  'close': ConnCloseEvent;
}

declare namespace Conn {
  interface StartLinkOpts {
    myIdentity: Identity;
    peerIdentity?: PeerIdentity;
    peerPath: string;
    timeout: number;
    beingConnected?: boolean;
  }

  export const enum State {
    NOT_CONNECTED = 'NOT_CONNECTED',
    CONNECTED = 'CONNECTED',
    FAILED = 'FAILED',
    CLOSED = 'CLOSED',
  }
}

abstract class Conn extends EventTarget<ConnEventMap> {
  connId: string; // preserved, might be useful in the future, difference between 2 side
  peerIdentity: PeerIdentity;
  state: Conn.State = Conn.State.NOT_CONNECTED;

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

  protected onClose(detail: CloseEventDetail) {
    this.dispatchEvent(new ConnCloseEvent(detail));
  }
}

export default Conn;
