import EventTarget from './misc/event-target';
import ConnManager, { NewConnEvent } from './conn-manager/base';
import { ConnCloseEvent } from './conn/base';
import Router, { hashLine, mergeKBuckets } from './router';
import { Message, MessageData } from './message/message';
import {
  deriveNetworkMessage,
  QueryAddrsMessage, QueryAddrsMessageData, deriveQueryAddrsMessage,
  QueryAddrsResponseMessage, QueryAddrsResponseMessageData, deriveQueryAddrsResponseMessage,
} from './message/network';
import { MessageReceivedEvent } from './conn/base';
import { NetworkMessageReceivedEvent } from './misc/events';
import Identity from './misc/identity';
import TunnelManager from './tunnel';
import RequestManager, { RequestedEvent } from './request';
import { joinPath, extractAddrFromPath, wait } from './misc/utils';

declare namespace Agent {
  type Config = {
    routeTtl: number;
    requestTimeout: number;
  } & Identity.Config;
}

interface EventMap {
  'receive-network': NetworkMessageReceivedEvent;
  'new-conn': NewConnEvent;
  'close': ConnCloseEvent;
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

    this.requestManager.addEventListener('requested', event => {
      this.onRequested(event);
    });
  }

  async start() {
    await this.myIdentity.generateIfNeeded();
    await this.connManager.start(this);
    await this.router.start(this.myIdentity.addr);
  }

  async connect(peerPath: string): Promise<boolean> {
    const peerAddr = extractAddrFromPath(peerPath);
    if (this.connManager.hasConn(peerAddr)) {
      await this.router.addPath(peerPath);
    } else {
      await this.connManager.connect(peerPath, {});
      await this.router.addPath(peerPath);
    }
    return true;
  }

  async join(spacePath: string = ''): Promise<boolean> {
    let connectSpaceNeighborSucceed = false;
    let connectSpaceNeighborTried = 0;
    let addrResponse: QueryAddrsResponseMessage;
    while(!connectSpaceNeighborSucceed && connectSpaceNeighborTried < 3) {
      try {
        addrResponse = await this.connectSpaceNeighbor(spacePath);
        connectSpaceNeighborSucceed = true;
      } catch (err) {
        console.warn(`agent.ts: join: connectSpaceNeighbor failed, #${connectSpaceNeighborTried} retry in 3 secs...`, err);
        connectSpaceNeighborTried++;
        await wait(3000);
      }
    }
    if (!connectSpaceNeighborSucceed) return false;

    let connectSpacePeersSucceed = false;
    let connectSpacePeersTried = 0;
    while(!connectSpacePeersSucceed && connectSpacePeersTried < 3) {
      try {
        await this.connectSpacePeers(
          spacePath,
          addrResponse.addrs,
          extractAddrFromPath(addrResponse.srcPath),
        );
        connectSpacePeersSucceed = true;
      } catch (err) {
        console.warn(`agent.ts: join: connectSpacePeers failed, #${connectSpacePeersTried} retry in 3 secs...`, err);
        connectSpacePeersTried++;
        await wait(3000);
      }
    }

    return true;
  }

  private async connectSpaceNeighbor(spacePath: string): Promise<QueryAddrsResponseMessage> {
    const request = await this.requestManager.request(this.myIdentity.addr, makeRequestAddrMessage(spacePath));
    const addrResponse = deriveQueryAddrsResponseMessage(request.responseMessage);

    await this.connect(addrResponse.srcPath);
    await this.router.addPath(addrResponse.srcPath);

    return addrResponse;
  }

  private async connectSpacePeers(spacePath: string, knownAddrs: string[], neighborAddr: string) {
    const addrAndHashes = await hashLine(knownAddrs);

    const existingKBuckets = this.router.buildSpaceKBuckets(spacePath);
    const responseKBuckets = this.router.buildKBuckets(addrAndHashes);
    const nextRequestKBuckets = mergeKBuckets(existingKBuckets, responseKBuckets);
    this.router.removeLines(
      nextRequestKBuckets,
      [this.router.getLine(spacePath, neighborAddr)]
    );

    let nextRequestMaxK = -1;
    let nextRequestMinK = Number.MAX_VALUE;
    nextRequestKBuckets.forEach((_bucket, k) => {
      if (k < nextRequestMinK) nextRequestMinK = k;
      if (k > nextRequestMaxK) nextRequestMaxK = k;
    });

    const nextRequestAddrs = (nextRequestKBuckets.size > 0 ? (
      nextRequestKBuckets.size >= 2 ? [nextRequestMaxK, nextRequestMinK] : [nextRequestMaxK]
    ) : []).map(
      k => nextRequestKBuckets.get(k)
    ).map(
      lines => lines[Math.floor(Math.random() * lines.length)][1]
    );

    let connectingKBuckets = responseKBuckets;

    await Promise.all(
      nextRequestAddrs.map(async addr => {
        const subRequest = await this.requestManager.request(joinPath(spacePath, addr), makeRequestAddrMessage(spacePath));
        const subAddrResponse = deriveQueryAddrsResponseMessage(subRequest.responseMessage);
        const addrAndHashes = await hashLine(subAddrResponse.addrs);
        connectingKBuckets = mergeKBuckets(
          connectingKBuckets, this.router.buildKBuckets(
            addrAndHashes
          )
        );
      })
    );
    this.router.removeLines(connectingKBuckets, this.router.getSpace(spacePath).table);

    const addrsToConnect = this.router.pickAddrsToConnect(connectingKBuckets, existingKBuckets);

    await Promise.all(
      addrsToConnect.map(addr => (
        this.connect(joinPath(spacePath, addr))
      ))
    );
  }

  // WIP
  leave(_spacePath: string) {}
  listKnownAddrs(_spacePath: string) {}
  broadcast(_spacePath: string) {}

  send(path: string, message: MessageData): Promise<boolean> {
    return this.route({
      srcPath: this.myIdentity.addr,
      desPath: path,
      ...message,
    });
  }

  private async onNewConn(event: NewConnEvent) {
    await this.router.addPath(event.detail.peerPath);
    this.dispatchEvent(event);
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

    // TODO: after DHT is done, this might be removed making sure not routing back for initial query-node
    if (this.connManager.hasConn(desAddr) && receiveEvent?.fromConn.peerIdentity.addr !== desAddr) {
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
        { result, message }
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
          { result, message }
        );
      }
      result.addrs.forEach(addr => this.connManager.send(addr, networkMessage));
      return true
    }
  }

  private routeMessageMightBeForMe(event: MessageReceivedEvent): boolean {
    const networkMessageEvent = new NetworkMessageReceivedEvent(event, false);
    return this.handleReceiveNetworkMessage(networkMessageEvent);
  }

  private handleReceiveNetworkMessage(event: NetworkMessageReceivedEvent): boolean {
    if (
      this.requestManager.onReceiveNetworkMessage(event)
    ) {
      return true;
    };

    this.dispatchEvent(event);
    return event.defaultPrevented;
  }

  private async onConnClose(event: ConnCloseEvent) {
    this.router.rmAddr(event.detail.conn.peerIdentity.addr);
    this.dispatchEvent(event);
  }

  private onRequested(event: RequestedEvent) {
    switch (event.detail.term) {
      case 'query-addrs':
        return this.onRequestedAddrs(deriveQueryAddrsMessage(event.detail), event);
    }
  }

  private onRequestedAddrs(message: QueryAddrsMessage, event: RequestedEvent) {
    const space = this.router.getSpaceAndAddr(message.desPath)[0];
    const srcAddr = extractAddrFromPath(message.srcPath);
    const response: QueryAddrsResponseMessageData = {
      term: 'query-addrs-response',
      addrs: [
        ...space.table.map(line => line[1]).filter(addr => addr !== srcAddr),
      ],
    };
    event.response(response);
  }
}

export default Agent;

function makeRequestAddrMessage(spacePath: string): QueryAddrsMessageData {
  return {
    term: 'query-addrs',
    spacePath,
  };
}
