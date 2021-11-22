const IPFS = require('ipfs-core')
const WS = require('libp2p-websockets')
const filters = require('libp2p-websockets/src/filters')
const transportKey = WS.prototype[Symbol.toStringTag]
const debug = require('debug');

const UnamedNetwork = require('./unamed-network');

const { DEV_KNOWN_SERVICE_ADDRS } = require('./dev-env');

debug.enable([
  'unamedNetwork:*',
  '-unamedNetwork:start',
  '-unamedNetwork:packet:*',
].join(',')); // for development

async function main() {
  const ipfs = await IPFS.create({
    config: {
      // If you want to connect to the public bootstrap nodes, remove the next line
      Bootstrap: [
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

  const knownServiceAddr = JSON.parse(localStorage.getItem('unamedNetwork:knownServiceAddr') || 'null') || DEV_KNOWN_SERVICE_ADDRS;

  const unamedNetwork = new UnamedNetwork(ipfs);
  window.unamedNetwork = unamedNetwork;
  console.log('window.unamedNetwork created:', window.unamedNetwork);

  unamedNetwork.addListener('new-known-service-addr', ({ addr }) => {
    console.log('unamedNetwork [new-known-service-addr]', { addr });
    knownServiceAddr.push(addr);
    localStorage.setItem('unamedNetwork:knownServiceAddr', JSON.stringify(knownServiceAddr));
  });

  await unamedNetwork.start(knownServiceAddr);
  console.log('unamedNetwork started, unamedNetwork.idInfo.id:', unamedNetwork.idInfo.id);
  document.getElementById('idInfo-id').textContent = unamedNetwork.idInfo.id;
}

main();
