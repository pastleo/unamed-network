export class CustomEvent {
  readonly detail: any;
  readonly type: string;
  defaultPrevented: boolean;
}

type EventHandler = (event: CustomEvent) => void;
interface EventTargetListeners {
  [index: string]: EventHandler[]
}

export default class EventTarget {
  private listeners: EventTargetListeners = {};

  constructor() {}
  addEventListener(type: string, callback: EventHandler) {
    if (!(type in this.listeners)) {
      this.listeners[type] = [];
    }

    this.listeners[type].push(callback);
  }

  removeEventListener(type: string, callback: EventHandler) {
    if (!(type in this.listeners)) return;

    const stack = this.listeners[type];
    stack.splice(stack.indexOf(callback, 1));
  }

  dispatchEvent(event: CustomEvent) {
    if (!(event.type in this.listeners)) return;

    this.listeners[event.type].slice().forEach(callback => {
      callback.call(this, event);
    })

    return !event.defaultPrevented;
  }
}
