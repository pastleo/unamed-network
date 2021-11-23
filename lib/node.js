import UnamedNetwork from './unamed-network.js';
import { create as createIpfsClient } from 'ipfs-http-client';

import repl from 'repl';
import debug from 'debug';

import { DEV_KNOWN_SERVICE_ADDRS } from './dev-env.js';

const log = debug('node.js');

debug.enable([
  'unamedNetwork:*',
  '-unamedNetwork:start',
  '-unamedNetwork:packetContent:*',
  '-unamedNetwork:addrConn',
  'node.js',
].join(',')); // for development

async function main() {
  const ipfsClient = createIpfsClient({
    url: process.env.IPFS_API || 'http://localhost:5001',
  })

  global.ipfsClient = ipfsClient;
  log('global.ipfsClient created')

  const unamedNetwork = new UnamedNetwork(ipfsClient);
  global.unamedNetwork = unamedNetwork;
  log('global.unamedNetwork created');

  await unamedNetwork.start(DEV_KNOWN_SERVICE_ADDRS);
  log('unamedNetwork started');

  unamedNetwork.addListener('new-member', ({ room, member }) => {
    log('unamedNetwork [new-member]', { room, member });
  });

  unamedNetwork.addListener('room-message', ({ room, fromMember, message }) => {
    log('unamedNetwork [room-message]', { room, fromMember, message });
  });

  setTimeout(() => {
    log('unamedNetwork.idInfo.id:', unamedNetwork.idInfo.id);
    repl.start({ prompt: '> ' });
  }, 250);
}

main();
