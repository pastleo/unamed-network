import Conn, { ConnStartLinkOpts, MessageReceivedEvent } from './base'
import { Message, toMessage, toRequestToConnResultMessage, RequestToConnMessage } from '../utils/message';

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
    this.setUpWs();
  }

  startLink(opts: ConnStartLinkOpts): Promise<void> {
    return new Promise((resolve, reject) => {
      let ok = false;
      this.peerAddr = opts.peerAddr;
      this.ws = new WebSocket(opts.peerAddr);

      this.ws.onmessage = (message: MsgEvent) => {
        const resultMsg = toRequestToConnResultMessage(JSON.parse(message.data.toString()));
        ok = resultMsg.ok;
        if (ok) {
          this.setUpWs();
          resolve();
        }
      }

      this.ws.onopen = () => {
        const message: RequestToConnMessage = {
          addr: opts.myAddr,
        };

        this.ws.send(JSON.stringify(message));
      }
      this.ws.onerror = (error: any) => {
        console.error(error);
        reject();
      }

      setTimeout(() => {
        if (!ok) {
          reject();
        }
      }, opts.timeout);
    })
  }

  private setUpWs() {
    this.ws.onmessage = (message: MsgEvent) => {
      const { term, payload } = toMessage(JSON.parse(message.data.toString()));
      if (typeof term === 'string' && typeof payload === 'object') {
        this.dispatchEvent(new MessageReceivedEvent({ term, payload, from: this.peerAddr }))
      }
    }
  }

  async close() {
    this.ws.close();
  }

  async send(term: string, payload: any) {
    const message: Message = { term, payload };
    this.ws.send(JSON.stringify(message));
  }
}

export default WsConn;
