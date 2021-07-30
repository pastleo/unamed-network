import EventTarget, { CustomEvent } from '../misc/event-target';
import { Message, toMessage } from '../misc/message';
import { randomStr } from '../misc/utils';

interface MessageReceivedEventDetail extends Message {
  from: string;
}

export class MessageReceivedEvent extends CustomEvent<MessageReceivedEventDetail> {
  type = 'receive';
}

interface ConnEventMap {
  'receive': MessageReceivedEvent
}

declare namespace Conn {
  interface Via {
    requestToConn: (peerAddr: string, connId: string, payload: any) => Promise<void>,
    requestToConnResult: (peerAddr: string, connId: string, payload: any) => Promise<void>,
    rtcIce: (peerAddr: string, connId: string, payload?: any) => Promise<void>,
  }
  interface StartLinkOpts {
    myAddr: string;
    peerAddr: string;
    timeout: number;
    beingConnected: boolean;
  }
}

abstract class Conn extends EventTarget<ConnEventMap> {
  connId: string;
  peerAddr: string;
  connected: boolean = false;

  constructor(connId?: string) {
    super();
    this.connId = connId || randomStr();
  }

  abstract startLink(opts: Conn.StartLinkOpts): Promise<void>;

  // TODO
  //abstract onConnVia(peerAddr: string, connId: string, term: string, data: any): void;

  abstract close(): Promise<void>;

  abstract send(message: Message): void;

  protected onMessageData(data: string) {
    const messageContent = toMessage(JSON.parse(data));
    if (messageContent) {
      this.dispatchEvent(new MessageReceivedEvent({ ...messageContent, from: this.peerAddr }))
    }
  }
}

export default Conn;
