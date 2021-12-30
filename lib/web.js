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

const MB = 1024 * 1024;
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
  const knownServiceAddr = KNOWN_SERVICE_ADDRS;

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
    refreshRoomPeersTable();
  });
  unamedNetwork.addListener('member-left', ({ room, memberPeer }) => {
    log('unamedNetwork [member-left]', { room, memberPeer });
    refreshRoomPeersTable();
  });

  unamedNetwork.addListener('room-message', ({ room, fromMember, message }) => {
    log('unamedNetwork [room-message]', { room, fromMember, message });
    addToMessageBox(room.name, fromMember.peerId, message);
  });

  await unamedNetwork.start(knownServiceAddr);
  refreshRoomPeersTable();
  log('unamedNetwork started, unamedNetwork.id:', unamedNetwork.id);
  document.getElementById('unamedNetwork-id').textContent = unamedNetwork.id;

  document.getElementById('join').addEventListener('click', async () => {
    const input = document.getElementById('join-room-name');
    input.style = 'border: yellow solid 1px;'

    const memberExists = await unamedNetwork.join(input.value);
    input.style = memberExists ? 'border: green solid 1px;' : 'border: blue solid 1px;';

    document.getElementById('broadcast-room').value = input.value;
    input.value = '';
    refreshRoomPeersTable();
  });

  document.getElementById('broadcast').addEventListener('click', async () => {
    const roomNameInput = document.getElementById('broadcast-room');
    const messageInput = document.getElementById('broadcast-message');
    const recipientsInput = document.getElementById('broadcast-recipient');
    const recipients = recipientsInput.value ? [recipientsInput.value] : [];
    await unamedNetwork.broadcast(roomNameInput.value, messageInput.value, recipients);
    addToMessageBox(roomNameInput.value, unamedNetwork.id, messageInput.value);
    messageInput.value = '';
  });

  async function sendBigPacket() {
    const roomNameInput = document.getElementById('broadcast-room');
    const strData = 'x'.repeat(MB);
    const data = Array(64).fill(strData).join();
    const recipientsInput = document.getElementById('broadcast-recipient');
    const recipients = recipientsInput.value ? [recipientsInput.value] : [];
    await unamedNetwork.broadcast(roomNameInput.value, data, recipients);
  }
  window.sendBigPacket = sendBigPacket;

  function refreshRoomPeersTable() {
    const tbody = document.getElementById('room-peers');
    tbody.innerHTML = '';
    if (unamedNetwork.rooms.size <= 0) {
      const td = document.createElement('td');
      td.colSpan = 2;
      td.textContent = 'No Rooms';
      const tr = document.createElement('tr');
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    unamedNetwork.rooms.forEach((room, roomNameHash) => {
      const roomTd = document.createElement('td');
      roomTd.textContent = room.name ? `${room.name} (${roomNameHash})` : `(${roomNameHash})`;
      if (room.joined) {
        if (unamedNetwork.primaryRoomNameHash === roomNameHash) {
          roomTd.textContent += ' [primary]';
        } else {
          roomTd.textContent += ' [joined]';
        }
      }
      const peersTd = document.createElement('td');
      peersTd.textContent = room.members.size > 0 ? (
        [...room.members.keys()].join(', ')
      ) : 'No Peers';
      const tr = document.createElement('tr');
      tr.appendChild(roomTd);
      tr.appendChild(peersTd);
      tbody.appendChild(tr);
    })
  }

  function addToMessageBox(roomName, fromPeerId, message) {
    const pElement = document.createElement('p');
    pElement.textContent = `[${roomName}] ${fromPeerId}: `;
    const displayingMessage = typeof message === 'string' ? (
      message.length > 512 ? `[${Math.floor(BufferUtils.fromString(message).length / MB)} MB] ${message.slice(0, 512)}...` : message
    ) : JSON.stringify(message);
    pElement.textContent += displayingMessage;
    document.getElementById('message-box').appendChild(pElement);
  }

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
