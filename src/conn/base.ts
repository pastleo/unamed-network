import EventTarget, { CustomEvent } from '../utils/event-target';

export enum MessageTerm {}
interface MessageReceivedEventDetail {
  term: MessageTerm
  payload: any
}
class MessageReceivedEvent extends CustomEvent {
  readonly detail: MessageReceivedEventDetail
}

interface ConnEventHandlersEventMap {
  'receive': MessageReceivedEvent
}

export interface ConnStartLinkOpts {
  addr: string;
}

abstract class Conn extends EventTarget {

  abstract startLink(opts: ConnStartLinkOpts): Promise<void>;
  abstract close(): Promise<void>;
  abstract send(term: MessageTerm, payload: any): void;

  addEventListener<K extends keyof ConnEventHandlersEventMap>(type: K, listener: (this: GlobalEventHandlers, ev: ConnEventHandlersEventMap[K]) => any): void {
    super.addEventListener(type, listener);
  }
  removeEventListener<K extends keyof ConnEventHandlersEventMap>(type: K, listener: (this: GlobalEventHandlers, ev: ConnEventHandlersEventMap[K]) => any): void {
    super.removeEventListener(type, listener);
  }
}

export default Conn;
