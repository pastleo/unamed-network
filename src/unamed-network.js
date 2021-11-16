const { EventEmitter } = require('events');
const KBucket = require('k-bucket');
//const { multiaddr } = require('multiaddr');
const PeerId = require('peer-id');
const BufferUtils = require('uint8arrays');
const SimplePeer = require('libp2p-webrtc-peer');
const crypto = require('libp2p-crypto');
const { sha256 } = require('multiformats/hashes/sha2');

const PUBSUB_TOPIC_PREFIX = 'unamed-network/';
const PROTOCOL_VERSION = '0.0.1';
const DEFAULT_KNOWN_SERVICE_NODES = [
  '/ip4/127.0.0.1/tcp/4005/ws/p2p/12D3KooWMg1RMxFkAGGEW9RS66M4sCqz8BePeXMVwTPBjw4oBjR2'
];
const MULTIHASH_ALG = 'sha1';
const SERVICE_NODE_ADDR_PROTO_NAMES = ['ws', 'wss']; // for dev, production should be 'wss' only.

class UnamedNetwork extends EventEmitter {
  constructor(ipfs, nodeType) {
    super();
    this.nodeType = nodeType;
    this.ipfs = ipfs;
    this.rooms = new Map(); // joined
    this.peers = new Map();
    this.waitingResolves = new Map();
    this.kBucket = new KBucket({ // known rooms
      numberOfNodesPerKBucket: 2,
      arbiter: (incumbent, candidate) => this.kBucketArbiter(incumbent, candidate),
      //localNodeId: idBuffer
    });
  }

  async start(knownServiceNodes = DEFAULT_KNOWN_SERVICE_NODES) {
    this.idInfo = await this.ipfs.id();
    this.nodeAddrs = this.idInfo.addresses.filter(
      addr => addr.protos().find(proto => SERVICE_NODE_ADDR_PROTO_NAMES.indexOf(proto.name) >= 0)
    );
    this.nodeType = this.nodeAddrs.length > 0 ? 'serviceNode' : 'clientNode';

    if (this.nodeType === 'clientNode' && !SimplePeer.WEBRTC_SUPPORT) {
      throw new Error(`UnamedNetwork.start: capabitlity not satisfied! no public address for ${SERVICE_NODE_ADDR_PROTO_NAMES.join(', ')} nor webRTC available.`);
    }

    await this.ipfs.pubsub.subscribe(`${PUBSUB_TOPIC_PREFIX}/${this.idInfo.id}`, packet => {
      try { // pubsub.subscribe is muting errors
        this.handleSelfSubPacket(packet);
      } catch (e) {
        console.error(e);
      }
    });
    if (this.nodeType === 'serviceNode') {
      await this.join(this.idInfo.id);
    }

    this.knownServiceNodes = knownServiceNodes.filter(addr => addr.indexOf(this.idInfo.id) === -1);
    await Promise.all(
      shuffle(this.knownServiceNodes).slice(-3).map(addr => this.connectAddr(addr))
    );
  }

  async join(roomName) {
    if (roomName.length < 3) throw new Error('room name have to be more than 3 characters');

    const roomNameHash = BufferUtils.toString(
      await hash(BufferUtils.fromString(roomName)),
      'base64',
    );
    if (this.rooms.has(roomNameHash)) return true;

    // create room locally
    this.setRoom(roomNameHash, true, {
      name: roomName,
    });

    const packet = this.createInternetPacket(roomNameHash, {
      type: 'join',
      roomName,
    });
    const peer = this.routeInternet(packet);

    //const response = await new Promise(resolve => {
      //this.queryPacketIds.set(
        //packet.packetId,
        //resolve
      //);

      //const peer =
    //});
  }

  // =================

  kBucketArbiter(incumbent, candidate) {
    console.warn('kBucketArbiter: should not be called, returning incumbent', { incumbent, candidate })
    return incumbent;
  }

  handleSelfSubPacket(data) {
    if (data.from === this.idInfo.id) return;

    const dataStr = BufferUtils.toString(data.data);
    console.log(`handleSelfSubPacket: from ${data.from}: ${dataStr}`)

    let packet = null;
    try {
      packet = JSON.parse(dataStr);
    } catch (e) {}
    if (packet === null) return;

		this.handleJsonPackageForMe(data.from, packet);
  }

  handleJsonPackageForMe(from, packet) {
    switch(packet.type) {
      case 'ping':
        return this.handlePing(from, packet);
      case 'pong':
        return this.handleResponsePacket(from, packet);
      case 'signal':
        break;
    }
  }

  handlePing(from, packet) {
    this.setPeer(from, packet);
    const pongPacket = this.createPacket({
      type: 'pong',
      nodeType: this.nodeType,
      roomNameHashes: [...this.rooms.keys()],
    });
    this.respondPacket(packet, this.peers.get(from), pongPacket);
  }

  setPeer(peerId, payload) {
    const { nodeType, roomNameHashes } = payload;

    let peer = this.peers.get(peerId);
    let isNew = !peer;
    if (isNew) {
      peer = {
        peerId,
        nodeType,
        roomNameHashes: new Set(),
      };
      this.peers.set(peerId, peer);
    }

    roomNameHashes.forEach(roomNameHash => {
      this.setRoom(roomNameHash, false, {
        peers: [peerId],
      });
      peer.roomNameHashes.add(roomNameHash);
    });
    return peer;
  }

  setRoom(roomNameHash, toJoin, payload) {
    // to remove Room or peer in room, implement another function

    const roomNameHashBuffer = BufferUtils.fromString(roomNameHash, 'base64');
    const joinedRoom = this.rooms.get(roomNameHash);
    const joinedAlready = !!joinedRoom;
    const kBucketRoom = this.kBucket.get(roomNameHashBuffer);
    const inKBucket = !!kBucketRoom;

    const room = joinedRoom || kBucketRoom || {
      // new room in local memory:
      id: roomNameHashBuffer,
      roomNameHash,
      peers: new Set(),
    }

    // updating
    room.vectorClock = Date.now();
    room.name = payload.name;

    const newPeers = [];
    (payload.peers || []).forEach(peerId => { // payload.peers can be js array or Set
      if (!room.peers.has(peerId)) {
        room.peers.add(peerId);
        newPeers.push(peerId);
      }
    });

    if (!joinedAlready && toJoin) {
      this.rooms.set(roomNameHash, room);
    }
    if (!inKBucket && room.peers.size > 0) {
      this.kBucket.add(room);
    }

    if (toJoin || joinedAlready) {
      newPeers.forEach(peerId => {
        this.emit('new-peer', { roomName: room.name, peerId });
      });
    }
  }

  createPacket(content) {
    return {
      ...content,
      protocol: PROTOCOL_VERSION,
      packetId: randomId(),
    }
  }

  createInternetPacket(targetHash, content) {
    return {
      ...this.createPacket(content),
      targetHash,
      fromPath: [this.idInfo.id],
    }
  }

  routeInternet(packet) {
    const targetHashBuffer = BufferUtils.fromString(packet.targetHash);
    const rooms = this.kBucket.closest(targetHashBuffer, 2).filter(room => room.peers.size > 0);
    console.log('WIP: routeInternet', rooms);
  }

  async sendPacket(peer, packet) {
    if ([this.nodeType, peer.nodeType].indexOf('serviceNode') !== -1) {
      await this.ipfs.pubsub.publish(`${PUBSUB_TOPIC_PREFIX}/${peer.peerId}`, JSON.stringify(packet));
    } else if (peer.rtcPeer) {
    } else {
      throw new Error('sendPacket: peer is not serviceNode nor rtcPeer');
    }
  }

  async connectWebrtc(peerId) {
    return new Promise(resolve => {
      const peer = new SimplePeer({ initiator: true });
      peer.on('signal', data => {
        this.sendPacket({
          type: 'signal',
          to: peerId,
          data,
        });
      });
      peer.on('connect', () => {
        console.log(`connecting to ${peerId} other successfully`)
        resolve(peer);

        setInterval(() => {
          const rnd = `${(new Date()).toISOString()}: ${Math.random() * 10000}`;
          peer.send(rnd);
        }, 2000);
      });
      peer.on('data', data => {
        console.log('got a message from peer being connected: ' + data)
      });
      console.log('peer inited', peer);
      this.peers[peerId] = peer;
    });
  }

  async connectAddr(multiaddr) {
    await this.ipfs.swarm.connect(multiaddr);
    const peerId = last(multiaddr.split('/'));
    const peer = {
      peerId,
      nodeType: 'serviceNode',
    }

    const packet = this.createPacket({
      type: 'ping',
      nodeType: this.nodeType,
      roomNameHashes: [...this.rooms.keys()],
    });
    const pongPacket = await this.sendAndWaitForPacket('pong', peer, packet);
    this.setPeer(peerId, pongPacket);
  }

  getWaitingId(type, packet) {
    return [type, packet.reqId].join('/');
  }
  sendAndWaitForPacket(responsePacketType, peer, packet) {
    const reqId = randomId();
    const reqPacket = { ...packet, reqId };
    const waitingId = this.getWaitingId(responsePacketType, reqPacket);
    return new Promise(resolve => {
      this.waitingResolves.set(waitingId, resolve);
      this.sendPacket(peer, reqPacket);
    });
  }
  respondPacket(reqPacket, peer, packet) {
    this.sendPacket(peer, { reqId: reqPacket.reqId, ...packet });
  }
  handleResponsePacket(_from, packet) {
    const waitingId = this.getWaitingId(packet.type, packet);
    const resolve = this.waitingResolves.get(waitingId);
    if (resolve) resolve(packet);
  }

  // TODO: remove:
  testKBucket() {
    const otherIdBuffer1 = PeerId.parse('12D3KooWJMXrVovsCuU1czeowx2xGizUipkiHBgHbUQ1dAD3UbCK').toBytes().slice(6);
    const otherIdBuffer2 = PeerId.parse('12D3KooWJMb4m8HjfJVHnBc9T5rWYkvn9BBtgRV6bYqGWnJCXf7j').toBytes().slice(6);
    console.log({
      otherIdBuffer1, otherIdBuffer2,
    });

    this.kBucket.add({ id: otherIdBuffer1, name: 'otherIdBuffer1' });
    this.kBucket.add({ id: otherIdBuffer2, name: 'otherIdBuffer2' });
    console.log(this.kBucket);
    console.log(
      this.kBucket.closest(new Uint8Array([126, 221, 53]), 1),
      this.kBucket.root
    );
  }

  handleJsonPackageForMeOld(from, json) {
    let peer = this.peers[from];
    switch(json.type) {
      case 'hello':
        this.kBucket.add({
          id: peerIdBuffer(from),
          peerId: from,
          type: json.nodeType,
        });
        break;
      case 'signal':
        if (!peer) {
          peer = new SimplePeer();
          peer.on('signal', data => {
            this.sendMessage({
              type: 'signal',
              to: from,
              data,
            });
          });
          peer.on('connect', () => {
            console.log('being connected from the other successfully')
            setInterval(() => {
              const rnd = `${(new Date()).toISOString()}: ${Math.random() * 10000}`;
              peer.send(rnd);
            }, 2000);
          });
          peer.on('data', data => {
            console.log('got a message from peer connecting: ' + data)
          });
          this.peers[from] = peer;
        }
        peer.signal(json.data);
        break;
    }
  }
}

function peerIdBuffer(peerIdStr) {
  return PeerId.parse(peerIdStr).toBytes().slice(6)
}
function last(arr) {
  return arr[arr.length - 1];
}
function shuffle(oriArray) {
  const array = [...oriArray];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
async function hash(buf) {
  return (await sha256.digest(buf)).digest;
}
function randomId() {
  return BufferUtils.toString(crypto.randomBytes(12), 'base64');
}

module.exports = UnamedNetwork;
