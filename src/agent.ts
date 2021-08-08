import EventTarget, { CustomEvent } from './misc/event-target';
import ConnManager, { NewConnEvent } from './conn-manager/base';
import { ConnCloseEvent } from './conn/base';
import Router from './router';
import { Message } from './message/message';
import { MessageReceivedEvent } from './conn/base';
import Identity from './misc/identity';
import TunnelManager from './tunnel';
import { extractAddrFromPath } from './misc/utils';

interface ConfigMandatory {
}
interface ConfigOptional {
  routeTtl: number,
}

type Config = ConfigMandatory & ConfigOptional;
type ArgConfig = ConfigMandatory & Identity.Config & Partial<ConfigOptional>;

export class NetworkMessageReceivedEvent extends CustomEvent<Message> {
  type = 'receive-network';
  messageReceivedEvent: MessageReceivedEvent;
  exactForMe: boolean;

  constructor(messageReceivedEvent: MessageReceivedEvent, myIdentity: Identity) {
    super(messageReceivedEvent.detail);
    this.messageReceivedEvent = messageReceivedEvent;
    this.exactForMe = messageReceivedEvent.desAddr === myIdentity.addr;
  }
}

interface EventMap {
  'receive-network': NetworkMessageReceivedEvent;
}

export default class Agent extends EventTarget<EventMap> {
  myIdentity: Identity;
  connManager: ConnManager;
  tunnelManager: TunnelManager;
  private config: Config;
  private router: Router;

  constructor(connManager: ConnManager, config: ArgConfig = {}) {
    super();
    this.myIdentity = new Identity(config);
    this.config = {
      routeTtl: 10,
      ...config,
    };
    this.connManager = connManager;
    this.router = new Router();
    this.tunnelManager = new TunnelManager(this);

    this.connManager.addEventListener('new-conn', event => {
      this.onNewConn(event);
    });
    this.connManager.addEventListener('close', event => {
      this.onConnClose(event);
    });
    this.connManager.addEventListener('receive', event => {
      this.onReceive(event);
    });
  }

  async start() {
    await this.myIdentity.generateIfNeeded();
    await this.connManager.start(this);
    await this.router.start(this.myIdentity.addr);
    this.tunnelManager.start();
  }

  async connect(peerPath: string): Promise<boolean> {
    await this.connManager.connect(peerPath, {});
    return true;
  }

  async join(_pathWithoutAddr: string): Promise<boolean> {
    // WIP
    //const tunnel = await this.connManager.createTunnel(this.connManager.myIdentity.addr);

    return true;
  }

  send(path: string, message: Omit<Message, 'srcPath' | 'desPath'> & { [_: string]: any }): Promise<boolean> {
    return this.route({
      srcPath: this.myIdentity.addr,
      desPath: path,
      ...message,
    });
  }

  private onNewConn(event: NewConnEvent) {
    this.router.addPath(event.detail.peerPath);
  }

  private onReceive(event: MessageReceivedEvent): void {
    this.tunnelManager.cacheReceive(event.fromConn.peerIdentity.addr, event.detail);

    // TODO: what if this client is not in the dirname?
    if (event.desAddr === this.myIdentity.addr) {
      this.onReceiveMessage(event);
    } else {
      this.route(event.detail, event.fromConn.peerIdentity.addr);
    }
  }

  protected async onReceiveMessage(event: MessageReceivedEvent) {
    this.tunnelManager.onReceiveMessage(event);
    //this.dispatchEvent(new NetworkMessageReceivedEvent(
      //event, this.myIdentity,
    //));
  }

  async route(message: Message, fromAddr?: string): Promise<boolean> {
    const { srcPath, desPath } = message;
    const srcAddr = extractAddrFromPath(srcPath);
    const desAddr = extractAddrFromPath(desPath);

    if (this.connManager.hasConn(desAddr)) {
      return this.connManager.send(desAddr, message);
    }

    const tunnelThroughAddr = this.tunnelManager.route(message);
    if (this.connManager.hasConn(tunnelThroughAddr)) {
      return this.connManager.send(tunnelThroughAddr, message);
    }

    const result = await this.router.route(desPath, fromAddr);

    if (fromAddr && result.mightBeForMe && srcAddr !== this.myIdentity.addr) {
      if (this.routeMessageMightBeForMe(message)) return true;
    }

    if (result.addrs.length === 0) {
      console.warn(
        [
          'agent.ts: send: no available addr to send, router table:',
          this.router.printableTable(desPath),
        ].join('\n'),
        { result }
      );

      return false;
    }

    if (result.broadcast) { // might need to do something before sending out
      result.addrs.forEach(addr => this.connManager.send(addr, message));
      return true;
    } else {
      if (result.notMakingProgressFromBase) {
        // TODO: after join flow complete, this should drop message
        // but allow srcAddr === fromAddr because srcPeer can be connecting first peer
        console.warn(
          [
            `agent.ts: onRoute: message from ${srcPath} to ${desPath} not making progress, router table:`,
            this.router.printableTable(desPath),
          ].join('\n'),
          { result }
        );
      }
      result.addrs.forEach(addr => this.connManager.send(addr, message));
      return true
    }
  }

  private routeMessageMightBeForMe(message: Message): boolean {
    // WIP
    console.log('agent.ts: routeMessageMightBeForMe:', { message });
    //this.dispatchEvent(new NetworkMessageReceivedEvent(
      //event, this.myIdentity,
    //));
    return false;
  }

  private onConnClose(event: ConnCloseEvent) {
    this.router.rmAddr(event.detail.conn.peerIdentity.addr);
  }
}
