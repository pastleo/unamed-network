const IPFS = require('ipfs-core')
const WS = require('libp2p-websockets')
const filters = require('libp2p-websockets/src/filters')
const transportKey = WS.prototype[Symbol.toStringTag]
const debug = require('debug');

const UnamedNetwork = require('./unamed-network');

const { DEV_KNOWN_SERVICE_ADDRS } = require('./dev-env');

const log = debug('web.js');

debug.enable([
  'unamedNetwork:*',
  '-unamedNetwork:start',
  '-unamedNetwork:packet:*',
  'web.js',
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
  log('window.ipfs created:', window.ipfs);

  //const knownServiceAddr = JSON.parse(localStorage.getItem('unamedNetwork:knownServiceAddr') || 'null') || DEV_KNOWN_SERVICE_ADDRS;
  const knownServiceAddr = DEV_KNOWN_SERVICE_ADDRS; // for development

  const unamedNetwork = new UnamedNetwork(ipfs);
  window.unamedNetwork = unamedNetwork;
  log('window.unamedNetwork created:', window.unamedNetwork);

  unamedNetwork.addListener('new-known-service-addr', ({ addr }) => {
    log('unamedNetwork [new-known-service-addr]', { addr });
    knownServiceAddr.push(addr);
    localStorage.setItem('unamedNetwork:knownServiceAddr', JSON.stringify(knownServiceAddr));
  });

  unamedNetwork.addListener('new-member', ({ room, member }) => {
    log('unamedNetwork [new-member]', { room, member });
  });

  unamedNetwork.addListener('room-message', ({ room, fromMember, message }) => {
    log('unamedNetwork [room-message]', { room, fromMember, message });
  });

  await unamedNetwork.start(knownServiceAddr);
  log('unamedNetwork started, unamedNetwork.idInfo.id:', unamedNetwork.idInfo.id);
  document.getElementById('idInfo-id').textContent = unamedNetwork.idInfo.id;
}

main();
