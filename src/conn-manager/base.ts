import EventTarget, { CustomEvent } from '../utils/event-target';
import Conn from '../conn/base';

interface RequestToConnEventDetail {
  addr: string;
}
export class RequestToConnEvent extends CustomEvent {
  readonly detail: RequestToConnEventDetail;
}
interface NewConnEventDetail {
  addr: string;
  conn: Conn;
}
export class NewConnEvent extends CustomEvent {
  readonly detail: NewConnEventDetail;
}

interface ConnManagerEventHandlersEventMap {
  'request-to-conn': RequestToConnEvent
  'new-conn': NewConnEvent
}

abstract class ConnManager extends EventTarget {

  abstract start(): Promise<void>;
  abstract connect(addr: string, viaAddr: string): Promise<void>;

  addEventListener<K extends keyof ConnManagerEventHandlersEventMap>(type: K, listener: (this: GlobalEventHandlers, ev: ConnManagerEventHandlersEventMap[K]) => any): void {
    super.addEventListener(type, listener);
  }
  removeEventListener<K extends keyof ConnManagerEventHandlersEventMap>(type: K, listener: (this: GlobalEventHandlers, ev: ConnManagerEventHandlersEventMap[K]) => any): void {
    super.removeEventListener(type, listener);
  }
}

export default ConnManager;
