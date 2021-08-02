import Conn from './base';
import Identity, { PeerIdentity } from '../misc/identity';
import { Message, RequestToConnResultMessage, newRequestToConnResultMessage, RtcIceMessage, newRtcIceMessage } from '../message/message';
import { makeRequestToConnMessage, makeRequestToConnResultMessage } from '../message/conn';
import Tunnel from '../conn/tunnel';

const DATA_CHANNEL_NAME = 'data';
const RTC_CONN_READY_STATES = ['connected', 'completed'];

declare namespace RtcConn {
  interface StartLinkOpts extends Conn.StartLinkOpts {
    offer?: RTCSessionDescription;
  }
}

class RtcConn extends Conn {
  private rtcConn: RTCPeerConnection;
  private rtcDataChannel: RTCDataChannel;
  
  private startLinkResolve: () => void;

  private pendingIce: RTCIceCandidate[] = [];
  private pendingReceivedIce: RTCIceCandidate[] = [];

  constructor(rtcConfig: RTCConfiguration = {}) {
    super();
    this.rtcConn = new RTCPeerConnection(rtcConfig);
    this.rtcConn.ondatachannel = ({ channel }) => this.setupChannel(channel);
    this.rtcConn.oniceconnectionstatechange = () => {
      if (!this.connected) this.rtcConnMightBeReady();
    };

    (window as any).rtc = this.rtcConn;
  }

  startLink(opts: RtcConn.StartLinkOpts): Promise<void> {
    const { myIdentity, peerAddr, connVia, beingConnected, timeout, offer } = opts;
    this.peerIdentity = opts.peerIdentity || new PeerIdentity(opts.peerAddr);
    return new Promise((resolve, reject) => {
      this.startLinkResolve = resolve;
      this.setupConnVia(connVia);
      this.setupIceCandidate(connVia);

      setTimeout(() => {
        if (!this.connected) {
          reject();
        }
      }, timeout);

      if (beingConnected) {
        this.rtcAnsweringFlow(peerAddr, myIdentity, connVia, offer);
      } else {
        this.rtcOfferingFlow(peerAddr, myIdentity, connVia);
      }
    })
  }

  private async rtcOfferingFlow(peerAddr: string, myIdentity: Identity, connVia: Tunnel) {
    this.setupChannel(this.rtcConn.createDataChannel(DATA_CHANNEL_NAME));

    await this.rtcConn.setLocalDescription(await this.rtcConn.createOffer());
    const offer = this.rtcConn.localDescription;

    const message = await makeRequestToConnMessage(myIdentity, peerAddr, offer);
    connVia.send(message);
  }

  private async rtcAnsweringFlow(peerAddr: string, myIdentity: Identity, connVia: Tunnel, offer: RTCSessionDescription) {
    await this.rtcConn.setRemoteDescription(offer);
    await this.rtcConn.setLocalDescription(await this.rtcConn.createAnswer());
    const answer = this.rtcConn.localDescription;

    const message = await makeRequestToConnResultMessage(myIdentity, peerAddr, answer);
    connVia.send(message);
  }

  private setupConnVia(connVia: Tunnel) {
    connVia.addEventListener('receive', event => {
      switch (event.detail.term) {
        case 'requestToConnResult':
          return this.onReceiveRequestToConnResult(
            newRequestToConnResultMessage(event.detail),
            connVia,
          );
        case 'rtcIce':
          return this.onReceiveRtcIce(
            newRtcIceMessage(event.detail)
          );
      }
    });
  }

  private async onReceiveRequestToConnResult(message: RequestToConnResultMessage, connVia: Tunnel) {
    this.peerIdentity.setSigningPubKey(message.signingPubKey);
    this.peerIdentity.setEncryptionPubKey(message.encryptionPubKey);

    if (await this.peerIdentity.verify(message.signature)) {
      await this.rtcConn.setRemoteDescription(message.answer);

      if (this.pendingReceivedIce.length > 0) {
        this.pendingReceivedIce.forEach(ice => {
          this.rtcConn.addIceCandidate(ice);
        });
      }
      if (this.pendingIce.length > 0) {
        this.pendingIce.forEach(ice => {
          connVia.send({ term: 'rtcIce', ice });
        });
      }
    } else {
      console.error(`peerIdentity '${this.peerIdentity.addr}' verification failed`);
    }
  }

  private onReceiveRtcIce(message: RtcIceMessage) {
    const ice = message.ice;
    if (this.rtcConn.remoteDescription) {
      this.rtcConn.addIceCandidate(ice);
    } else {
      this.pendingReceivedIce.push(ice);
    }
  }

  private setupIceCandidate(connVia: Tunnel) {
    this.rtcConn.onicecandidate = ({ candidate }) => {
      if (candidate) {
        if (this.rtcConn.remoteDescription) {
          connVia.send({ term: 'rtcIce', ice: candidate });
        } else {
          this.pendingIce.push(candidate);
        }
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

  async send(message: Message) {
    this.rtcDataChannel.send(JSON.stringify(message));
  }

  async close() {
    this.rtcConn.close();
  }
}

export default RtcConn;
