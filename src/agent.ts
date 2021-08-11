import EventTarget from './misc/event-target';
import ConnManager, { NewConnEvent } from './conn-manager/base';
import { ConnCloseEvent } from './conn/base';
import Router from './router';
import { Message, MessageData } from './message/message';
import { deriveNetworkMessage } from './message/network';
import { MessageReceivedEvent } from './conn/base';
import { NetworkMessageReceivedEvent } from './misc/events';
import Identity from './misc/identity';
import TunnelManager from './tunnel';
import RequestManager from './request';
import { extractAddrFromPath } from './misc/utils';

declare namespace Agent {
  type Config = {
    routeTtl: number;
    requestTimeout: number;
  } & Identity.Config;
}

interface EventMap {
  'receive-network': NetworkMessageReceivedEvent;
}

const agentDefaultConfig: Agent.Config = {
  routeTtl: 10,
  requestTimeout: 1000,
}

class Agent extends EventTarget<EventMap> {
  myIdentity: Identity;
  connManager: ConnManager;
  tunnelManager: TunnelManager;
  requestManager: RequestManager;
  private config: Agent.Config;
  private router: Router;
  private receivedMsgId = new Set<string>();

  constructor(connManager: ConnManager, config: Partial<Agent.Config> = {}) {
    super();
    this.myIdentity = new Identity(config);
    this.config = { ...agentDefaultConfig, ...config };
    this.connManager = connManager;
    this.router = new Router();
    this.tunnelManager = new TunnelManager(this);
    this.requestManager = new RequestManager(this, {
      timeout: this.config.requestTimeout,
    });

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

  send(path: string, message: MessageData): Promise<boolean> {
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
    this.tunnelManager.cacheReceive(event.fromConn.peerIdentity.addr, event.srcAddr, event.detail);
    this.requestManager.cacheReceive(event.fromConn.peerIdentity.addr, event.srcAddr, event.detail);

    // TODO: what if this client is not in the dirname?
    if (event.desAddr === this.myIdentity.addr) {
      this.onReceiveMessage(event);
    } else {
      this.route(event.detail, event);
    }
  }

  protected async onReceiveMessage(event: MessageReceivedEvent) {
    if (
      this.tunnelManager.onReceiveMessage(event)
    ) return;

    this.handleReceiveNetworkMessage(new NetworkMessageReceivedEvent(event, true));
  }

  async route(message: Message, receiveEvent?: MessageReceivedEvent): Promise<boolean> {
    const networkMessage = deriveNetworkMessage(message, this.config.routeTtl);
    const { srcPath, desPath, msgId } = networkMessage;
    const srcAddr = extractAddrFromPath(srcPath);
    const desAddr = extractAddrFromPath(desPath);

    if (networkMessage.ttl < 0) {
      console.warn(`message run out of ttl from '${srcPath}' to '${desPath}', dropping message:`, message);
      return false;
    }

    if (this.receivedMsgId.has(msgId)) {
      console.warn(`received twice (or more) same message with msgId '${msgId}' from '${srcPath}' to '${desPath}', dropping message:`, message);
      return false;
    } else {
      this.receivedMsgId.add(msgId);
    }

    if (this.connManager.hasConn(desAddr)) {
      return this.connManager.send(desAddr, networkMessage);
    }

    const tunnelThroughAddr = this.tunnelManager.route(networkMessage);
    if (this.connManager.hasConn(tunnelThroughAddr)) {
      return this.connManager.send(tunnelThroughAddr, networkMessage);
    }

    const requestThroughAddr = this.requestManager.route(networkMessage);
    if (this.connManager.hasConn(requestThroughAddr)) {
      return this.connManager.send(requestThroughAddr, networkMessage);
    }

    const result = await this.router.route(desPath, receiveEvent?.fromConn.peerIdentity.addr);

    if (receiveEvent && result.mightBeForMe && srcAddr !== this.myIdentity.addr) {
      if (this.routeMessageMightBeForMe(receiveEvent)) return true;
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
      result.addrs.forEach(addr => this.connManager.send(addr, networkMessage));
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
      result.addrs.forEach(addr => this.connManager.send(addr, networkMessage));
      return true
    }
  }

  private routeMessageMightBeForMe(event: MessageReceivedEvent): boolean {
    const networkMessageEvent = new NetworkMessageReceivedEvent(event, false);
    this.handleReceiveNetworkMessage(networkMessageEvent);
    return networkMessageEvent.defaultPrevented;
  }

  private handleReceiveNetworkMessage(event: NetworkMessageReceivedEvent) {
    if (
      this.requestManager.onReceiveNetworkMessage(event)
    ) return;

    this.dispatchEvent(event);
  }

  private onConnClose(event: ConnCloseEvent) {
    this.router.rmAddr(event.detail.conn.peerIdentity.addr);
  }
}

export default Agent;
