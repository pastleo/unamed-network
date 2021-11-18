const { EventEmitter } = require('events');
const KBucket = require('k-bucket');
const debug = require('debug');
//const { multiaddr } = require('multiaddr');
const BufferUtils = require('uint8arrays');
const SimplePeer = require('libp2p-webrtc-peer');
const crypto = require('libp2p-crypto');
const { sha256 } = require('multiformats/hashes/sha2');

const PUBSUB_TOPIC_PREFIX = 'unamed-network/';
const PROTOCOL = 'unamed-network/0.0.1';
const K_BUCKET_OPTIONS_SERVICE_NODE = {
  numberOfNodesPerKBucket: 20,
}
const K_BUCKET_OPTIONS_CLIENT_NODE = {
  numberOfNodesPerKBucket: 2,
}
const EPHEMERAL_ALG = 'P-256';
const EPHEMERAL_STRETCHER_CIPHER_TYPE = 'AES-128';
const EPHEMERAL_STRETCHER_HASH_TYPE = 'SHA1';
const DEFAULT_KNOWN_SERVICE_NODES = [
  '/ip4/127.0.0.1/tcp/4005/ws/p2p/12D3KooWMg1RMxFkAGGEW9RS66M4sCqz8BePeXMVwTPBjw4oBjR2'
];

const dbg = ns => debug(`unamedNetwork:${ns}`);
const logger = {
  packet: dbg('packet'),
  packetContent: dbg('packet:content'),
  join: dbg('join'),
  start: dbg('start'),
  kBucket: dbg('kBucket'),
  routeFind: dbg('routeFind'),
  conn: dbg('conn'),
  addrConn: dbg('addrConn'),
  webrtcConn: dbg('webrtcConn'),
}

class UnamedNetwork extends EventEmitter {
  constructor(ipfs, nodeType) {
    super();
    this.nodeType = nodeType;
    this.ipfs = ipfs;
    this.rooms = new Map();
    this.primaryRoomNameHash = null;
    this.peers = new Map();
    this.initKBucket(null);

    this.requestResolveRejects = new Map();
    this.started = false;
  }

  async start(knownServiceNodes = DEFAULT_KNOWN_SERVICE_NODES) {
    this.idInfo = await this.ipfs.id();
    this.addrs = this.idInfo.addresses.filter(
      addr => addr.protos().find(proto => ['ws', 'wss'].indexOf(proto.name) >= 0)
      // TODO: only WAN address and wss only
    );
    this.nodeType = this.addrs.length > 0 ? 'serviceNode' : 'clientNode';

    if (this.nodeType === 'clientNode' && !SimplePeer.WEBRTC_SUPPORT) {
      throw new Error(`UnamedNetwork.start: capabitlity not satisfied! no public wss addr nor webRTC available.`);
    }

    await this.ipfs.pubsub.subscribe(pubsubLinkTopic(this.idInfo.id), packet => {
      try { // pubsub.subscribe is muting errors
        this.handleSelfSubPacket(packet);
      } catch (e) {
        console.error(e);
      }
    });

    this.knownServiceNodes = knownServiceNodes.filter(addr => addr.indexOf(this.idInfo.id) === -1);
    await Promise.all(
      shuffle(this.knownServiceNodes).slice(-3).map(addr => this.connectAddr([addr]))
    );

    if (this.nodeType === 'serviceNode') {
      try {
        await this.join(this.idInfo.id);
      } catch (errorNotSurprised) {
        logger.start(errorNotSurprised);
      }
    }
    this.started = true;
  }

  async join(roomName, makePrimary = false) { // return if room has other peers
    if (roomName.length < 3) throw new Error('room name have to be more than 3 characters');

    const roomNameHash = BufferUtils.toString(
      await hash(BufferUtils.fromString(roomName)),
      'base64',
    );
    if (this.getRoomJoined(roomNameHash)) return true;

    if (makePrimary || !this.primaryRoomNameHash) {
      this.primaryRoomNameHash = roomNameHash;
      this.initKBucket();
    }

    // create room locally
    this.setRoom(roomNameHash, true, {
      name: roomName,
    });

    const findResPacket = await this.findRoom(roomNameHash, roomName);

    // announce that we have a new room
    this.peers.forEach((_, peerId) => {
      this.ping(peerId); // not awaiting for pong for speed
    });

    if (!findResPacket) return false;

    const routeToRoom = findResPacket.route.reverse();

    logger.join(`join: find room got response, route: [${findResPacket.route.join(' - ')}]`);

    if (!findResPacket.found) {
      this.logIfStarted('join', `room '${roomName}' not found, this node is the only member (might need to retry a couple of times), start connecting to nearest node...`);
      const nearestNode = last(routeToRoom);
      await this.connectPeerOnNetwork(routeToRoom);
      logger.join(`nearest node '${nearestNode}' connected!`);
      return false;
    }
    logger.join(`room '${roomName}' found`);

    const firstRoomMember = last(routeToRoom);
    await this.connectPeerOnNetwork(routeToRoom);

    logger.join(`room member '${firstRoomMember}' connected!`);

    return true;

    // TODO: room is found, then:
    // * [x] connect to the replied peer
    // * [ ] send join request to the peer
    // * [ ] using replied join packet to connect to all other peers in the room
  }

  // =================

  initKBucket() {
    const localNodeId = this.primaryRoomNameHash ? BufferUtils.fromString(this.primaryRoomNameHash, 'base64') : null;
    this.kBucket = new KBucket({
      ...(this.nodeType === 'serviceNode' ? K_BUCKET_OPTIONS_SERVICE_NODE : K_BUCKET_OPTIONS_CLIENT_NODE),
      localNodeId,
    });
    this.kBucket.on('ping', (oldContacts, newContact) => this.kBucketPing(oldContacts, newContact))

    this.rooms.forEach(room => {
      this.addRoomToKBucket(room);
    });
  }

  kBucketPing(oldContacts, newContact) {
    // Emitted every time a contact is added that would exceed the capacity of a don't split k-bucket it belongs to.
    logger.kBucket('kBucketPing:', oldContacts, newContact);
    // TODO: disconnect oldContacts
  }

  getConnectedPeer(peerId) {
    const peer = this.peers.get(peerId);
    if (peer && peer.state === 'connected') return peer;
    return null;
  }

  setPeer(peerId, payload) {
    // payload: { addrs?: [], roomNameHashes?: [], rtc?: Rtc, setConnected?: boolean }
    let peer = this.peers.get(peerId);
    if (!peer) {
      peer = {
        peerId,
        state: 'pending',
        addrs: [],
        nodeType: 'clientNode',
        roomNameHashes: [],
        connectedResolves: [],
      };
      this.peers.set(peerId, peer);
    }

    if (payload.addrs) {
      peer.addrs = payload.addrs;
      peer.nodeType = peer.addrs.length > 0 ? 'serviceNode' : 'clientNode';
    }
    if (payload.roomNameHashes) {
      peer.roomNameHashes = payload.roomNameHashes;
      peer.roomNameHashes.forEach(roomNameHash => {
        this.setRoom(roomNameHash, false, {
          peers: [peerId],
        });
      });
    }
    if (payload.rtc) {
      peer.rtc = payload.rtc;
    }
    if (payload.setConnected) {
      const oriPending = peer.state === 'pending';
      peer.state = 'connected';

      if (oriPending) {
        this.emit('new-peer', peer);
      }
    }
    if (peer.state === 'connected') {
      peer.connectedResolves.forEach(r => r(peer));
      peer.connectedResolves = [];
    }

    return peer;
  }

  getRoomJoined(roomNameHash) {
    const room = this.rooms.get(roomNameHash);
    return room && room.joined;
  }

  addRoomToKBucket(room) {
    // TODO: what if the room is our primary room?
    if (room.peers.size > 0) {
      this.kBucket.add({
        id: BufferUtils.fromString(room.roomNameHash, 'base64'),
        roomNameHash: room.roomNameHash,
        vectorClock: Date.now(),
      });
    }
  }

  setRoom(roomNameHash, toJoin, payload) {
    // payload: { name?: roomName, peers?: PeerId[] }
    // to remove room or peer in room, implement another function

    let room = this.rooms.get(roomNameHash);
    if (!room) {
      room = {
        roomNameHash,
        joined: false,
        peers: new Set(),
      }
      this.rooms.set(roomNameHash, room);
    }

    const newPeers = [];

    // updating
    room.name = room.name || payload.name;
    (payload.peers || []).forEach(peerId => {
      if (!room.peers.has(peerId)) {
        room.peers.add(peerId);
        newPeers.push(peerId);
      }
    });

    this.addRoomToKBucket(room);

    if (toJoin) {
      if (!room.name) throw new Error('setRoom: joined room but no room.name', { room });
      room.joined = true;
    }
  }

  async connectAddr(addrs) {
    const addr = sample(addrs);
    const peerId = last(addr.split('/'));

    logger.addrConn(`connectAddr: to '${peerId}' via '${addr}'`);

    await this.ipfs.swarm.connect(addr);

    const pubsubTopic = pubsubLinkTopic(peerId);
    await this.ipfs.pubsub.subscribe(pubsubTopic); // TODO: if this prototype can work, we should use link/rpc from libp2p
    let peers = [];
    do {
      logger.addrConn(`connectAddr: wait for pubsub '${pubsubTopic}' peer (as link) to show up... [${peers.join(', ')}]`);
      peers = await this.ipfs.pubsub.peers(pubsubTopic);
      await timeoutPromise(200);
    } while(peers.indexOf(peerId) === -1)

    this.setPeer(peerId, {
      addrs,
    });
    await this.ping(peerId);
  }

  async connectRtc(route, ephemeral, myEphemeralKey, peerEphemeralKey, initiator) {
    const sharedKey = await ephemeral.genSharedKey(BufferUtils.fromString(peerEphemeralKey, 'base64'));
    const keyStretched = await crypto.keys.keyStretcher(EPHEMERAL_STRETCHER_CIPHER_TYPE, EPHEMERAL_STRETCHER_HASH_TYPE, sharedKey);
    const cipherK1 = await crypto.aes.create(keyStretched.k1.cipherKey, keyStretched.k1.iv);
    const cipherK2 = await crypto.aes.create(keyStretched.k2.cipherKey, keyStretched.k2.iv);

    const encrypter = initiator ? cipherK1 : cipherK2;
    const decrypter = initiator ? cipherK2 : cipherK1;

    const peerId = last(route);
    const simplePeer = new SimplePeer({ initiator });
    const peer = this.setPeer(peerId, {
      rtc: {
        simplePeer,
        ephemeral, encrypter, decrypter,
      },
    });

    logger.webrtcConn('connectRtc: encrypter/decrypter and SimplePeer (webRtc) created', { initiator, peer, encrypter, decrypter });

    simplePeer.on('signal', async signal => {
      logger.webrtcConn('connectRtc: signal for the other peer', { signal });
      const encryptedSignal = BufferUtils.toString(
        await encrypter.encrypt(
          BufferUtils.fromString(
            JSON.stringify(signal)
          )
        ),
        'base64'
      );

      const connectSignalPacket = this.createNetworkPacket(route, {
        type: 'connectSignal',
        ephemeralKey: myEphemeralKey,
        encryptedSignal,
      });
      this.sendNetworkPacket(connectSignalPacket);
    });
    simplePeer.on('connect', () => {
      logger.webrtcConn(`connectRtc: rtc between '${peerId}' is connected`);

      if (initiator) this.ping(peerId);
    });
    simplePeer.on('data', data => {
      this.handleRtcPacket(peer, data);
    });

    return peer.rtc;
  }

  async rtcReceivedSignal(peerId, encryptedSignal) {
    const peer = this.peers.get(peerId);
    if (!peer || !peer.rtc) return;

    const signal = JSON.parse(
      BufferUtils.toString(
        await peer.rtc.decrypter.decrypt(
          BufferUtils.fromString(encryptedSignal, 'base64')
        )
      )
    );
    logger.webrtcConn('rtcReceivedSignal:', { peerId, signal });
    peer.rtc.simplePeer.signal(signal);
  }

  handleSelfSubPacket(data) {
    if (data.from === this.idInfo.id) return;

    const dataStr = BufferUtils.toString(data.data);

    let packet;
    try {
      packet = JSON.parse(dataStr);
    } catch (error) {
      return console.warn(`handleSelfSubPacket: not valid json from ${data.from}: ${dataStr}`, error);
    }

    this.handlePacket(data.from, packet);
  }

  handleRtcPacket(peer, data) {
    const dataStr = BufferUtils.toString(data);

    let packet;
    try {
      packet = JSON.parse(dataStr);
    } catch (error) {
      return console.warn(`handleRtcPacket: not valid json from ${peer.peerId}: ${dataStr}`, error);
    }

    this.handlePacket(peer.peerId, packet);
  }

  handlePacket(from, packet) {
    if (packet.protocol !== PROTOCOL) {
      return console.warn(`handlePacket: unexpected protocol '${packet.protocol}', currently using '${PROTOCOL}'`);
    }
    logger.packet(`handlePacket: receive ${briefPacket(packet, `from ${from}`)}`);
    logger.packetContent(packet);

    switch(packet.type) {
      case 'ping':
        return this.handlePingPacket(from, packet);
      case 'pong':
        return this.handleResponsePacket(from, packet);
      case 'find':
        return this.handleFindPacket(from, packet);
      case 'findRes':
        return this.handleNetworkPacket(from, packet) || this.handleResponsePacket(from, packet);
      case 'connect':
        return this.handleNetworkPacket(from, packet) || this.handleConnectPacket(from, packet);
      case 'connectRes':
        return this.handleNetworkPacket(from, packet) || this.handleResponsePacket(from, packet);
      case 'connectSignal':
        return this.handleNetworkPacket(from, packet) || this.handleConnectSignalPacket(from, packet);
    }
  }

  handleNetworkPacket(_from, packet) {
    if (
      packet.route.length === (packet.hop + 1) &&
      packet.route[packet.hop] === this.idInfo.id
    ) {
      return false;
    }

    this.sendNetworkPacket(packet);
    return true;
  }

  handlePingPacket(from, packet) {
    const peer = this.setPeer(from, {
      ...packet, setConnected: true,
    });
    const pongPacket = this.createPacket({
      type: 'pong',
      ...this.pingPongPayload(),
    });
    this.respond(packet, pongPacket);
    this.sendPacket(peer, pongPacket);
    return true;
  }

  handleFindPacket(_from, packet) {
    if (this.getRoomJoined(packet.targetHash)) {
      const foundPacket = this.createNetworkPacket(
        [...packet.fromPath, this.idInfo.id].reverse(),
        {
          type: 'findRes',
          found: true,
          roomName: this.rooms.get(packet.targetHash).name, // for dbg
        },
      );

      this.respond(packet, foundPacket);
      this.sendNetworkPacket(foundPacket);
      return true;
    }

    this.routeAndSendFindPacket(packet);
    return true;
  }

  handleConnectPacket(_from, packet) {
    const peerId = packet.route[0];
    if (this.peers.has(peerId)) { // already connected or pending, reject
      const connectResPacket = this.createNetworkPacket(packet.route.reverse(), {
        type: 'connectRes',
        accepted: false,
      });
      this.respond(packet, connectResPacket);
      this.sendNetworkPacket(connectResPacket);
      return true;
    }
    this.setPeer(peerId, {});

    // otherwise accept connection directly for now
    this.acceptConnectionFromNetwork(packet);
    return true;
  }

  handleConnectSignalPacket(_from, packet) {
    this.rtcReceivedSignal(packet.route[0], packet.encryptedSignal);
    return true;
  }

  createPacket(content) {
    return {
      ...content,
      protocol: PROTOCOL,
      packetId: randomId(),
    }
  }

  createNetworkPacket(route, content) {
    return {
      ...this.createPacket(content),
      route,
      hop: 0,
    }
  }

  request(reqPacket, timeout = 5000) {
    reqPacket.reqId = randomId();
    const timer = setTimeout(() => {
      this.rejectRequest(reqPacket,  new Error(`request: timeout for ${reqPacket.reqId}`, { reqPacket }));
    }, timeout);

    const promise = new Promise((resolve, reject) => {
      this.requestResolveRejects.set(reqPacket.reqId, [resolve, reject, reqPacket]);
    }).finally(() => {
      clearTimeout(timer);
    });

    return promise;
  }
  respond(reqPacket, resPacket) {
    resPacket.reqId = reqPacket.reqId;
  }
  popRequest(packet) {
    const request = this.requestResolveRejects.get(packet.reqId);
    if (request) {
      this.requestResolveRejects.delete(packet.reqId);
      return request;
    }
    return []; // allow array destruction
  }
  rejectRequest(reqPacket, reason) {
    const [_, reject] = this.popRequest(reqPacket);
    if (reject) reject(reason);
  }
  handleResponsePacket(_from, resPacket) {
    const [resolve] = this.popRequest(resPacket);
    if (!resolve) return false;
    resolve(resPacket);
    return true;
  }

  async sendPacket(peer, packet) {
    logger.packet(`sendPacket: send ${briefPacket(packet, `to ${peer.peerId}`)}`);
    logger.packetContent(packet);

    if ([this.nodeType, peer.nodeType].indexOf('serviceNode') !== -1) {
      await this.ipfs.pubsub.publish(pubsubLinkTopic(peer.peerId), JSON.stringify(packet));
    } else if (peer.rtc) {
      peer.rtc.simplePeer.send(JSON.stringify(packet));
    } else {
      throw new Error('sendPacket: peer is not serviceNode nor rtcPeer');
    }
  }

  async sendNetworkPacket(packet) {
    if (packet.route[packet.hop] !== this.idInfo.id) {
      console.warn('sendNetworkPacket: current hop pointing peerId is not self', { packet });
      return;
    }

    const nextHop = packet.hop + 1;
    const peerId = packet.route[nextHop];
    const peer = this.getConnectedPeer(peerId);

    if (!peer) {
      console.warn('sendNetworkPacket: peer not found, sending NetworkNoPeerPacket', { packet });
      const noPeerPacket = this.createNetworkPacket(
        packet.route.slice(0, packet.hop).reverse(),
        {
          type: 'noPeer',
          oriPacketId: packet.packetId,
        }
      );
      this.sendNetworkPacket(noPeerPacket);
      return;
    }

    packet.hop = nextHop;
    await this.sendPacket(peer, packet);
  }

  pingPongPayload() {
    return {
      addrs: this.addrs,
      roomNameHashes: [...this.rooms.keys()].filter(roomNameHash => this.getRoomJoined(roomNameHash)),
    }
  }
  async ping(peerId) {
    const peer = this.peers.get(peerId);
    const packet = this.createPacket({
      type: 'ping',
      ...this.pingPongPayload(),
    });
    const pingRequest = this.request(packet);
    this.sendPacket(peer, packet);
    const pongPacket = await pingRequest;
    this.setPeer(peer.peerId, {
      ...pongPacket, setConnected: true,
    });
  }

  async findRoom(roomNameHash, roomName) {
    const packet =  this.createPacket({
      type: 'find',
      targetHash: roomNameHash,
      fromPath: [],
      lastDistance: Infinity, // Infinity cannot be encode in JSON, but it should and will be updated in routeAndSendFindPacket

      roomName, // for dbg
    });

    const findRequest = this.request(packet);
    this.routeAndSendFindPacket(packet);
    return await findRequest;
  }

  async connectPeerOnNetwork(route) {
    const peerId = last(route);
    const existingPeer = this.peers.get(peerId);
    if (existingPeer) {
      if (existingPeer.state === 'pending') {
        return new Promise(resolve => {
          existingPeer.connectedResolves.push(resolve);
        });
      }
      return true;
    }
    const peer = this.setPeer(peerId, {});
    const promise = new Promise(resolve => {
      peer.connectedResolves.push(resolve);
    });

    logger.conn(`connectPeerOnNetwork: to ${last(route)}`);

    const ephemeral = await crypto.keys.generateEphemeralKeyPair(EPHEMERAL_ALG);
    const ephemeralKey = BufferUtils.toString(ephemeral.key, 'base64');
    const connectPacket = this.createNetworkPacket(route, {
      type: 'connect',
      ephemeralKey,
      addrs: this.addrs,
    });

    const connectRequest = this.request(connectPacket);
    this.sendNetworkPacket(connectPacket);
    const connectResPacket = await connectRequest;

    if (!(connectResPacket.accepted && connectResPacket.method)) {
      throw new Error(`connectPeerOnNetwork: peer '${peerId}' rejected`, { connectResPacket });
    }

    logger.conn(`connectPeerOnNetwork: connect request accepted by peer, method: ${connectResPacket.method}`);

    switch (connectResPacket.method) {
      case 'myAddr': // means peer's addr
        this.connectAddr(connectResPacket.addrs);
      case 'yourAddr': // means this node's addr
        break;
        //if (this.getConnectedPeer(peerId)) return;
        //return await eventPromise(this, 'new-peer', peer => peer.peerId === peerId);
      case 'webrtc':
        this.connectRtc(route, ephemeral, ephemeralKey, connectResPacket.ephemeralKey, true);
        //if (this.getConnectedPeer(peerId)) return;
        //return await eventPromise(this, 'new-peer', peer => peer.peerId === peerId);
    }

    return promise;
  }

  async acceptConnectionFromNetwork(connectPacket) {
    const routeToPeer = connectPacket.route.reverse();
    logger.conn(`acceptConnectionFromNetwork: from ${last(routeToPeer)}`);

    if (this.nodeType === 'serviceNode') {
      logger.conn(`acceptConnectionFromNetwork: provide method: myAddr (${this.addrs.join(',')})`);
      const connectResPacket = this.createNetworkPacket(routeToPeer, {
        type: 'connectRes',
        accepted: true,
        method: 'myAddr',
        addrs: this.addrs,
      });

      this.respond(connectPacket, connectResPacket);
      return this.sendNetworkPacket(connectResPacket);
    }

    if (connectPacket.addrs.length > 0) {
      logger.conn(`acceptConnectionFromNetwork: provide method: yourAddr (peer's) (${connectPacket.addrs.join(', ')})`);
      const connectResPacket = this.createNetworkPacket(routeToPeer, {
        type: 'connectRes',
        accepted: true,
        method: 'yourAddr',
      });

      this.respond(connectPacket, connectResPacket);
      await this.sendNetworkPacket(connectResPacket);

      return this.connectAddr(connectPacket.addrs);
    }

    logger.conn(`acceptConnectionFromNetwork: provide method: webrtc, generating ephemeral keys...`);
    const ephemeral = await crypto.keys.generateEphemeralKeyPair(EPHEMERAL_ALG);
    const ephemeralKey = BufferUtils.toString(ephemeral.key, 'base64');
    await this.connectRtc(routeToPeer, ephemeral, ephemeralKey, connectPacket.ephemeralKey, false);
    // initiator will start sending signal immediately,
    //   at this moment the other peer does not know we are going to use webrtc (because connectRes has not been sent)
    //   to prevent connectRes packet arrive after connectSignal, we let the other peer be the initiator.

    const connectResPacket = this.createNetworkPacket(routeToPeer, {
      type: 'connectRes',
      accepted: true,
      method: 'webrtc',
      ephemeralKey,
    });
    this.respond(connectPacket, connectResPacket);
    this.sendNetworkPacket(connectResPacket);
  }

  routeAndSendFindPacket(packet) {
    const targetHashBuffer = BufferUtils.fromString(packet.targetHash, 'base64');

    const contact = this.kBucket.closest(targetHashBuffer, 1)[0] || {};
    const room = this.rooms.get(contact.roomNameHash);

    if (!room) {
      return this.routeFindPacketFailed(packet, 'routeAndSendFindPacket: no room in kBucket');
    }

    const distance = KBucket.distance(contact.id, targetHashBuffer);
    if (distance > packet.lastDistance) {
      return this.routeFindPacketFailed(packet, 'routeAndSendFindPacket: cannot find smaller distance between target');
    }

    const peerId = sample(
      [...room.peers].filter(id => packet.fromPath.indexOf(id) === -1)
    );

    if (!peerId) {
      return this.routeFindPacketFailed(packet, 'routeAndSendFindPacket: no peer in room available');
    }
    const peer = this.getConnectedPeer(peerId);

    packet.fromPath.push(this.idInfo.id);
    packet.lastDistance = distance;

    return this.sendPacket(peer, packet)
  }

  routeFindPacketFailed(packet, reason) {
    this.logIfStarted('routeFind', `routeFindPacketFailed: ${reason}`);

    if (packet.fromPath.length <= 0) {
      // make self requested find to stop
      return this.rejectRequest(packet, new Error(`canceled: not even be able to send out, which means this node is the only node in the known network. (originally: ${reason})`));
    }

    const notFoundPacket = this.createNetworkPacket(
      [...packet.fromPath, this.idInfo.id].reverse(),
      {
        type: 'findRes',
        found: false,
      },
    );

    this.respond(packet, notFoundPacket);
    this.sendNetworkPacket(notFoundPacket);
  }

  logIfStarted(ns, ...message) {
    if (this.started) {
      logger[ns](...message);
    }
  }

  // TODO: remove:
  async testSomeStuff() {
    // this doesn't work on repl, but work in code?
    // console.log('BufferUtils.toString', BufferUtils.toString(new Uint8Array([0]), 'base64'));
  }
  async testEphemeral() {
    let pub1, pub2;

    // peer 1
    const ephemeral1 = await crypto.keys.generateEphemeralKeyPair('P-256');
    pub1 = BufferUtils.toString(ephemeral1.key, 'base64');

    // send pub1 to peer 2
    const ephemeral2 = await crypto.keys.generateEphemeralKeyPair('P-256');
    pub2 = BufferUtils.toString(ephemeral2.key, 'base64');
    const sharedKey2 = await ephemeral2.genSharedKey(BufferUtils.fromString(pub1, 'base64'));

    // send pub2 to peer 1
    const sharedKey1 = await ephemeral1.genSharedKey(BufferUtils.fromString(pub2, 'base64'));

    // peer 1
    const keyStretched1 = await crypto.keys.keyStretcher('AES-128', 'SHA1', sharedKey1);
    const cipher1To = await crypto.aes.create(keyStretched1.k1.cipherKey, keyStretched1.k1.iv);
    const cipher1Back = await crypto.aes.create(keyStretched1.k2.cipherKey, keyStretched1.k2.iv);

    const messageA = 'Hello, world!';
    const encryptedA = BufferUtils.toString(await cipher1To.encrypt(BufferUtils.fromString(messageA)), 'base64');
    
    // send encryptedA to peer 2
    const keyStretched2 = await crypto.keys.keyStretcher('AES-128', 'SHA1', sharedKey2);
    const cipher2To = await crypto.aes.create(keyStretched2.k2.cipherKey, keyStretched2.k2.iv);
    const cipher2Back = await crypto.aes.create(keyStretched2.k1.cipherKey, keyStretched2.k1.iv);

    const decryptedA = BufferUtils.toString(await cipher2Back.decrypt(
      BufferUtils.fromString(encryptedA, 'base64')
    ));

    const messageB = 'It worked!';
    const encryptedB = BufferUtils.toString(await cipher2To.encrypt(BufferUtils.fromString(messageB)), 'base64');

    // send encryptedB to peer 1
    const decryptedB = BufferUtils.toString(await cipher1Back.decrypt(
      BufferUtils.fromString(encryptedB, 'base64')
    ))

    const $ = (typeof window === 'undefined' ? global : window);
    $.testSomeStuffRes = {
      pub1, pub2,
      ephemeral1, ephemeral2,
      sharedKey1, sharedKey2,
      keyStretched1, keyStretched2,

      messageA, encryptedA, decryptedA,
      messageB, encryptedB, decryptedB,
    };
    console.log($.testSomeStuffRes);
  }
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
function pubsubLinkTopic(peerId) {
  return `${PUBSUB_TOPIC_PREFIX}${peerId}`
}
function timeoutPromise(timeout) {
  return new Promise(resolve => {
    setTimeout(resolve, timeout);
  });
}
function eventPromise(eventEmitter, eventName, eventFilterFn = () => true) {
  let rejectTmp;
  const promise = new Promise((resolve, reject) => {
    rejectTmp = reject;
    const listener = (...eventPayload) => {
      if (eventFilterFn(...eventPayload)) {
        eventEmitter.removeListener(eventName, listener);
        resolve(...eventPayload);
      }
    };
    eventEmitter.on(eventName, listener);
  });
  promise.reject = rejectTmp;
  return promise;
}
function briefPacket(packet, direction) {
  return `'${packet.type}' ${direction}` +
    (packet.reqId ? ` (reqId: ${packet.reqId})` : '') +
    (packet.route ? ` [${packet.route[0]} -> ${last(packet.route)}]` : '');
}

module.exports = UnamedNetwork;
