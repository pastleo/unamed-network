export abstract class CustomEvent<DetailT> {
  abstract readonly type: string;
  readonly detail: DetailT;
  defaultPrevented: boolean = false;

  constructor(detail: DetailT) {
    this.detail = detail;
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
}

type EventTargetListeners<EventMapT> = {
  [index: string]: ((this: EventTarget<EventMapT>, ev: EventMapT[keyof EventMapT]) => any)[]
}

export default class EventTarget<EventMapT> {
  private listeners: EventTargetListeners<EventMapT> = {};

  addEventListener<K extends keyof EventMapT>(type: K & string, listener: (this: EventTarget<EventMapT>, ev: EventMapT[K]) => void): void {
    if (!(type in this.listeners)) {
      this.listeners[type] = [];
    }

    this.listeners[type].push(listener);
  }

  removeEventListener<K extends keyof EventMapT>(type: K & string, listener: (this: EventTarget<EventMapT>, ev: EventMapT[K]) => void): void {
    if (!(type in this.listeners)) return;

    const stack = this.listeners[type];
    stack.splice(stack.indexOf(listener, 1));
  }

  dispatchEvent(event: EventMapT[keyof EventMapT] & CustomEvent<any>) : boolean {
    if (!(event.type in this.listeners)) return;

    this.listeners[event.type].slice().forEach(callback => {
      callback.call(this, event);
    })

    return !event.defaultPrevented;
  }
}
