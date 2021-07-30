import Conn from './base'
import Identity, { PeerIdentity } from '../misc/identity';
import { Message, toRequestToConnResultMessage, RequestToConnMessage, RequestToConnResultMessage } from '../misc/message';
import { Optional } from 'utility-types';

import NodeWebSocket from 'ws';
// importing 'ws' node_modules when targeting browser will only get a function that throw error: ws does not work in the browser

const WebSocket = typeof window === 'undefined' ? NodeWebSocket : window.WebSocket;

type Ws = WebSocket | NodeWebSocket;
type MsgEvent = MessageEvent | NodeWebSocket.MessageEvent;

declare namespace WsConn {
  interface Via extends Conn.Via {}
  interface StartLinkOpts extends Conn.StartLinkOpts {
    connVia: WsConn.Via;
    askToBeingConn?: boolean;
  }
}

class WsConn extends Conn {
  private ws: Ws;

  private connStartResolve: () => void = () => {};
  private connStartReject: () => void = () => {};
  private pendingMessages: string[] = [];

  startLink(opts: WsConn.StartLinkOpts): Promise<void> {
    return new Promise((resolve, reject) => {
      this.peerIdentity = opts.peerIdentity || new PeerIdentity(opts.peerAddr);
      this.connStartResolve = resolve;
      this.connStartReject = reject;

      setTimeout(() => {
        if (!this.connected) {
          this.connStartReject();
        }
      }, opts.timeout);

      if (opts.askToBeingConn) {
        opts.connVia.requestToConn(this.peerIdentity.addr, this.connId, {});
        return;
      }

      this.ws = new WebSocket(opts.peerAddr);

      this.ws.onerror = (error: any) => {
        console.error('ws.ts: ws.onerror', error);
        this.connStartReject();
      }

      if (opts.beingConnected) {
        // being connected from wss -> browser: wss ask browser to connect
        this.beingConnectingFlow(opts.peerAddr, opts.myIdentity);
      } else {
        this.connectingFlow(opts.peerAddr, opts.myIdentity);
      }
    });
  }

  startFromExisting(ws: Ws, opts: Optional<WsConn.StartLinkOpts, 'connVia' | 'peerIdentity'>) {
    this.peerIdentity = opts.peerIdentity || new PeerIdentity(opts.peerAddr);
    this.ws = ws;
    this.finishStarting();
  }

  private beingConnectingFlow(peerAddr: string, myIdentity: Identity) {
    this.ws.onopen = async () => {
      const message: RequestToConnResultMessage = {
        term: 'requestToConnResult',
        myAddr: myIdentity.addr, peerAddr,
        signingPubKey: myIdentity.exportedSigningPubKey,
        encryptionPubKey: myIdentity.expoertedEncryptionPubKey,
        signature: await myIdentity.signature(),
        ok: true,
      };

      this.ws.send(JSON.stringify(message));
      this.finishStarting();
    };
  }

  private connectingFlow(peerAddr: string, myIdentity: Identity) {
    this.ws.onmessage = async (message: MsgEvent) => {
      this.ws.onmessage = (message: MsgEvent) => {
        this.pendingMessages.push(message.data.toString());
      };
      const resultMsg = toRequestToConnResultMessage(JSON.parse(message.data.toString()));

      this.peerIdentity.setSigningPubKey(resultMsg.signingPubKey);
      this.peerIdentity.setEncryptionPubKey(resultMsg.encryptionPubKey);

      if (resultMsg.ok && await this.peerIdentity.verifySignature(resultMsg.signature)) {
        this.finishStarting();
      }
    }
    this.ws.onopen = async () => {
      const message: RequestToConnMessage = {
        term: 'requestToConn',
        myAddr: myIdentity.addr, peerAddr,
        signingPubKey: myIdentity.exportedSigningPubKey,
        encryptionPubKey: myIdentity.expoertedEncryptionPubKey,
        signature: await myIdentity.signature(),
      };

      this.ws.send(JSON.stringify(message));
    }
  }

  private finishStarting() {
    this.connected = true;
    this.ws.onmessage = (message: MsgEvent) => {
      this.onMessageData(message.data.toString());
    }
    this.connStartResolve();
    queueMicrotask(() => {
      this.pendingMessages.forEach(msg => {
        this.onMessageData(msg);
      });
    });
  }

  requestToConnResult(ok: boolean) {
    if (!ok) {
      this.connStartReject();
    }
  }

  // TODO
  //onConnVia(peerAddr: string, connId: string, term: string, data: anyV {
    //switch (term) {
      //case 'requestToConnResult':
        //this.onViaRequestToConnResult(
    //}
  //}

  async close() {
    this.ws.close();
  }

  async send(message: Message) {
    this.ws.send(JSON.stringify(message));
  }
}

export default WsConn;
