import ConnManager, { RequestToConnEvent } from './base';
import RtcConn from '../conn/rtc';
import { PeerIdentity } from '../misc/identity';
import { RequestToConnMessage, RequestToConnResultMessage, RtcIceMessage } from '../misc/message';

class BrowserConnManager extends ConnManager {
  private pendingRtcConns: Record<string, RtcConn> = {};

  async connectUnnamed(peerAddr: string, viaAddr: string, opts: ConnManager.ConnectOpts = {}): Promise<void> {
    const rtcConn = new RtcConn();
    this.pendingRtcConns[peerAddr] = rtcConn;

    try {
      await rtcConn.startLink({
        myIdentity: this.myIdentity, peerAddr,
        peerIdentity: new PeerIdentity(peerAddr),
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

  protected async onReceiveRequestToConn(message: RequestToConnMessage, fromAddr: string) {
    if (message.peerAddr === this.myIdentity.addr) {
      const peerAddr = message.myAddr;

      const peerIdentity = new PeerIdentity(peerAddr, message.signingPubKey, message.encryptionPubKey);
      if (await this.verifyPeerIdentity(peerIdentity, message.signature)) {
        const event = new RequestToConnEvent({ peerAddr, peerIdentity });
        this.dispatchEvent(event);

        if (!event.defaultPrevented) {
          this.connect(peerAddr, fromAddr, {
            offer: message.offer,
            beingConnected: true,
            peerIdentity,
          });
        }
      }
    } else {
      this.send(message.peerAddr, message);
    }
  }

  protected async onReceiveRequestToConnResult(message: RequestToConnResultMessage, _fromAddr: string) {
    if (message.peerAddr === this.myIdentity.addr) {
      const peerAddr = message.myAddr;
      const pendingConn = this.pendingRtcConns[peerAddr];

      pendingConn.peerIdentity.setSigningPubKey(message.signingPubKey);
      pendingConn.peerIdentity.setEncryptionPubKey(message.encryptionPubKey);

      if (pendingConn && (await this.verifyPeerIdentity(pendingConn.peerIdentity, message.signature))) {
        pendingConn.requestToConnResult(message.answer);
      }
    } else {
      this.send(message.peerAddr, message);
    }
  }

  protected onReceiveRtcIce(message: RtcIceMessage, _fromAddr: string) {
    if (message.peerAddr === this.myIdentity.addr) {
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
