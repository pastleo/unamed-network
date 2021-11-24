import UnamedNetwork from './unamed-network.js';

import * as IPFS from 'ipfs-core';
import WS from 'libp2p-websockets';
import filters from 'libp2p-websockets/src/filters';

import debug from 'debug';
import * as BufferUtils from 'uint8arrays';

import {
  WEB_USE_DEV_IPFS_OPTIONS,
  WEB_IPFS_OPTIONS,
  WEB_UNAMED_NETWORK_CONFIG,
  KNOWN_SERVICE_ADDRS,
} from '../env.js';

const log = debug('web.js');

debug.enable([
  'unamedNetwork:*',
  '-unamedNetwork:start',
  '-unamedNetwork:packet:*',
  'web.js',
].join(',')); // for development

async function main() {
  const ipfs = await IPFS.create({
    ...(WEB_USE_DEV_IPFS_OPTIONS ? {
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
    } : {}),
    ...WEB_IPFS_OPTIONS,
  });

  window.ipfs = ipfs;
  log('window.ipfs created:', window.ipfs);

  //const knownServiceAddr = JSON.parse(localStorage.getItem('unamedNetwork:knownServiceAddr') || 'null') || KNOWN_SERVICE_ADDRS;
  const knownServiceAddr = KNOWN_SERVICE_ADDRS; // for development

  const unamedNetwork = new UnamedNetwork(ipfs, WEB_UNAMED_NETWORK_CONFIG);
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

  async function ipfsCat(cid) {
    const chunks = []
    for await (const chunk of ipfs.cat(cid)) {
      chunks.push(chunk)
    }
    const content = BufferUtils.toString(BufferUtils.concat(chunks));
    console.log(`content of '${cid}':`, content);
    return content;
  }
  window.ipfsCat = ipfsCat;
}

main();
