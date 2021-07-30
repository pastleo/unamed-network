import EventTarget, { CustomEvent } from '../misc/event-target';
import Identity, { verifyPeerAddr, verifySignature } from '../misc/identity';
import Conn, { MessageReceivedEvent } from '../conn/base';
import WsConn from '../conn/ws';
import RtcConn from '../conn/rtc';
import {
  Message,
  RequestToConnMessage, newRequestToConnMessage,
  RequestToConnResultMessage, newRequestToConnResultMessage,
  RtcIceMessage, newRtcIceMessage,
} from '../misc/message';

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
  interface ConnManagerConfig {
    newConnTimeout: number;
    requestToConnTimeout: number;
    [opt: string]: any;
  }
  type Config = ConnManager.ConnManagerConfig | Identity.Config;
  type ConnectOpts = Partial<WsConn.StartLinkOpts | RtcConn.StartLinkOpts>;
}

const configDefault: ConnManager.Config = {
  newConnTimeout: 1000,
  requestToConnTimeout: 1000,
}

abstract class ConnManager extends EventTarget<ConnManagerEventMap> {
  protected conns: Record<string, Conn> = {};
  protected config: ConnManager.Config;
  myIdentity: Identity;

  constructor(config: Partial<ConnManager.Config> = {}) {
    super();
    this.config = { ...configDefault, ...config };
    this.myIdentity = new Identity(config);
  }

  async start(): Promise<void> {
    await this.myIdentity.generateIfNeeded();

    setTimeout(async () => {
      // verify addr hash:
      const hashAddrVerified = await verifyPeerAddr(
        this.myIdentity.exportedSigningPubKey,
        this.myIdentity.expoertedEncryptionPubKey,
        this.myIdentity.addr,
      );
      console.log({ hashAddrVerified });
      
      // send signature
      const signature = await this.myIdentity.signature();
      console.log({ signature });

      // verify signature
      const signatureVerified = await verifySignature(
        this.myIdentity.exportedSigningPubKey,
        this.myIdentity.expoertedEncryptionPubKey,
        signature,
      );
      console.log({ signatureVerified });
    }, 1000);
  }

  connect(peerAddr: string, viaAddr: string, opts: ConnManager.ConnectOpts = {}): Promise<void> {
    if (peerAddr.match(/^wss?:\/\//)) {
      return this.connectWs(peerAddr, viaAddr, opts);
    } else {
      return this.connectUnnamed(peerAddr, viaAddr, opts);
    }
  }

  protected async connectWs(peerAddr: string, viaAddr: string, opts: ConnManager.ConnectOpts = {}): Promise<void> {
    const conn = new WsConn();
    const beingConnected = opts.beingConnected || false;
    await conn.startLink({
      myAddr: this.myIdentity.addr, peerAddr,
      timeout: beingConnected ? this.config.newConnTimeout : this.config.requestToConnTimeout,
      beingConnected,
      connVia: this.connVia(viaAddr),
      ...opts,
    });
    this.addConn(peerAddr, conn);
  }

  protected abstract connectUnnamed(peerAddr: string, viaAddr: string, opts: ConnManager.ConnectOpts): Promise<void>;

  protected addConn(peerAddr: string, conn: Conn): void {
    this.conns[peerAddr] = conn;
    conn.addEventListener('receive', event => {
      this.onReceive(event);
    })
    this.dispatchEvent(new NewConnEvent({ peerAddr, conn }));
  }

  protected connVia(viaAddr: string): Conn.Via {
    return {
      requestToConn: async (peerAddr: string, connId: string, offer: RTCSessionDescription) => {
        const message: RequestToConnMessage = {
          term: 'requestToConn',
          myAddr: this.myIdentity.addr, peerAddr,
          connId, offer,
        };

        this.send(viaAddr, message);
      },
      requestToConnResult: async (peerAddr: string, connId: string, answer: RTCSessionDescription) => {
        const message: RequestToConnResultMessage = {
          term: 'requestToConnResult',
          myAddr: this.myIdentity.addr, peerAddr,
          connId, answer,
          ok: true,
        };

        this.send(viaAddr, message);
      },
      rtcIce: async (peerAddr: string, connId: string, ice: RTCIceCandidate) => {
        const message: RtcIceMessage = {
          term: 'rtcIce',
          myAddr: this.myIdentity.addr, peerAddr,
          connId, ice,
        };

        this.send(viaAddr, message);
      },
    }
  }

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
