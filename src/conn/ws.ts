import Conn, { ConnStartLinkOpts, MessageTerm } from './base'

class WsConn extends Conn {
  private ws: WebSocket;

  async startLink(opts: ConnStartLinkOpts) {
    this.ws = new WebSocket(opts.addr);

    this.ws.onmessage = ({ data }) => {
      const dataParsed = JSON.parse(data);
      console.log('onmessage', dataParsed);
    }
    this.ws.onopen = () => {
      console.log('ws onopen')
    }
    this.ws.onerror = () => {
      console.log('ws onerror')
    }
  }

  async close() {
  }

  async send(term: MessageTerm, payload: any) {
  }
}

export default WsConn;
