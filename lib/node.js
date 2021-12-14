import { WebSocketServer } from 'ws';

import UnamedNetwork from './unamed-network.js';
import { create as createIpfsClient } from 'ipfs-http-client';

import repl from 'repl';
import debug from 'debug';

import {
  KNOWN_SERVICE_ADDRS,

  SERVICE_NODE_PORT, SERVICE_NODE_IPFS_API,
  SERVICE_NODE_UNAMED_NETWORK_CONFIG,
  SERVICE_NODE_ADDRS,
} from '../env.js';

const log = debug('node.js');

debug.enable([
  'unamedNetwork:*',
  '-unamedNetwork:start',
  '-unamedNetwork:packetContent:*',
  '-unamedNetwork:addrConn',
  'node.js',
].join(',')); // for development

async function main() {
  let ipfsClient;
  if (SERVICE_NODE_IPFS_API) {
    ipfsClient = createIpfsClient({
      url: SERVICE_NODE_IPFS_API,
    })

    global.ipfsClient = ipfsClient;
    log('global.ipfsClient created')
  }

  const wss = new WebSocketServer({ port: SERVICE_NODE_PORT });

  const unamedNetwork = new UnamedNetwork({
    ...SERVICE_NODE_UNAMED_NETWORK_CONFIG,
    ...(ipfsClient && { id: (await ipfsClient.id()).id }),
  });
  global.unamedNetwork = unamedNetwork;
  log('global.unamedNetwork created');

  wss.on('connection', function connection(ws) {
    unamedNetwork.receiveAddrConn(ws);
  });

  await unamedNetwork.start(KNOWN_SERVICE_ADDRS, SERVICE_NODE_ADDRS);
  log('unamedNetwork started');

  // started successfully, prevent error from taking the process down:
  process.on('uncaughtException', (err, origin) => {
    console.error('uncaughtException:', err, origin);
  });

  unamedNetwork.addListener('new-member', ({ room, memberPeer }) => {
    log('unamedNetwork [new-member]', { room, memberPeer });
  });
  unamedNetwork.addListener('member-left', ({ room, memberPeer }) => {
    log('unamedNetwork [member-left]', { room, memberPeer });
  });

  unamedNetwork.addListener('room-message', ({ room, fromMember, message }) => {
    log('unamedNetwork [room-message]', { room, fromMember, message });
  });

  setTimeout(() => {
    log('unamedNetwork.id:', unamedNetwork.id);
    repl.start({ prompt: '> ' });
  }, 250);
}

main();
