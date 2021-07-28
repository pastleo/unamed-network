import Conn from './base'
import { Message, toRequestToConnResultMessage, RequestToConnMessage, RequestToConnResultMessage } from '../utils/message';

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

  startLink(opts: WsConn.StartLinkOpts): Promise<void> {
    return new Promise((resolve, reject) => {
      this.peerAddr = opts.peerAddr;
      this.connStartResolve = resolve;
      this.connStartReject = reject;

      setTimeout(() => {
        if (!this.connected) {
          this.connStartReject();
        }
      }, opts.timeout);

      if (opts.askToBeingConn) {
        opts.connVia.requestToConn(this.peerAddr, this.connId, {});
        return;
      }

      this.ws = new WebSocket(opts.peerAddr);

      this.ws.onerror = (error: any) => {
        console.error('ws.ts: ws.onerror', error);
        this.connStartReject();
      }

      if (opts.beingConnected) {
        // being connected from wss -> browser: wss ask browser to connect
        this.beingConnectingFlow(opts.peerAddr, opts.myAddr);
      } else {
        this.connectingFlow(opts.peerAddr, opts.myAddr);
      }
    });
  }

  startFromExisting(ws: Ws, opts: Omit<WsConn.StartLinkOpts, 'connVia'>) {
    this.peerAddr = opts.peerAddr;
    this.ws = ws;
    this.finishStarting();
  }

  private beingConnectingFlow(peerAddr: string, myAddr: string) {
    this.ws.onopen = () => {
      const message: RequestToConnResultMessage = {
        term: 'requestToConnResult',
        connId: this.connId,
        myAddr, peerAddr,
        ok: true,
      };

      this.ws.send(JSON.stringify(message));
      this.finishStarting();
    };
  }

  private connectingFlow(peerAddr: string, myAddr: string) {
    this.ws.onmessage = (message: MsgEvent) => {
      const resultMsg = toRequestToConnResultMessage(JSON.parse(message.data.toString()));
      if (resultMsg.ok) {
        this.finishStarting();
      }
    }
    this.ws.onopen = () => {
      const message: RequestToConnMessage = {
        term: 'requestToConn',
        connId: this.connId,
        myAddr, peerAddr,
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
