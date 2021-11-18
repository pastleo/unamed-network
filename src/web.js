const IPFS = require('ipfs-core');
const WS = require('libp2p-websockets');
const filters = require('libp2p-websockets/src/filters');
const transportKey = WS.prototype[Symbol.toStringTag];
const debug = require('debug');

const UnamedNetwork = require('./unamed-network');

const { DEV_KNOWN_SERVICE_ADDRS } = require('./dev-env');

debug.enable([
  'unamedNetwork:*',
  '-unamedNetwork:start',
].join(',')); // for development

async function main() {
  const ipfs = await IPFS.create({
    config: {
      // If you want to connect to the public bootstrap nodes, remove the next line
      Bootstrap: [
        ...DEV_KNOWN_SERVICE_ADDRS,
      ]
    },
    libp2p: {
      config: {
        transport: {
          // This is added for local demo!
          // In a production environment the default filter should be used
          // where only DNS + WSS addresses will be dialed by websockets in the browser.
          [transportKey]: {
            filter: filters.all
          }
        }
      }
    }
  });

  window.ipfs = ipfs;
  console.log('window.ipfs created:', window.ipfs);

  const unamedNetwork = new UnamedNetwork(ipfs);
  window.unamedNetwork = unamedNetwork;
  console.log('window.unamedNetwork created:', window.unamedNetwork);

  await unamedNetwork.start();
  console.log('unamedNetwork started, unamedNetwork.idInfo:', unamedNetwork.idInfo);
}

main();
