import ConnManager from './base';

class BrowserConnManager extends ConnManager {

  async connectRtc(peerAddr: string, viaAddr: string): Promise<void> {
  }
}

export default BrowserConnManager;
