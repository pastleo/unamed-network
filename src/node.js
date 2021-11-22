const repl = require('repl');
const { create: createIpfsClient } = require('ipfs-http-client');
const debug = require('debug');

const UnamedNetwork = require('./unamed-network');

const { DEV_KNOWN_SERVICE_ADDRS } = require('./dev-env');

debug.enable([
  'unamedNetwork:*',
  '-unamedNetwork:start',
  '-unamedNetwork:packetContent:*',
  '-unamedNetwork:addrConn',
].join(',')); // for development

async function main() {
  const ipfsClient = createIpfsClient({
    url: process.env.IPFS_API || 'http://localhost:5001',
  })

  global.ipfsClient = ipfsClient;
  console.log('global.ipfsClient created')

  const unamedNetwork = new UnamedNetwork(ipfsClient);
  global.unamedNetwork = unamedNetwork;
  console.log('global.unamedNetwork created');

  await unamedNetwork.start(DEV_KNOWN_SERVICE_ADDRS);
  console.log('unamedNetwork started');

  setTimeout(() => {
    console.log('unamedNetwork.idInfo.id:', unamedNetwork.idInfo.id);
    repl.start({ prompt: '> ' });
  }, 250);
}

main();
