import Conn from './base'
import Identity, { PeerIdentity } from '../misc/identity';
import { Message, toRequestToConnResultMessage } from '../message/message';
import { makeRequestToConnMessage, makeRequestToConnResultMessage } from '../message/conn';

import NodeWebSocket from 'ws';
// importing 'ws' node_modules when targeting browser will only get a function that throw error: ws does not work in the browser

const WebSocket = typeof window === 'undefined' ? NodeWebSocket : window.WebSocket;

type Ws = WebSocket | NodeWebSocket;
type MsgEvent = MessageEvent | NodeWebSocket.MessageEvent;

declare namespace WsConn {
  interface StartLinkOpts extends Conn.StartLinkOpts {
    waitForWs?: boolean;
  }
}

class WsConn extends Conn {
  private ws: Ws;

  private connStartResolve: () => void = () => {};
  private connStartReject: () => void = () => {};
  private pendingMessages: string[] = [];
  private closing: boolean = false;

  startLink(opts: WsConn.StartLinkOpts): Promise<void> {
    return new Promise((resolve, reject) => {
      this.peerIdentity = opts.peerIdentity || new PeerIdentity(opts.peerPath);
      this.connStartResolve = resolve;
      this.connStartReject = () => {
        this.state = Conn.State.FAILED;
        reject();
      };

      setTimeout(() => {
        if (this.state !== Conn.State.CONNECTED) {
          this.connStartReject();
        }
      }, opts.timeout);

      if (opts.waitForWs) return;

      this.ws = new WebSocket(this.peerIdentity.addr);

      this.ws.onerror = (error: any) => {
        console.error('ws.ts: ws.onerror', error);
        this.connStartReject();
      }

      if (opts.beingConnected) {
        // being connected from wss -> browser: wss ask browser to connect
        this.beingConnectingFlow(opts.peerPath, opts.myIdentity);
      } else {
        this.connectingFlow(opts.peerPath, opts.myIdentity);
      }
    });
  }

  private beingConnectingFlow(peerPath: string, myIdentity: Identity) {
    this.ws.onopen = async () => {
      const message = await makeRequestToConnResultMessage(myIdentity, peerPath);
      this.ws.send(JSON.stringify(message));
      this.finishStarting();
    };
  }

  private connectingFlow(peerPath: string, myIdentity: Identity) {
    this.ws.onmessage = async (message: MsgEvent) => {
      this.ws.onmessage = (message: MsgEvent) => {
        this.pendingMessages.push(message.data.toString());
      };
      const resultMsg = toRequestToConnResultMessage(JSON.parse(message.data.toString()));

      this.peerIdentity.setSigningPubKey(resultMsg.signingPubKey);
      this.peerIdentity.setEncryptionPubKey(resultMsg.encryptionPubKey);

      if (await this.peerIdentity.verify(resultMsg.signature)) {
        this.finishStarting();
      }
    }
    this.ws.onopen = async () => {
      const message = await makeRequestToConnMessage(myIdentity, peerPath);

      this.ws.send(JSON.stringify(message));
    }
  }

  startFromExisting(ws: Ws, opts: Pick<WsConn.StartLinkOpts, 'peerIdentity'>) {
    if (opts.peerIdentity) {
      this.peerIdentity = opts.peerIdentity;
    }
    this.ws = ws;
    this.finishStarting();
  }

  private finishStarting() {
    this.state = Conn.State.CONNECTED;
    this.ws.onmessage = (message: MsgEvent) => {
      this.onMessageData(message.data.toString());
    }
    this.ws.onclose = (wsEvent: CloseEvent) => {
      this.state = Conn.State.CLOSED;
      this.onClose({ wsEvent, conn: this, bySelf: this.closing });
    }
    this.connStartResolve();
    queueMicrotask(() => {
      this.pendingMessages.forEach(msg => {
        this.onMessageData(msg);
      });
    });
  }

  async close() {
    this.closing = true;
    this.ws.close();
  }

  async send(message: Message) {
    this.ws.send(JSON.stringify(message));
  }
}

export default WsConn;
