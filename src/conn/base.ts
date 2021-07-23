import EventTarget, { CustomEvent } from '../utils/event-target';
import { Message } from '../utils/message';

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
  addr: string;
}

abstract class Conn extends EventTarget<ConnEventMap> {

  abstract startLink(opts: ConnStartLinkOpts): Promise<void>;
  abstract close(): Promise<void>;
  abstract send(term: string, payload: any): void;
}

export default Conn;
