import Conn from './base';
import { Message } from '../misc/message';

const DATA_CHANNEL_NAME = 'data';
const RTC_CONN_READY_STATES = ['connected', 'completed'];

declare namespace RtcConn {
  interface Via extends Conn.Via {
    requestToConn: (peerAddr: string, connId: string, offer: RTCSessionDescription) => Promise<void>,
    requestToConnResult: (peerAddr: string, connId: string, answer: RTCSessionDescription) => Promise<void>,
    rtcIce: (peerAddr: string, connId: string, ice: RTCIceCandidate) => Promise<void>,
  }
  interface StartLinkOpts extends Conn.StartLinkOpts {
    connVia: RtcConn.Via;
    offer?: RTCSessionDescription;
  }
}

class RtcConn extends Conn {
  private rtcConn: RTCPeerConnection;
  private rtcDataChannel: RTCDataChannel;
  
  private startLinkResolve: () => void;

  constructor(rtcConfig: RTCConfiguration = {}) {
    super();
    this.rtcConn = new RTCPeerConnection(rtcConfig);
    this.rtcConn.ondatachannel = ({ channel }) => this.setupChannel(channel);
    this.rtcConn.oniceconnectionstatechange = () => {
      if (!this.connected) this.rtcConnMightBeReady();
    };
  }

  startLink(opts: RtcConn.StartLinkOpts): Promise<void> {
    const { peerAddr, connVia, beingConnected, timeout, offer } = opts;
    this.peerAddr = peerAddr;
    return new Promise((resolve, reject) => {
      this.startLinkResolve = resolve;
      this.setupIceCandidate(connVia);

      setTimeout(() => {
        if (!this.connected) {
          reject();
        }
      }, timeout);

      if (beingConnected) {
        this.rtcAnsweringFlow(peerAddr, connVia, offer);
      } else {
        this.rtcOfferingFlow(peerAddr, connVia);
      }
    })
  }

  private async rtcOfferingFlow(peerAddr: string, connVia: RtcConn.Via) {
    this.setupChannel(this.rtcConn.createDataChannel(DATA_CHANNEL_NAME));

    await this.rtcConn.setLocalDescription(await this.rtcConn.createOffer());
    const offer = this.rtcConn.localDescription;

    connVia.requestToConn(peerAddr, this.connId, offer);
  }

  private async rtcAnsweringFlow(peerAddr: string, connVia: RtcConn.Via, offer: RTCSessionDescription) {
    await this.rtcConn.setRemoteDescription(offer);
    await this.rtcConn.setLocalDescription(await this.rtcConn.createAnswer());
    const answer = this.rtcConn.localDescription;

    connVia.requestToConnResult(peerAddr, this.connId, answer);
  }

  private setupIceCandidate(connVia: RtcConn.Via) {
    this.rtcConn.onicecandidate = ({ candidate }) => {
      if (candidate) {
        connVia.rtcIce(this.peerAddr, this.connId, candidate);
      }
    };
  }

  private setupChannel(channel: RTCDataChannel) {
    channel.onopen = () => {
      switch (channel.label) {
        case DATA_CHANNEL_NAME:
          this.rtcDataChannel = channel;
          this.rtcDataChannel.onmessage = ({ data }) => {
            this.onMessageData(data);
          };
          break;
      }
      this.rtcConnMightBeReady();
    };
    channel.onclose = () => this.onRtcClose();
  }

  private rtcConnMightBeReady() {
    if (
      !this.connected &&
      RTC_CONN_READY_STATES.indexOf(this.rtcConn.iceConnectionState) !== -1 &&
      this.rtcDataChannel &&
      this.rtcDataChannel.readyState === 'open'
    ) {
      this.connected = true;
      this.startLinkResolve();
    }
  }

  private onRtcClose() {
    this.rtcConn.close();
  }

  requestToConnResult(answer: RTCSessionDescription) {
    this.rtcConn.setRemoteDescription(answer);
  }

  rtcIce(ice: RTCIceCandidate) {
    this.rtcConn.addIceCandidate(ice);
  }

  async send(message: Message) {
    this.rtcDataChannel.send(JSON.stringify(message));
  }

  async close() {
    this.rtcConn.close();
  }
}

export default RtcConn;