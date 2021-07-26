import ConnManager, { RequestToConnEvent } from './base';
import RtcConn from '../conn/rtc';
import { RequestToConnMessage, RequestToConnResultMessage, RtcIceMessage } from '../utils/message';

export interface RtcConnsMap {
  [peerAddr: string]: RtcConn;
}

class BrowserConnManager extends ConnManager {
  private pendingRtcConns: RtcConnsMap = {};

  async connectRtc(peerAddr: string, viaAddr: string, existingOffer?: RTCSessionDescription): Promise<void> {
    const rtcConn = new RtcConn();
    this.pendingRtcConns[peerAddr] = rtcConn;

    try {
      await rtcConn.startLink({
        myAddr: this.myAddr,
        peerAddr, offer: existingOffer,
        timeout: this.config.requestToConnTimeout,
        connVia: {
          requestToConn: async (peerAddr: string, connId: string, offer: RTCSessionDescription) => {
            const message: RequestToConnMessage = {
              term: 'requestToConn',
              myAddr: this.myAddr, peerAddr,
              connId, offer,
            };

            this.send(viaAddr, message);
          },
          requestToConnResult: async (_peerAddr: string, connId: string, answer: RTCSessionDescription) => {
            const message: RequestToConnResultMessage = {
              term: 'requestToConnResult',
              myAddr: this.myAddr, peerAddr,
              connId, answer,
              ok: true,
            };
            console.log(viaAddr, message);

            this.send(viaAddr, message);
          },
          rtcIce: async (_peerAddr: string, connId: string, ice: RTCIceCandidate) => {
            const message: RtcIceMessage = {
              term: 'rtcIce',
              myAddr: this.myAddr, peerAddr,
              connId, ice,
            };

            this.send(viaAddr, message);
          },
        },
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
        this.connectRtc(peerAddr, fromAddr, message.offer);
      }
    } else {
      this.send(message.peerAddr, message);
    }
  }

  protected receiveRequestToConnResult(message: RequestToConnResultMessage, _fromAddr: string) {
    if (message.peerAddr === this.myAddr) {
      const peerAddr = message.myAddr;
      const pendingRtcConn = this.pendingRtcConns[peerAddr];
      if (pendingRtcConn) {
        pendingRtcConn.requestToConnResult(message.answer);
      }
    } else {
      this.send(message.peerAddr, message);
    }
  }

  protected receiveRtcIce(message: RtcIceMessage, _fromAddr: string) {
    if (message.peerAddr === this.myAddr) {
      const peerAddr = message.myAddr;
      const pendingRtcConn = this.pendingRtcConns[peerAddr];
      if (pendingRtcConn) {
        pendingRtcConn.rtcIce(message.ice);
      }
    } else {
      this.send(message.peerAddr, message);
    }
  }
}

export default BrowserConnManager;
