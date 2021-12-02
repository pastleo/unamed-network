import UnamedNetwork from './unamed-network.js';

import * as IPFS from 'ipfs-core';
import WS from 'libp2p-websockets';
import filters from 'libp2p-websockets/src/filters';

import debug from 'debug';
import * as BufferUtils from 'uint8arrays';
import crypto from 'libp2p-crypto';

import {
  KNOWN_SERVICE_ADDRS,

  WEB_USE_DEV_IPFS_OPTIONS, WEB_IPFS_OPTIONS,
  WEB_UNAMED_NETWORK_CONFIG,
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

  const unamedNetwork = new UnamedNetwork({
    ...WEB_UNAMED_NETWORK_CONFIG,
    id: (await ipfs.id()).id, // not necessary to use id from ipfs
  });
  window.unamedNetwork = unamedNetwork;
  log('window.unamedNetwork created:', window.unamedNetwork);

  unamedNetwork.addListener('new-known-service-addr', ({ addr }) => {
    log('unamedNetwork [new-known-service-addr]', { addr });
    knownServiceAddr.push(addr);
    localStorage.setItem('unamedNetwork:knownServiceAddr', JSON.stringify(knownServiceAddr));
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

  await unamedNetwork.start(knownServiceAddr);
  log('unamedNetwork started, unamedNetwork.id:', unamedNetwork.id);
  document.getElementById('unamedNetwork-id').textContent = unamedNetwork.id;

  /** @link https://github.com/ipfs/js-ipfs/blob/master/docs/core-api/FILES.md#ipfsadddata-options */
  async function ipfsAddRandom() {
    const content = randomBase64();
    console.log(`adding content: '${content}'`);
    console.log(await ipfs.add(content));
  }
  window.ipfsAddRandom = ipfsAddRandom;

  /** @link https://github.com/ipfs/js-ipfs/blob/master/docs/core-api/FILES.md#ipfscatipfspath-options */
  async function ipfsCat(cidOrIpfsPath) {
    const chunks = []
    for await (const chunk of ipfs.cat(cidOrIpfsPath)) {
      chunks.push(chunk)
    }
    const content = BufferUtils.toString(BufferUtils.concat(chunks));
    console.log(`content of '${cidOrIpfsPath}':`, content);
    return content;
  }
  window.ipfsCat = ipfsCat;

  /** @link https://github.com/ipfs/js-ipfs/blob/master/docs/core-api/FILES.md#the-mutable-files-api */
  async function ipfsMkWriteRandom(path = '/tmp/123') {
    await ipfs.files.mkdir(`${path}`, { parents: true });
    await ipfs.files.write(`${path}/a`, randomBase64(), { create: true });
    await ipfs.files.write(`${path}/b`, randomBase64(), { create: true });
    await ipfs.files.mkdir(`${path}/234`, { parents: true });
    await ipfs.files.write(`${path}/234/c`, randomBase64(), { create: true });
    await ipfs.files.mkdir(`${path}/234/345`, { parents: true });
    console.log(`ipfsMkWriteRandom: done in ${path}`);
  }
  window.ipfsMkWriteRandom = ipfsMkWriteRandom;

  /** @link https://github.com/ipfs/js-ipfs/blob/master/docs/core-api/FILES.md#ipfsfileslspath-options */
  async function ipfsLsTree(path = '/tmp') {
    for await (const file of ipfs.files.ls(path)) {
      const filePath = [path, file.name].join('/');
      console.log(filePath, file.cid.toString(), file);
      if (file.type === 'directory') {
        await ipfsLsTree(filePath);
      }
    }
  }
  window.ipfsLsTree = ipfsLsTree;

  /** @link https://github.com/ipfs/js-ipfs/blob/master/docs/core-api/FILES.md#ipfsfilesreadpath-options */
  async function ipfsRead(ipfsPathOrMfsPath) {
    const chunks = []
    for await (const chunk of ipfs.files.read(ipfsPathOrMfsPath)) {
      chunks.push(chunk)
    }
    const content = BufferUtils.toString(BufferUtils.concat(chunks));
    console.log(`content of '${ipfsPathOrMfsPath}':`, content);
    return content;
  }
  window.ipfsRead = ipfsRead;
}

main();

function randomBase64() {
  return BufferUtils.toString(crypto.randomBytes(64), 'base64');
}
