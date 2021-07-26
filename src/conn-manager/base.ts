import EventTarget, { CustomEvent } from '../utils/event-target';
import Conn, { MessageReceivedEvent } from '../conn/base';
import { Message } from '../utils/message';
import WsConn from '../conn/ws';

interface RequestToConnEventDetail {
  peerAddr: string;
}
export class RequestToConnEvent extends CustomEvent<RequestToConnEventDetail> {
  type = 'request-to-conn'
  reject() {
    this.defaultPrevented = false;
  }
}

interface NewConnEventDetail {
  peerAddr: string;
  conn: Conn;
}
export class NewConnEvent extends CustomEvent<NewConnEventDetail> {
  type = 'new-conn'
}

interface ConnManagerEventMap {
  'request-to-conn': RequestToConnEvent;
  'new-conn': NewConnEvent;
  'receive': MessageReceivedEvent;
}

declare namespace ConnManager {
  export interface WssConfig {
    newConnTimeout: number;
    requestToConnTimeout: number;
  }
}

const wssConfigDefault: ConnManager.WssConfig = {
  newConnTimeout: 1000,
  requestToConnTimeout: 1000,
}

interface ConnsMap {
  [peerAddr: string]: Conn;
}

abstract class ConnManager extends EventTarget<ConnManagerEventMap> {
  protected conns: ConnsMap = {};
  protected config: ConnManager.WssConfig;
  myAddr: string;

  constructor(config: Partial<ConnManager.WssConfig> = {}) {
    super();
    this.config = { ...wssConfigDefault, ...config };
  }

  async start(myAddr: string): Promise<void> {
    this.myAddr = myAddr;
  }

  connect(peerAddr: string, viaAddr: string): Promise<void> {
    const { protocol } = (new URL(peerAddr));

    switch (protocol) {
      case 'ws:':
      case 'wss:':
        return this.connectWs(peerAddr);
      case 'rtc:':
        return this.connectRtc(peerAddr, viaAddr);
      default:
        throw new Error(`Unknown protocol: ${protocol}, peerAddr: ${peerAddr}`);
    }
  }

  async connectWs(peerAddr: string): Promise<void> {
    const conn = new WsConn();
    await conn.startLink({ myAddr: this.myAddr, peerAddr, timeout: this.config.requestToConnTimeout });
    this.addConn(peerAddr, conn);
  }

  protected addConn(peerAddr: string, conn: Conn): void {
    this.conns[peerAddr] = conn;
    conn.addEventListener('receive', event => {
      this.dispatchEvent(event);
    })
    this.dispatchEvent(new NewConnEvent({ peerAddr, conn }));
  }

  abstract connectRtc(peerAddr: string, viaAddr: string): Promise<void>;

  send(peerAddr: string, message: Message): void {
    this.getConn(peerAddr).send(message);
  }

  getConn(peerAddr: string): Conn {
    const conn = this.conns[peerAddr];
    if (!conn) {
      throw new Error(`conn not found for ${peerAddr}`);
    }
    return conn;
  }
}

export default ConnManager;
