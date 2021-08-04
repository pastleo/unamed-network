import EventTarget, { CustomEvent } from './misc/event-target';
import ConnManager, { RouteEvent } from './conn-manager/base';

interface ConfigMandatory {
}
interface ConfigOptional {
  routeTtl: number,
}

type Config = ConfigMandatory & ConfigOptional;
type ArgConfig = ConfigMandatory & Partial<ConfigOptional>;

interface EventMap {
}

export default class Agent extends EventTarget<EventMap> {
  connManager: ConnManager;
  private config: Config;
  private joinedPath: string[];

  constructor(connManager: ConnManager, config: ArgConfig = {}) {
    super();
    this.config = {
      routeTtl: 10,
      ...config,
    };
    this.connManager = connManager;
    this.connManager.addEventListener('route', event => {
      this.onRoute(event);
    });
  }

  private onRoute(event: RouteEvent) {
    console.log('onRoute', event);
  }

  async join(path: string): Promise<boolean> {
    this.joinedPath.push(path);
    return false;
  }

  //send(path: string, message: 
}

