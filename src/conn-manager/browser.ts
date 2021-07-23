import ConnManager from './base';

class BrowserConnManager extends ConnManager {

  async connectRtc(addr: string, viaAddr: string): Promise<void> {
  }
}

export default BrowserConnManager;
