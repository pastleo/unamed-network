import EventTarget, { CustomEvent } from '../utils/event-target';
import Conn, { MessageReceivedEvent } from '../conn/base';
import {
  Message,
  RequestToConnMessage, newRequestToConnMessage,
  RequestToConnResultMessage, newRequestToConnResultMessage,
  RtcIceMessage, newRtcIceMessage,
} from '../utils/message';
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
  export interface Config {
    newConnTimeout: number;
    requestToConnTimeout: number;
  }
}

const wssConfigDefault: ConnManager.Config = {
  newConnTimeout: 1000,
  requestToConnTimeout: 1000,
}

interface ConnsMap {
  [peerAddr: string]: Conn;
}

abstract class ConnManager extends EventTarget<ConnManagerEventMap> {
  protected conns: ConnsMap = {};
  protected config: ConnManager.Config;
  myAddr: string;

  constructor(config: Partial<ConnManager.Config> = {}) {
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
      this.onReceive(event);
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

  private onReceive(event: MessageReceivedEvent) {
    this.dispatchEvent(event);

    if (!event.defaultPrevented) {
      switch (event.detail.term) {
        case 'requestToConn':
          return this.receiveRequestToConn(newRequestToConnMessage(event.detail), event.detail.from);
        case 'requestToConnResult':
          return this.receiveRequestToConnResult(newRequestToConnResultMessage(event.detail), event.detail.from);
        case 'rtcIce':
          return this.receiveRtcIce(newRtcIceMessage(event.detail), event.detail.from);
      }
    }
  }

  protected receiveRequestToConn(message: RequestToConnMessage, _fromAddr: string) {
    this.send(message.peerAddr, message);
  }

  protected receiveRequestToConnResult(message: RequestToConnResultMessage, _fromAddr: string) {
    this.send(message.peerAddr, message);
  }

  protected receiveRtcIce(message: RtcIceMessage, _fromAddr: string) {
    this.send(message.peerAddr, message);
  }
}

export default ConnManager;
