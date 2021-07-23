import Conn, { ConnStartLinkOpts, MessageReceivedEvent } from './base'
import { Message, toMessage, toRequestToConnResultMessage, RequestToConnMessage } from '../utils/message';

import NodeWebSocket from 'ws';
// importing 'ws' node_modules when targeting browser will only get a function that throw error: ws does not work in the browser

const WebSocket = typeof window === 'undefined' ? NodeWebSocket : window.WebSocket;

type Ws = WebSocket | NodeWebSocket;
type MsgEvent = MessageEvent | NodeWebSocket.MessageEvent;

class WsConn extends Conn {
  private ws: Ws;
  peerAddr: string;

  startFromExisting(ws: Ws, addr: string) {
    this.ws = ws;
    this.peerAddr = addr;
    this.setUpWs();
  }

  startLink(opts: ConnStartLinkOpts): Promise<void> {
    return new Promise((resolve, reject) => {
      this.peerAddr = opts.addr;
      this.ws = new WebSocket(opts.addr);

      this.ws.onmessage = (message: MsgEvent) => {
        const { ok } = toRequestToConnResultMessage(JSON.parse(message.data.toString()));
        if (ok) {
          resolve();
        }
      }

      this.ws.onopen = () => {
        const message: RequestToConnMessage = {
          addr: opts.myAddr,
        };

        console.log('this.ws.onopen', message);

        this.ws.send(JSON.stringify(message));
      }
      this.ws.onerror = (error: any) => {
        console.error(error);
        reject();
      }
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
