import Conn, { ConnStartLinkOpts, MessageReceivedEvent } from './base'
import { Message, toMessage, toRequestToConnResultMessage, RequestToConnMessage } from '../utils/message';

//////////////
import { unnamedNetwork as protobuf } from '../messages/main';
const { HelloMessage, Terms } = protobuf;
//////////////

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
      console.log('onmessage', message.data);

      if (message.data instanceof Blob) {
        message.data.arrayBuffer().then(arrayBuffer => {
          const msg = HelloMessage.decode(new Uint8Array(arrayBuffer));
          console.log(msg);
        });
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
  async sendRaw(data: any) {
    this.ws.send(data);
  }
}

export default WsConn;
