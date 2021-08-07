import EventTarget, { CustomEvent } from './misc/event-target';
import ConnManager, { RouteEvent, NewConnEvent } from './conn-manager/base';
import { ConnCloseEvent } from './conn/base';
import Router from './router';
import { Message } from './message/message';

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
  private router: Router;
  //private 

  constructor(connManager: ConnManager, config: ArgConfig = {}) {
    super();
    this.config = {
      routeTtl: 10,
      ...config,
    };
    this.connManager = connManager;
    this.router = new Router();
    this.connManager.addEventListener('new-conn', event => {
      this.onNewConn(event);
    });
    this.connManager.addEventListener('close', event => {
      this.onConnClose(event);
    });
    this.connManager.addEventListener('route', event => {
      this.onRoute(event);
    });
  }

  async start() {
    await this.connManager.start();
    await this.router.start(this.connManager.myIdentity.addr);
  }

  private async onRoute(event: RouteEvent) {
    if (event.detail.directToConn || event.detail.tunnelThroughConn) return;
    const result = await this.router.route(
      event.detail.message.desPath,
      event.detail.fromAddr,
    );

    if (
      result.mightBeForMe &&
      event.detail.srcAddr !== this.connManager.myIdentity.addr
    ) {
      if (this.onMessageMightBeForMe(event.detail.message)) return;
    }
    if (result.addrs.length === 0) {
      console.warn(
        [
          'agent.ts: onRoute: no available addr to send, router table:',
          this.router.printableTable(event.detail.desPath),
        ].join('\n'),
        { event, result }
      );

      return;
    }

    if (result.broadcast) {
      // might need to do something before sending out
      event.detail.send(result.addrs);
    } else {
      if (result.notMakingProgressFromBase) {
        // TODO: after join flow complete, this should drop message
        // but allow srcAddr === fromAddr because srcPeer can be connecting first peer
        console.warn(
          [
            `agent.ts: onRoute: message from ${event.detail.srcPath} to ${event.detail.desPath} not making progress, router table:`,
            this.router.printableTable(event.detail.desPath),
          ].join('\n'),
          { event, result }
        );
      }
      event.detail.send(result.addrs);
    }
  }

  private onMessageMightBeForMe(message: Message): boolean {
    console.log('agent.ts: onMessageMightBeForMe:', { message });
    // WIP
    return false;
  }

  private onNewConn(event: NewConnEvent) {
    this.router.addPath(event.detail.peerPath);
  }

  private onConnClose(event: ConnCloseEvent) {
    this.router.rmAddr(event.detail.conn.peerIdentity.addr);
  }

  //async join(path: string): Promise<boolean> {
  async join(): Promise<boolean> {
    
    return true;
  }

  send(path: string, message: Omit<Message, 'srcPath' | 'desPath'>): void {
    this.connManager.send({
      srcPath: this.connManager.myIdentity.addr,
      desPath: path,
      ...message,
    });
  }
}

