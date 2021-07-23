import EventTarget, { CustomEvent } from './utils/event-target';
import ConnManager from './conn-manager/base';

interface ConfigMandatory {
  id: string,
}
interface ConfigOptional {
  routeTtl: number,
}

type Config = ConfigMandatory & ConfigOptional;
type ArgConfig = ConfigMandatory & Partial<ConfigOptional>;

class HelloEvent extends CustomEvent<void> {
  type = 'hello';
  name: string;
  constructor(name: string) {
    super();
    this.name = name;
  }
}
class BelloEvent extends HelloEvent {
  type = 'bello';
}
interface EventMap {
  "hello": HelloEvent;
  "bello": BelloEvent;
}

export default class Agent extends EventTarget<EventMap> {
  connManager: ConnManager;
  private config: Config

  constructor(connManager: ConnManager, config: ArgConfig) {
    super();
    this.config = {
      routeTtl: 10,
      ...config,
    };
    this.connManager = connManager;
  }

  showConfig() {
    console.log(this.config);
  }

  hello() {
    this.greet(this.config.id);

    setTimeout(() => {
      this.dispatchEvent(new BelloEvent(this.config.id));
    }, 1000);
    setTimeout(() => {
      this.dispatchEvent(new HelloEvent(this.config.id));
    }, 1500);
  }

  private greet(id: string) {
    console.log(`hello, id: ${id}`);
  }
}

