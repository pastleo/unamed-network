import EventTarget, { CustomEvent } from '../misc/event-target';
import Identity, { PeerIdentity } from '../misc/identity';
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
  peerIdentity: PeerIdentity;
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
      myIdentity: this.myIdentity, peerAddr,
      peerIdentity: new PeerIdentity(peerAddr),
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
      requestToConn: async (peerAddr: string, _connId: string, offer: RTCSessionDescription) => {
        const message: RequestToConnMessage = {
          term: 'requestToConn',
          myAddr: this.myIdentity.addr, peerAddr,
          signingPubKey: this.myIdentity.exportedSigningPubKey,
          encryptionPubKey: this.myIdentity.expoertedEncryptionPubKey,
          signature: await this.myIdentity.signature(),
          offer,
        };

        this.send(viaAddr, message);
      },
      requestToConnResult: async (peerAddr: string, _connId: string, answer: RTCSessionDescription) => {
        const message: RequestToConnResultMessage = {
          term: 'requestToConnResult',
          myAddr: this.myIdentity.addr, peerAddr,
          signingPubKey: this.myIdentity.exportedSigningPubKey,
          encryptionPubKey: this.myIdentity.expoertedEncryptionPubKey,
          signature: await this.myIdentity.signature(),
          answer, ok: true,
        };

        this.send(viaAddr, message);
      },
      rtcIce: async (peerAddr: string, _connId: string, ice: RTCIceCandidate) => {
        const message: RtcIceMessage = {
          term: 'rtcIce',
          myAddr: this.myIdentity.addr, peerAddr,
          ice, timestamp: Date.now(),
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
          return this.onReceiveRequestToConn(newRequestToConnMessage(event.detail), event.detail.from);
        case 'requestToConnResult':
          return this.onReceiveRequestToConnResult(newRequestToConnResultMessage(event.detail), event.detail.from);
        case 'rtcIce':
          return this.onReceiveRtcIce(newRtcIceMessage(event.detail), event.detail.from);
      }
    }
  }

  protected onReceiveRequestToConn(message: RequestToConnMessage, _fromAddr: string) {
    this.send(message.peerAddr, message);
  }

  protected onReceiveRequestToConnResult(message: RequestToConnResultMessage, _fromAddr: string) {
    this.send(message.peerAddr, message);
  }

  protected onReceiveRtcIce(message: RtcIceMessage, _fromAddr: string) {
    this.send(message.peerAddr, message);
  }

  protected async verifyPeerIdentity(peerIdentity: PeerIdentity, signature: Identity.Signature): Promise<boolean> {
    if (peerIdentity.addr.match(/^#/)) {
      const hashAddrVerified = await peerIdentity.verifyUnnamedAddr();

      if (!hashAddrVerified) return false;
    }

    const signatureVerified = await peerIdentity.verifySignature(signature);
    return signatureVerified;
  }
}

export default ConnManager;
