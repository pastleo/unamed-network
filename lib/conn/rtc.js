import Conn, { reasons } from './base.js'

import { terms } from '../const.js'

const rtcConnectionReadyStates = ['connected', 'completed'];

class RtcConn extends Conn {
  constructor(rtcConfig) {
    super();
    this._waitingForStartLinkResolves = [];
    this._rmViaReceiveListeners = [];
    this._rtcConn = new RTCPeerConnection(rtcConfig);
  }

  async startLink(opts) {
    const { addr, connVia, offer, timeout } = opts || {};

    await new Promise(async (resolve, reject) => {
      this._rmViaReceiveListeners.push(
        connVia.on('receive', ({ term, payload: { fromAddr, candidate }}) => {
          if (addr !== fromAddr) { return; }
          if (terms.rtcIce === term) {
            this._rtcConn.addIceCandidate(candidate);
          } else if (terms.connReject === term) {
            this._rtcEstConnErr(reasons.REJECTED, reject);
          }
        })
      )

      this._rtcConn.onicecandidate = ({ candidate }) => {
        if (candidate) {
          connVia.send(terms.rtcIceRelay, {
            toAddr: addr, candidate,
          });
        }
      };

      this._rtcConn.oniceconnectionstatechange = () => {
        if (!this._rtcConnMightBeReady(resolve) &&
          this._rtcConn.iceConnectionState === "failed" ||
          this._rtcConn.iceConnectionState === "disconnected" ||
          this._rtcConn.iceConnectionState === "closed"
        ) {
          if (this.connected) {
            this._closeRtcConn(reasons.ERROR);
          } else {
            this._rtcEstConnErr(reasons.ERROR, reject);
          }
        }
      };

      setTimeout(() => {
        if (!this.connected) {
          this._rtcEstConnErr(reasons.TIMEOUT, reject);
        }
      }, timeout || 10000);

      if ((offer || {}).rtcOffer) { // accepting offer, being connected
        this._rtcConn.ondatachannel = ({ channel }) => this._setupChannels(channel, resolve);

        this._rtcAnsweringFlow(addr, offer.rtcOffer, connVia);
      } else { // creating offer, connecting to others
        this._setupChannels(this._rtcConn.createDataChannel('send'), resolve);

        this._rmViaReceiveListeners.push(
          connVia.on('receive', ({ term, payload: { fromAddr, answer }}) => {
            if (addr === fromAddr && terms.connAccept === term) {
              this._rtcConn.setRemoteDescription(answer);
            }
          })
        )

        this._rtcOfferingFlow(addr, connVia, offer);
      }
    });
  }

  async _rtcAnsweringFlow(addr, rtcOffer, connVia) {
    await this._rtcConn.setRemoteDescription(rtcOffer);
    const createdAnswer = await this._rtcConn.createAnswer();
    await this._rtcConn.setLocalDescription(createdAnswer);
    const answer = this._rtcConn.localDescription;

    connVia.send(terms.connAcceptRelay, { toAddr: addr, answer })
  }
  async _rtcOfferingFlow(addr, connVia, offer) {
    const createdOffer = await this._rtcConn.createOffer();
    await this._rtcConn.setLocalDescription(createdOffer);
    const rtcOffer = this._rtcConn.localDescription;

    connVia.send(terms.connReqRelay, {
      toAddr: addr, offer: { ...offer, rtcOffer },
    });
  }

  _setupChannels(channel, startLinkResolve) {
    channel.onmessage = ({ data: firstData }) => {
      if (firstData === 'ready') {
        switch (channel.label) {
          case 'send':
            this._sendChannel = channel;
            this._sendChannel.onmessage = ({ data }) => this._onSendChannelMessage(data);
            break;
        }
        this._rtcConnMightBeReady(startLinkResolve);
      }
    };
    channel.onopen = () => channel.send('ready');
    channel.onclose = () => this._closeRtcConn(this._closing ? reasons.DISCONNECT : reasons.PEER_DISCONNECT);
  }

  _rtcConnMightBeReady(startLinkResolve) {
    if (
      !this.connected && !this._closed && rtcConnectionReadyStates.indexOf(this._rtcConn.iceConnectionState) !== -1 && this._sendChannel
    ) {
      this.connected = true;
      this._rmViaReceiveListeners.forEach(r => r())
      startLinkResolve();
      setTimeout(() => this._waitingForStartLinkResolves.forEach(r => r()));
      return true;
    } else {
      return false;
    }
  }
  _rtcEstConnErr(reason, startLinkReject) {
    if (!this._closed) {
      this._closed = true;
      this._rmViaReceiveListeners.forEach(r => r())
      this._rtcConn.close();
      startLinkReject(reason);
    }
  }

  close(timeout = 5000) {
    this._closing = true;
    this._sendChannel.close();
    setTimeout(() => this._closeRtcConn(reasons.DISCONNECT), timeout);
  }

  _closeRtcConn(reason) {
    if (!this._closed) {
      this._closed = true;
      this._rtcConn.close();
      this._eventDispatcher.emit('close', { reason })
    }
  }

  async _onSendChannelMessage(data) {
    if (!this.connected) { await new Promise(r => this._waitingForStartLinkResolves.push(r)); }
    const { term, payload } = JSON.parse(data);
    this._eventDispatcher.emit('receive', { term, payload: payload || {} })
  }

  send(term, payload = {}) {
    this._sendChannel.send(JSON.stringify({ term, payload }));
  }
}

RtcConn.protocols = ['rtc:'];

export default RtcConn;
