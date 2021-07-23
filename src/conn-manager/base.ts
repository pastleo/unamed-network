import EventTarget, { CustomEvent } from '../utils/event-target';
import Conn from '../conn/base';
import WsConn from '../conn/ws';

interface RequestToConnEventDetail {
  addr: string;
}
export class RequestToConnEvent extends CustomEvent<RequestToConnEventDetail> {
  type = 'request-to-conn'
  reject() {
    this.defaultPrevented = false;
  }
}

interface NewConnEventDetail {
  addr: string;
  conn: Conn;
}
export class NewConnEvent extends CustomEvent<NewConnEventDetail> {
  type = 'new-conn'
}

interface ConnManagerEventMap {
  'request-to-conn': RequestToConnEvent
  'new-conn': NewConnEvent
}

abstract class ConnManager extends EventTarget<ConnManagerEventMap> {
  protected conns: Conn[] = [];
  myAddr: string;

  async start(myAddr: string): Promise<void> {
    this.myAddr = myAddr;
  }

  connect(addr: string, viaAddr: string): Promise<void> {
    const { protocol } = (new URL(addr));

    switch (protocol) {
      case 'ws:':
      case 'wss:':
        return this.connectWs(addr);
      case 'rtc:':
        return this.connectRtc(addr, viaAddr);
      default:
        throw new Error(`Unknown protocol: ${protocol}, addr: ${addr}`);
    }
  }

  async connectWs(addr: string): Promise<void> {
    const conn = new WsConn();
    await conn.startLink({ myAddr: this.myAddr, addr });
    this.conns.push(conn);
    this.dispatchEvent(new NewConnEvent({ addr, conn }));
  }

  abstract connectRtc(addr: string, viaAddr: string): Promise<void>;
}

export default ConnManager;
