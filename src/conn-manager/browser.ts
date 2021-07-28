import ConnManager, { RequestToConnEvent } from './base';
import RtcConn from '../conn/rtc';
import { RequestToConnMessage, RequestToConnResultMessage, RtcIceMessage } from '../utils/message';

class BrowserConnManager extends ConnManager {
  private pendingRtcConns: Record<string, RtcConn> = {};

  async connectRtc(peerAddr: string, viaAddr: string, opts: ConnManager.ConnectOpts = {}): Promise<void> {
    const rtcConn = new RtcConn();
    this.pendingRtcConns[peerAddr] = rtcConn;

    try {
      await rtcConn.startLink({
        myAddr: this.myAddr, peerAddr,
        beingConnected: false,
        timeout: this.config.requestToConnTimeout,
        connVia: this.connVia(viaAddr),
        ...opts,
      });
      this.addConn(peerAddr, rtcConn);
    } catch (error) {
      console.error(error);
    } finally {
      delete this.pendingRtcConns[peerAddr];
    }
  }

  protected receiveRequestToConn(message: RequestToConnMessage, fromAddr: string) {
    if (message.peerAddr === this.myAddr) {
      const peerAddr = message.myAddr;
      const event = new RequestToConnEvent({ peerAddr });
      this.dispatchEvent(event);

      if (!event.defaultPrevented) {
        this.connect(peerAddr, fromAddr, {
          offer: message.offer,
          beingConnected: true,
        });
      }
    } else {
      this.send(message.peerAddr, message);
    }
  }

  protected receiveRequestToConnResult(message: RequestToConnResultMessage, _fromAddr: string) {
    if (message.peerAddr === this.myAddr) {
      const peerAddr = message.myAddr;
      const pendingConn = this.pendingRtcConns[peerAddr];
      if (pendingConn) {
        pendingConn.requestToConnResult(message.answer);
      }
    } else {
      this.send(message.peerAddr, message);
    }
  }

  protected receiveRtcIce(message: RtcIceMessage, _fromAddr: string) {
    if (message.peerAddr === this.myAddr) {
      const peerAddr = message.myAddr;
      const pendingConn = this.pendingRtcConns[peerAddr];
      if (pendingConn) {
        pendingConn.rtcIce(message.ice);
      }
    } else {
      this.send(message.peerAddr, message);
    }
  }
}

export default BrowserConnManager;
