import UnamedNetwork from '../lib/unamed-network.js';

import { create as createIPFS } from 'ipfs-core';
import debug from 'debug';

import WS from 'libp2p-websockets';
import filters from 'libp2p-websockets/src/filters';

const WEB_DEV_IPFS_OPTIONS = {
  config: {
    Bootstrap: []
  },
  preload: {
    addresses: []
  },
  libp2p: {
    config: {
      transport: {
        // In a production environment the default filter should be used
        // where only DNS + WSS addresses will be dialed by websockets in the browser.
        [WS.prototype[Symbol.toStringTag]]: {
          filter: filters.all
        }
      }
    }
  }
}

export default UnamedNetwork;
export { createIPFS, WEB_DEV_IPFS_OPTIONS, debug };
