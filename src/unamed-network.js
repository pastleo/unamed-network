const { EventEmitter } = require('events');
const KBucket = require('k-bucket');
//const { multiaddr } = require('multiaddr');
const PeerId = require('peer-id');
const BufferUtils = require('uint8arrays');
const SimplePeer = require('libp2p-webrtc-peer');
const crypto = require('libp2p-crypto');
const { sha256 } = require('multiformats/hashes/sha2');

const PUBSUB_TOPIC_PREFIX = 'unamed-network/';
const PROTOCOL = 'unamed-network/0.0.1';
const DEFAULT_KNOWN_SERVICE_NODES = [
  '/ip4/127.0.0.1/tcp/4005/ws/p2p/12D3KooWMg1RMxFkAGGEW9RS66M4sCqz8BePeXMVwTPBjw4oBjR2'
];
const SERVICE_NODE_ADDR_PROTO_NAMES = ['ws', 'wss']; // for dev, production should be 'wss' only.

class UnamedNetwork extends EventEmitter {
  constructor(ipfs, nodeType) {
    super();
    this.nodeType = nodeType;
    this.ipfs = ipfs;
    this.rooms = new Map(); // joined
    this.peers = new Map();
    this.requestResolveRejects = new Map();
    this.started = false;
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

    this.knownServiceNodes = knownServiceNodes.filter(addr => addr.indexOf(this.idInfo.id) === -1);
    await Promise.all(
      shuffle(this.knownServiceNodes).slice(-3).map(addr => this.connectAddr(addr))
    );

    if (this.nodeType === 'serviceNode') {
      await this.join(this.idInfo.id);
    }
    this.started = true;
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

    const findResPacket = await this.findRoom(roomNameHash, roomName);

    this.peers.forEach(peer => {
      this.ping(peer); // not awaiting for pong for speed
    });

    if (!findResPacket) return;

    // TODO: connect to peers near targetRoom

    if (!findResPacket.found) {
      return this.logIfStarted(`room '${roomName}' not found, this node is the only member. (might need to retry a couple of times)`);
    }

    console.log('join: room found!', { findResPacket });

    // TODO: room is found, then:
    // * [ ] connect to the replied peer
    // * [ ] send join request to the peer
    // * [ ] using replied join packet to connect to all other peers in the room
  }

  // =================

  kBucketArbiter(incumbent, candidate) {
    console.warn('kBucketArbiter: should not be called, returning incumbent', { incumbent, candidate })
    return incumbent;
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

  handleSelfSubPacket(data) {
    if (data.from === this.idInfo.id) return;

    const dataStr = BufferUtils.toString(data.data);
    console.log(`handleSelfSubPacket: from ${data.from}: ${dataStr}`)

    let packet;
    try {
      packet = JSON.parse(dataStr);
    } catch (error) {
      return console.warn(`handleSelfSubPacket: not valid json from ${data.from}: ${dataStr}`, error);
    }

    this.handlePacket(data.from, packet);
  }

  handlePacket(from, packet) {
    if (packet.protocol !== PROTOCOL) {
      return console.warn(`handlePacket: unexpected protocol '${packet.protocol}', currently using '${PROTOCOL}'`);
    }

    switch(packet.type) {
      case 'ping':
        return this.handlePingPacket(from, packet);
      case 'pong':
        return this.handleResponsePacket(from, packet);
      case 'find':
        return this.handleFindPacket(from, packet);
      case 'findRes':
        return this.handleInternetPacket(from, packet) || this.handleResponsePacket(from, packet);
      case 'signal':
        break;
    }
  }

  handleInternetPacket(_from, packet) {
    if (
      packet.route.length === (packet.hop + 1) &&
      packet.route[packet.hop] === this.idInfo.id
    ) {
      return false;
    }

    this.sendInternetPacket(packet);
    return true;
  }

  handlePingPacket(from, packet) {
    this.setPeer(from, packet);
    const pongPacket = this.createPacket({
      type: 'pong',
      nodeType: this.nodeType,
      roomNameHashes: [...this.rooms.keys()],
    });
    this.respond(packet, pongPacket);
    this.sendPacket(this.peers.get(from), pongPacket);
    return true;
  }

  handleFindPacket(_from, packet) {
    if (this.rooms.has(packet.targetHash)) {
      const foundPacket = this.createInternetPacket(
        [...packet.fromPath, this.idInfo.id].reverse(),
        {
          type: 'findRes',
          found: true,
          roomName: this.rooms.get(packet.targetHash).name, // for dbg
        },
      );

      this.respond(packet, foundPacket);
      this.sendInternetPacket(foundPacket);
      return true;
    }

    this.routeAndSendFindPacket(packet);
    return true;
  }

  createPacket(content) {
    return {
      ...content,
      protocol: PROTOCOL,
      packetId: randomId(),
    }
  }

  createInternetPacket(route, content) {
    return {
      ...this.createPacket(content),
      route,
      hop: 0,
    }
  }

  async sendPacket(peer, packet) {
    if ([this.nodeType, peer.nodeType].indexOf('serviceNode') !== -1) {
      await this.ipfs.pubsub.publish(`${PUBSUB_TOPIC_PREFIX}/${peer.peerId}`, JSON.stringify(packet));
    } else if (peer.rtcPeer) {
      // WIP
    } else {
      throw new Error('sendPacket: peer is not serviceNode nor rtcPeer');
    }
  }

  async sendInternetPacket(packet) {
    if (packet.route[packet.hop] !== this.idInfo.id) {
      console.warn('sendInternetPacket: current hop pointing peerId is not self', { packet });
      return;
    }

    const nextHop = packet.hop + 1;
    const peerId = packet.route[nextHop];
    const peer = this.peers.get(peerId);

    if (!peer) {
      console.warn('sendInternetPacket: peer not found, sending InternetNoPeerPacket', { packet });
      const noPeerPacket = this.createInternetPacket(
        packet.route.slice(0, packet.hop).reverse(),
        {
          type: 'noPeer',
          oriPacketId: packet.packetId,
        }
      );
      this.sendInternetPacket(noPeerPacket);
      return;
    }

    packet.hop = nextHop;
    this.sendPacket(peer, packet);
  }

  async ping(peer) {
    const packet = this.createPacket({
      type: 'ping',
      nodeType: this.nodeType,
      roomNameHashes: [...this.rooms.keys()],
    });
    const pongRequest = this.request(packet);
    this.sendPacket(peer, packet);
    const pongPacket = await pongRequest;
    this.setPeer(peer.peerId, pongPacket);
  }

  async findRoom(roomNameHash, roomName) {
    //const packet = this.createFindPacket(roomNameHash, roomName);
    const packet =  this.createPacket({
      type: 'find',
      targetHash: roomNameHash,
      fromPath: [],
      lastDistance: Infinity, // Infinity cannot be encode in JSON, but it should and will be updated in routeAndSendFindPacket

      roomName, // for dbg
    });

    try {
      const findRequest = this.request(packet);
      this.routeAndSendFindPacket(packet);
      return await findRequest;
    } catch (error) {
      this.warnIfStarted('join: find request failed: ', error);
      return null;
    }
  }

  createFindPacket(roomNameHash, roomName) {
    return this.createPacket({
      type: 'find',
      targetHash: roomNameHash,
      fromPath: [],
      lastDistance: Infinity, // Infinity cannot be encode in JSON, but it should and will be updated in routeAndSendFindPacket

      roomName, // for dbg
    });
  }

  routeAndSendFindPacket(packet) {
    const targetHashBuffer = BufferUtils.fromString(packet.targetHash, 'base64');

    const room = this.kBucket.closest(targetHashBuffer, 1)[0];

    if (!room) {
      return this.routeFindPacketFailed(packet, 'routeAndSendFindPacket: no room in kBucket');
    }

    const distance = KBucket.distance(room.id, targetHashBuffer);
    if (distance > packet.lastDistance) {
      return this.routeFindPacketFailed(packet, 'routeAndSendFindPacket: cannot find smaller distance between target');
    }

    const peerId = sample(
      [...room.peers].filter(id => packet.fromPath.indexOf(id) === -1)
    );

    if (!peerId) {
      return this.routeFindPacketFailed(packet, 'routeAndSendFindPacket: no peer in room available');
    }
    const peer = this.peers.get(peerId);

    packet.fromPath.push(this.idInfo.id);
    packet.lastDistance = distance;

    this.sendPacket(peer, packet)
  }

  routeFindPacketFailed(packet, reason) {
    this.warnIfStarted(reason);

    if (packet.fromPath.length <= 0) {
      // make self requested find to stop
      return this.cancelRequest(packet, new Error(`canceled: not even be able to send out, which means this node is the only node in the known network. (originally: ${reason})`));
    }

    const notFoundPacket = this.createInternetPacket(
      [...packet.fromPath, this.idInfo.id].reverse(),
      {
        type: 'findRes',
        found: false,
      },
    );

    this.respond(packet, notFoundPacket);
    this.sendInternetPacket(notFoundPacket);
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

    await this.ping(peer);
  }

  request(packet, timeout = 5000) {
    packet.reqId = randomId();
    const promise = new Promise((resolve, reject) => {
      this.requestResolveRejects.set(packet.reqId, [resolve, reject]);
    });

    setTimeout(() => {
      const request = this.requestResolveRejects.get(packet.reqId);
      if (request) {
        const [_, reject] = request;
        reject(
          new Error(`request: timeout for ${packet.reqId}`, { packet })
        );
      }
    }, timeout);

    return promise;
  }
  respond(reqPacket, packet) {
    packet.reqId = reqPacket.reqId;
  }
  popRequest(packet) {
    const request = this.requestResolveRejects.get(packet.reqId);
    if (request) {
      this.requestResolveRejects.delete(packet.reqId);
      return request;
    }
    return []; // allow array destruction
  }
  cancelRequest(reqPacket, reason) {
    const [_, reject] = this.popRequest(reqPacket);
    if (reject) reject(reason);
  }
  handleResponsePacket(_from, resPacket) {
    const [resolve] = this.popRequest(resPacket);
    if (!resolve) return false;
    resolve(resPacket);
    return true;
  }

  logIfStarted(...message) {
    if (this.started) {
      console.log(...message);
    }
  }
  warnIfStarted(...message) {
    if (this.started) {
      console.warn(...message);
    }
  }

  // TODO: remove:
  testSomeStuff() {
    // this doesn't work on repl, but work in code?
    console.log('BufferUtils.toString', BufferUtils.toString(new Uint8Array([0]), 'base64'));
  }

  handlePacketOld(from, json) {
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
function sample(array) {
  return array[Math.floor(array.length * Math.random())];
}
async function hash(buf) {
  return (await sha256.digest(buf)).digest;
}
function randomId() {
  return BufferUtils.toString(crypto.randomBytes(12), 'base64');
}

module.exports = UnamedNetwork;
