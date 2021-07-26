import Conn, { ConnStartLinkOpts, MessageReceivedEvent } from './base'
import { Message, toRequestToConnResultMessage, RequestToConnMessage } from '../utils/message';

import NodeWebSocket from 'ws';
// importing 'ws' node_modules when targeting browser will only get a function that throw error: ws does not work in the browser

const WebSocket = typeof window === 'undefined' ? NodeWebSocket : window.WebSocket;

type Ws = WebSocket | NodeWebSocket;
type MsgEvent = MessageEvent | NodeWebSocket.MessageEvent;

class WsConn extends Conn {
  private ws: Ws;

  startFromExisting(ws: Ws, peerAddr: string) {
    this.ws = ws;
    this.peerAddr = peerAddr;
    this.connected = true;
    this.setUpWs();
  }

  startLink(opts: ConnStartLinkOpts): Promise<void> {
    return new Promise((resolve, reject) => {
      this.peerAddr = opts.peerAddr;
      this.ws = new WebSocket(opts.peerAddr);

      this.ws.onmessage = (message: MsgEvent) => {
        const resultMsg = toRequestToConnResultMessage(JSON.parse(message.data.toString()));
        if (resultMsg.ok) {
          this.connected = true;
          this.setUpWs();
          resolve();
        }
      }

      this.ws.onopen = () => {
        const message: RequestToConnMessage = {
          term: 'requestToConn',
          connId: this.connId,
          myAddr: opts.myAddr,
          peerAddr: opts.peerAddr,
        };

        this.ws.send(JSON.stringify(message));
      }
      this.ws.onerror = (error: any) => {
        console.error(error);
        reject();
      }

      setTimeout(() => {
        if (!this.connected) {
          reject();
        }
      }, opts.timeout);
    })
  }

  private setUpWs() {
    this.ws.onmessage = (message: MsgEvent) => {
      this.onMessageData(message.data.toString());
    }
  }

  async close() {
    this.ws.close();
  }

  async send(message: Message) {
    this.ws.send(JSON.stringify(message));
  }
}

export default WsConn;
