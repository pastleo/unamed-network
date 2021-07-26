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
  peerAddr: string;
  timeout: number;
  connVia?: Conn;
  offer?: RTCSessionDescription;
}

abstract class Conn extends EventTarget<ConnEventMap> {
  peerAddr: string;
  connected: boolean = false;

  abstract startLink(opts: ConnStartLinkOpts): Promise<void>;
  abstract close(): Promise<void>;
  abstract send(message: Message): void;
}

export default Conn;
