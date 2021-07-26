import EventTarget, { CustomEvent } from '../utils/event-target';
import { Message, toMessage } from '../utils/message';
import { randomStr } from '../utils/utils';

interface MessageReceivedEventDetail extends Message {
  from: string;
}

export class MessageReceivedEvent extends CustomEvent<MessageReceivedEventDetail> {
  type = 'receive';
}

interface ConnEventMap {
  'receive': MessageReceivedEvent
}

export interface ConnStartLinkOpts {
  myAddr: string;
  peerAddr: string;
  timeout: number;
}

abstract class Conn extends EventTarget<ConnEventMap> {
  connId: string;
  peerAddr: string;
  connected: boolean = false;

  constructor(connId?: string) {
    super();
    this.connId = connId || randomStr();
  }

  abstract startLink(opts: ConnStartLinkOpts): Promise<void>;
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
