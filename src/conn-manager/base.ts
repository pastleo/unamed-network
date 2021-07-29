import crypto from 'isomorphic-webcrypto';
import EventTarget, { CustomEvent } from '../utils/event-target';
import Conn, { MessageReceivedEvent } from '../conn/base';
import {
  Message,
  RequestToConnMessage, newRequestToConnMessage,
  RequestToConnResultMessage, newRequestToConnResultMessage,
  RtcIceMessage, newRtcIceMessage,
} from '../utils/message';
import WsConn from '../conn/ws';
import RtcConn from '../conn/rtc';

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

    myAddr?: string;
    signingKeyPair?: CryptoKeyPair;
    encryptionKeyPair?: CryptoKeyPair;
  }
  type ConnectOpts = Partial<WsConn.StartLinkOpts | RtcConn.StartLinkOpts>;
}

const configDefault: ConnManager.Config = {
  newConnTimeout: 1000,
  requestToConnTimeout: 1000,
}

function concatArrayBuffer(ab1: ArrayBuffer, ab2: ArrayBuffer): ArrayBuffer {
  const newArr = new Uint8Array(ab1.byteLength + ab2.byteLength);
  newArr.set(new Uint8Array(ab1));
  newArr.set(new Uint8Array(ab2), ab1.byteLength);
  return newArr.buffer;
}

function arrayBufferTobase64(ab: ArrayBuffer): string {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(ab)));
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0))
}

abstract class ConnManager extends EventTarget<ConnManagerEventMap> {
  protected conns: Record<string, Conn> = {};
  protected config: ConnManager.Config;

  myAddr: string;
  private signingKeyPair: CryptoKeyPair;
  private encryptionKeyPair: CryptoKeyPair;
  signingPubKey: string;
  encryptionPubKey: string;

  constructor(config: Partial<ConnManager.Config> = {}) {
    super();
    this.config = { ...configDefault, ...config };

    if (config.myAddr) this.myAddr = config.myAddr;
    if (config.encryptionKeyPair) this.encryptionKeyPair = config.encryptionKeyPair;
    if (config.signingKeyPair) this.signingKeyPair = config.signingKeyPair;
  }

  async start(): Promise<void> {
    if (!this.signingKeyPair) {
      this.signingKeyPair = await crypto.subtle.generateKey(
        {
          name: "ECDSA",
          namedCurve: "P-384"
        },
        true,
        ["sign", "verify"]
      );
    }

    if (!this.encryptionKeyPair) {
      this.encryptionKeyPair = await crypto.subtle.generateKey(
        {
          name: "RSA-OAEP",
          modulusLength: 4096,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: "SHA-256"
        },
        true,
        ["encrypt", "decrypt"],
      );
    }

    const signingPubKey = await crypto.subtle.exportKey('raw', this.signingKeyPair.publicKey);
    const encryptionPubKey = await crypto.subtle.exportKey('spki', this.encryptionKeyPair.publicKey);
    this.signingPubKey = arrayBufferTobase64(signingPubKey);
    this.encryptionPubKey = arrayBufferTobase64(encryptionPubKey);

    const oriSigningPubKey = new Uint8Array(signingPubKey);
    console.log({ oriSigningPubKey });

    if (!this.myAddr) {
      const pubKeyHash = await crypto.subtle.digest('SHA-512', concatArrayBuffer(signingPubKey, encryptionPubKey));
      this.myAddr = `#${arrayBufferTobase64(pubKeyHash)}`;
    }

    setTimeout(async () => {
      // verify addr hash:
      const decodedSigningPubKey = base64ToArrayBuffer(this.signingPubKey);
      console.log({ decodedSigningPubKey });
      const decodedEncryptionPubKey = base64ToArrayBuffer(this.encryptionPubKey);
      console.log({ decodedEncryptionPubKey });

      const pubKeyHash = await crypto.subtle.digest('SHA-512', concatArrayBuffer(decodedSigningPubKey, decodedEncryptionPubKey));
      const hashAddrMatch = arrayBufferTobase64(pubKeyHash) === this.myAddr.slice(1);
      console.log({ pubKeyHash, hashAddrMatch });
      
      // send signature
      const messageToSignRaw = new Uint8Array(64);
      crypto.getRandomValues(messageToSignRaw);
      const signature = await crypto.subtle.sign(
        {
          name: this.signingKeyPair.privateKey.algorithm.name,
          hash: { name: "SHA-384" },
        },
        this.signingKeyPair.privateKey,
        messageToSignRaw,
      );

      console.log({ messageToSignRaw, signature });

      // verify signature
      const peerSigningPubKey = await crypto.subtle.importKey(
        'raw',
        decodedSigningPubKey,
        {
          name: "ECDSA",
          namedCurve: "P-384"
        },
        false,
        ['verify'],
      )
      console.log({ peerSigningPubKey });

      const verifyResult = await crypto.subtle.verify(
        {
          name: this.signingKeyPair.privateKey.algorithm.name,
          hash: { name: "SHA-384" },
        },
        peerSigningPubKey,
        signature,
        messageToSignRaw,
      );
      console.log({ verifyResult });
    }, 1000);
  }

  connect(peerAddr: string, viaAddr: string, opts: ConnManager.ConnectOpts = {}): Promise<void> {
    if (peerAddr.match(/^wss?:\/\//)) {
      return this.connectWs(peerAddr, viaAddr, opts);
    } else {
      return this.connectRtc(peerAddr, viaAddr, opts);
    }
  }

  protected async connectWs(peerAddr: string, viaAddr: string, opts: ConnManager.ConnectOpts = {}): Promise<void> {
    const conn = new WsConn();
    const beingConnected = opts.beingConnected || false;
    await conn.startLink({
      myAddr: this.myAddr, peerAddr,
      timeout: beingConnected ? this.config.newConnTimeout : this.config.requestToConnTimeout,
      beingConnected,
      connVia: this.connVia(viaAddr),
      ...opts,
    });
    this.addConn(peerAddr, conn);
  }

  protected abstract connectRtc(peerAddr: string, viaAddr: string, opts: ConnManager.ConnectOpts): Promise<void>;

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
          myAddr: this.myAddr, peerAddr,
          connId, offer,
        };

        this.send(viaAddr, message);
      },
      requestToConnResult: async (peerAddr: string, connId: string, answer: RTCSessionDescription) => {
        const message: RequestToConnResultMessage = {
          term: 'requestToConnResult',
          myAddr: this.myAddr, peerAddr,
          connId, answer,
          ok: true,
        };

        this.send(viaAddr, message);
      },
      rtcIce: async (peerAddr: string, connId: string, ice: RTCIceCandidate) => {
        const message: RtcIceMessage = {
          term: 'rtcIce',
          myAddr: this.myAddr, peerAddr,
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
