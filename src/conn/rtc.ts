import Conn, { ConnStartLinkOpts, MessageReceivedEvent } from './base'
import { Message } from '../utils/message'

class RtcConn extends Conn {
  private rtcConn: RTCPeerConnection;

  constructor(rtcConfig: RTCConfiguration = {}) {
    super();
    this.rtcConn = new RTCPeerConnection(rtcConfig);
  }

  startLink(opts: ConnStartLinkOpts): Promise<void> {
    const { peerAddr, connVia, offer, timeout } = opts;
    return new Promise(async (resolve, reject) => {
      setTimeout(() => {
        if (!this.connected) {
          reject();
        }
      }, timeout);

      if (offer) { // accepting offer, being connected
        await this.rtcAnsweringFlow(peerAddr, connVia, offer);
      } else { // creating offer, connecting to others
        await this.rtcOfferingFlow(peerAddr, connVia);
      }
      resolve();
    })
  }

  private async rtcOfferingFlow(peerAddr: string, connVia: Conn) {
        //this.setupChannels(this._rtcConn.createDataChannel('send'), resolve);

        //this._rmViaReceiveListeners.push(
          //connVia.on('receive', ({ term, payload: { fromAddr, answer }}) => {
            //if (addr === fromAddr && terms.connAccept === term) {
              //this._rtcConn.setRemoteDescription(answer);
            //}
          //})
        //)

    //const createdOffer = await this._rtcConn.createOffer();
    //await this._rtcConn.setLocalDescription(createdOffer);
    //const rtcOffer = this._rtcConn.localDescription;

    //connVia.send(terms.connReqRelay, {
      //toAddr: addr, offer: { rtcOffer },
    //});
  }

  private async rtcAnsweringFlow(peerAddr: string, connVia: Conn, offer: RTCSessionDescription) {
    //this.rtcConn.ondatachannel = ({ channel }) => this.setupChannels(channel, resolve);
    
    //await this._rtcConn.setRemoteDescription(rtcOffer);
    //const createdAnswer = await this._rtcConn.createAnswer();
    //await this._rtcConn.setLocalDescription(createdAnswer);
    //const answer = this._rtcConn.localDescription;

    //connVia.send(terms.connAcceptRelay, { toAddr: addr, answer })
  }

  private setupChannels(channel: RTCDataChannel) {
    //channel.onmessage = ({ data: firstData }) => {
      //if (firstData === 'ready') {
        //switch (channel.label) {
          //case 'send':
            //this._sendChannel = channel;
            //this._sendChannel.onmessage = ({ data }) => this._onSendChannelMessage(data);
            //break;
        //}
        //this._rtcConnMightBeReady(startLinkResolve);
      //}
    //};
    //channel.onopen = () => channel.send('ready');
    //channel.onclose = () => this._closeRtcConn(this._closing ? reasons.DISCONNECT : reasons.PEER_DISCONNECT);
  }

  async send(message: Message) {
  }

  async close() {
  }
}

export default RtcConn;
