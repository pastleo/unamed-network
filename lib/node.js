import { WebSocketServer } from 'ws';

import UnamedNetwork from './unamed-network.js';
//import { create as createIpfsClient } from 'ipfs-http-client';

import repl from 'repl';
import debug from 'debug';

import {
  SERVICE_NODE_IPFS_API,
  SERVICE_NODE_UNAMED_NETWORK_CONFIG,
  KNOWN_SERVICE_ADDRS,
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
  const wss = new WebSocketServer({ port: 8080 });

  wss.on('connection', function connection(ws) {
    ws.on('message', function message(data) {
      console.log('received: %s', data);
    });

    ws.send('something');
  });


  //const ipfsClient = createIpfsClient({
    //url: process.env.IPFS_API || SERVICE_NODE_IPFS_API,
  //})

  //global.ipfsClient = ipfsClient;
  //log('global.ipfsClient created')

  const unamedNetwork = new UnamedNetwork(null, SERVICE_NODE_UNAMED_NETWORK_CONFIG);
  global.unamedNetwork = unamedNetwork;
  log('global.unamedNetwork created');

  process.on('uncaughtException', (err, origin) => {
    console.error('uncaughtException:', err, origin);
  });

  await unamedNetwork.start(KNOWN_SERVICE_ADDRS, ['http://127.0.0.1:8080']);
  log('unamedNetwork started');

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
    log('unamedNetwork.idInfo.id:', unamedNetwork.idInfo.id);
    repl.start({ prompt: '> ' });
  }, 250);
}

main();
