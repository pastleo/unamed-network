const repl = require('repl');
const { create: createIpfsClient } = require('ipfs-http-client');

const UnamedNetwork = require('./unamed-network');
const debug = require('debug');

debug.enable([
  'unamedNetwork:*',
  '-unamedNetwork:start',
  '-unamedNetwork:packet:content',
  '-unamedNetwork:addrConn',
].join(',')); // for development

async function main() {
  const ipfsClient = createIpfsClient({
    url: process.env.IPFS_API || 'http://localhost:5001',
  })

  global.ipfsClient = ipfsClient;
  console.log('global.ipfsClient started')

  const unamedNetwork = new UnamedNetwork(ipfsClient, 'serviceNode');
  await unamedNetwork.start();
  global.unamedNetwork = unamedNetwork;
  console.log('global.unamedNetwork started');

  repl.start({ prompt: '> ' });
}

main();
