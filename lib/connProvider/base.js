import { EventDispatcher } from '../utils.js'

class ConnProvider {
  constructor() {
    this._eventDispatcher = new EventDispatcher();
  }

  start(_connManager) {
    throw new Error("start() not implemented");
  }

  async connect(_addr, _viaAddr, _offer) {
    throw new Error("connect() not implemented");
  }

  /**
   * .on('req', ({ addr, offer, accept }) => {})
   * .on('new', ({ addr, newConn }) => {})
   */
  on(eventName, callback) {
    return this._eventDispatcher.on(eventName, callback);
  }
}

export default ConnProvider;
