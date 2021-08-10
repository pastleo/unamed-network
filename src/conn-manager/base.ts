import Agent from '../agent';
import Conn, { MessageReceivedEvent, ConnCloseEvent } from '../conn/base';
import EventTarget, { CustomEvent } from '../misc/event-target';
import { PeerIdentity } from '../misc/identity';
import { extractAddrFromPath } from '../misc/utils';
import { Message } from '../message/message';

import { Optional, Required } from 'utility-types';

interface RequestToConnEventDetail {
  peerPath: string;
  peerIdentity: PeerIdentity;
}
export class RequestToConnEvent extends CustomEvent<RequestToConnEventDetail> {
  type = 'request-to-conn'
  peerAddr: string;
  constructor(detail: RequestToConnEventDetail) {
    super(detail);
    this.peerAddr = extractAddrFromPath(detail.peerPath);
  }
  reject() {
    this.defaultPrevented = false;
  }
}

interface NewConnEventDetail {
  conn: Conn;
  peerPath: string;
  reconnected: boolean;
}
export class NewConnEvent extends CustomEvent<NewConnEventDetail> {
  type = 'new-conn'
}

interface EventMap {
  'request-to-conn': RequestToConnEvent;
  'new-conn': NewConnEvent;
  'close': ConnCloseEvent;
  'receive': MessageReceivedEvent;
}

declare namespace ConnManager {
  interface Config {
    newConnTimeout: number;
    requestToConnTimeout: number;
  }
  interface ConnectOpts {
    peerIdentity?: PeerIdentity;
    timeout?: number;
    beingConnected?: boolean;
    [opt: string]: any;
  }
  type ConnectOptsImpl = Required<ConnectOpts, 'timeout'>;
}

const configDefault: ConnManager.Config = {
  newConnTimeout: 1000,
  requestToConnTimeout: 1000,
}

abstract class ConnManager extends EventTarget<EventMap> {
  protected conns: Record<string, Conn> = {};
  protected config: ConnManager.Config;

  constructor(config: Partial<ConnManager.Config> = {}) {
    super();
    this.config = { ...configDefault, ...config };
  }

  abstract start(agent: Agent): Promise<void>;

  connect(peerPath: string, opts: ConnManager.ConnectOpts): Promise<void> {
    const peerAddr = extractAddrFromPath(peerPath);
    if (peerAddr in this.conns) {
      console.warn(`Peer '${peerAddr}' already connected, original conn will be closed`);
    }
    const timeout = opts.beingConnected ? this.config.newConnTimeout : this.config.requestToConnTimeout;
    
    if (peerAddr.match(/^wss?:\/\//)) {
      return this.connectWs(peerPath, { timeout, ...opts });
    } else {
      return this.connectUnnamed(peerPath, { timeout, ...opts });
    }
  }

  protected abstract connectWs(peerPath: string, opts: ConnManager.ConnectOptsImpl): Promise<void>;

  protected abstract connectUnnamed(peerPath: string, opts: ConnManager.ConnectOptsImpl): Promise<void>;

  hasConn(peerAddr: string): boolean {
    return peerAddr in this.conns;
  }

  send(peerAddr: string, message: Message): boolean {
    const conn = this.conns[peerAddr];
    if (conn) {
      conn.send(message);
      return true;
    }
    return false;
  }

  protected addConn(peerAddr: string, conn: Conn, peerPath: string): void {
    const reconnected = peerAddr in this.conns;
    if (reconnected) {
      this.conns[peerAddr].close();
    }

    this.conns[peerAddr] = conn;

    conn.addEventListener('receive', event => {
      this.dispatchEvent(event);
    });
    conn.addEventListener('close', event => {
      this.dispatchEvent(event);
      if (conn.connId === this.conns[peerAddr].connId) { // prevent reconnect closing delete new connection
        delete this.conns[peerAddr];
      }
    });

    this.dispatchEvent(new NewConnEvent({ conn, peerPath, reconnected }));
  }
}

export default ConnManager;
