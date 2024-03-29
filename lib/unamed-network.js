import EventEmitter from 'events';
import KBucket from 'k-bucket';
import WebSocket from 'isomorphic-ws';
import SimplePeer from 'libp2p-webrtc-peer';

import { multiaddr } from 'multiaddr';
import multiaddrToUrl from 'multiaddr-to-uri';
import * as BufferUtils from 'uint8arrays';
import crypto from 'libp2p-crypto';
import { sha256 } from 'multiformats/hashes/sha2';

import debug from 'debug';

const PROTOCOL = 'unamed-network/0.0.1';
const K_BUCKET_OPTIONS_SERVICE_NODE = {
  numberOfNodesPerKBucket: 20,
}
const K_BUCKET_OPTIONS_CLIENT_NODE = {
  numberOfNodesPerKBucket: 2,
}
const CONNECTED_NOT_JOINED_ROOM_MAX_MEMBERS_SERVICE_NODE = 20;
const CONNECTED_NOT_JOINED_ROOM_MAX_MEMBERS_CLIENT_NODE = 2;

const RECEIVE_ADDR_CONN_TIMEOUT = 10000;
const EPHEMERAL_ALG = 'P-256';
const EPHEMERAL_STRETCHER_CIPHER_TYPE = 'AES-128';
const EPHEMERAL_STRETCHER_HASH_TYPE = 'SHA1';
const PACKET_ID_CLEAR_TIMEOUT = 30000;
const KEEP_ALIVE_PING_INTERVAL = 30000;
const EOF = new Uint8Array([0]);
const WEBRTC_DATA_CHUNK_SIZE = 16 * 1024; // 16K, https://stackoverflow.com/questions/35381237/webrtc-data-channel-max-data-size

const dbg = ns => debug(`unamedNetwork:${ns}`);
const logger = {
  packetSend: dbg('packet:send'),
  packetContentSend: dbg('packetContent:send'),
  packetReceived: dbg('packet:receive'),
  packetContentReceived: dbg('packetContent:receive'),
  join: dbg('join'),
  start: dbg('start'),
  kBucket: dbg('kBucket'),
  routeFind: dbg('routeFind'),
  conn: dbg('conn'),
  addrConn: dbg('addrConn'),
  webrtcConn: dbg('webrtcConn'),
  routine: dbg('routine'),
  leave: dbg('leave'),
  closePeer: dbg('closePeer'),
}

class UnamedNetwork extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.rooms = new Map();
    this.primaryRoomNameHash = null;
    this.peers = new Map();
    this.initKBucket(null);

    this.started = false;
    this.knownServiceAddrs = [];

    this.requestResolveRejects = new Map();
    this.processedPackets = new Map();

    this.iceServers = [];
    this.addIceServers(this.config.iceServers);
  }

  async start(knownServiceAddrs = [], myAddrs = []) {
    this.id = this.config.id || randomId();
    this.addrs = myAddrs;
    this.nodeType = this.addrs.length > 0 ? 'serviceNode' : 'clientNode';

    if (this.nodeType === 'clientNode' && !SimplePeer.WEBRTC_SUPPORT) {
      throw new Error(`UnamedNetwork.start: capabitlity not satisfied! no public wss addr nor webRTC available.`);
    }
    if (knownServiceAddrs.length <= 0) {
      console.warn('start: no knownServiceAddrs provided, this node might be lonely and single');
    }

    this.knownServiceAddrs = knownServiceAddrs.filter(addr => {
      const knownNodeAddr = multiaddr(addr).nodeAddress();
      return this.addrs.findIndex(myAddr => {
        const nodeAddress = multiaddr(myAddr).nodeAddress();
        return nodeAddress.address === knownNodeAddr.address && nodeAddress.port === knownNodeAddr.port
      }) === -1;
    });

    if (this.nodeType === 'serviceNode') {
      try {
        await this.join(this.id);
      } catch (errorNotSurprised) {
        logger.start(errorNotSurprised);
      }
    }

    this.started = true;
  }

  receiveAddrConn(ws) {
    this.handleReceivedAddrConn(ws);
  }

  async join(roomName, makePrimary = false) {
    if (roomName.length < 3) throw new Error('room name have to be more than 3 characters');

    await this.ensureNotAlone();

    const roomNameHash = BufferUtils.toString(
      await hash(BufferUtils.fromString(roomName)),
      'base64',
    );

    if (makePrimary || !this.primaryRoomNameHash) {
      this.primaryRoomNameHash = roomNameHash;
      this.initKBucket();
    }

    const joinedRoom = this.getJoinedRoom(roomNameHash);
    if (joinedRoom) return joinedRoom;

    // create room locally
    const room = this.setRoom(roomNameHash, true, {
      name: roomName,
    });

    // announce that we have a new room without waiting async completion
    this.pingAllPeers();

    const findResPacket = await this.findRoom(roomNameHash);
    if (!findResPacket) return room;

    const routeToRoom = findResPacket.route.reverse();

    logger.join(`join: find room got response, route: [${findResPacket.route.join(' - ')}]`);

    if (!findResPacket.found) {
      this.logIfStarted('join', `room '${roomName}' not found, this node is the only member (might need to retry a couple of times), start connecting to nearest node...`);
      const nearestNode = last(routeToRoom);
      await this.connectPeerOnNetwork(routeToRoom);
      logger.join(`nearest node '${nearestNode}' connected!`);
      return room;
    }

    logger.join(`room '${roomName}' found`);
    const firstRoomMember = last(routeToRoom);
    this.setRoomMembers(room, [firstRoomMember], 'pending');
    let pendingMembersAfterFirst = await this.connectJoinAndRefreshMembers(routeToRoom, room);
    logger.join(`first room member '${firstRoomMember}' connected & joined! connect & join more members to achieve full-connected of room`);

    let joinIterCnt = 0;
    let pendingMembers = new Map(
      pendingMembersAfterFirst.map(member => ([member, firstRoomMember]))
    );

    while (pendingMembers.size > 0) {
      joinIterCnt++;
      logger.join(`[round #${joinIterCnt}] knowing pending members: [${[...pendingMembers.keys()].join(', ')}]`, { pendingMembers });

      const nextPendingMembers = await Promise.all([...pendingMembers.entries()].map(async ([member, viaMember]) => {
        const routeToMember = [this.id, viaMember, member];
        const newPendingMembers = await this.connectJoinAndRefreshMembers(routeToMember, room);
        return newPendingMembers.map(newMember => ([member, newMember]));
      }));
      pendingMembers = new Map(nextPendingMembers.flat());
    }

    const members = this.getRoomMembers(room);
    logger.join(`room is full-connected in ${joinIterCnt} rounds, members: [${members.join(', ')}]`);

    return room;
  }

  async getRoom(roomName) {
    const roomNameHash = BufferUtils.toString(
      await hash(BufferUtils.fromString(roomName)),
      'base64',
    );
    return this.getJoinedRoom(roomNameHash);
  }

  async broadcast(roomName, message, recipients = []) {
    const roomNameHash = BufferUtils.toString(
      await hash(BufferUtils.fromString(roomName)),
      'base64',
    );
    const room = this.getJoinedRoom(roomNameHash);
    if (!room) throw new Error(`room '${roomName}' not joined`);

    const roomMessagePacket = this.createPacket({
      type: 'roomMessage',
      roomNameHash,
      author: this.id,
      message,
      recipients,
    });

    this.spreadOutRoomMessage(room, roomMessagePacket);
  }

  async leave(roomName) {
    const roomNameHash = BufferUtils.toString(
      await hash(BufferUtils.fromString(roomName)),
      'base64',
    );
    const room = this.getJoinedRoom(roomNameHash);
    if (!room) throw new Error(`room '${roomName}' not joined`);
    if (roomNameHash === this.primaryRoomNameHash) {
      throw new Error(`room '${roomName}' is primary, please switch primary before leaving this room`);
    }

    // synchronously self state mutation:
    this.leaveJoinedRoom(room);

    // announcement
    await this.pingAllPeers();
  }

  // =================

  ensureNotAlone() {
    if (this.peers.size > 0) return;

    return Promise.all(
      shuffle(this.knownServiceAddrs).slice(-3).map(async addr => {
        try {
          await this.connectAddr([addr]);
        } catch (error) {
          console.warn(`start: error whil connectAddr to '${addr}'`, error);
        }
      })
    );
  }

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

  /**
   * Emitted every time a contact is added that would exceed the capacity of a don't split k-bucket it belongs to.
   */
  kBucketPing(oldContacts, newContact) {
    logger.kBucket('kBucketPing:', oldContacts, newContact);

    const sortedContacts = [...oldContacts, newContact].map(contact => (
      [contact, this.rooms.get(contact.roomNameHash)])
    ).map(([contact, room]) => (
      [contact, room, [...room.members.keys()].some(peerId => this.peers.get(peerId).nodeType === 'serviceNode')]
    )).sort(([contactA, roomA, hasServiceNodeA], [contactB, roomB, hasServiceNodeB]) => {
      if (roomA.joined && !roomB.joined) return -1;
      if (!roomA.joined && roomB.joined) return 1;
      if (hasServiceNodeA && !hasServiceNodeB) return -1;
      if (!hasServiceNodeA && hasServiceNodeB) return 1;
      return contactA.vectorClock - contactB.vectorClock;
    });

    logger.kBucket('kBucketPing: sortedContacts:', sortedContacts);

    const [lastContact, lastRoom] = sortedContacts.slice(-1)[0];
    sortedContacts.slice(0, -1).forEach(([_contact, room]) => {
      room.outOfKBucket = false;
    });

    logger.kBucket(`kBucketPing: last room (roomNameHash: ${lastRoom.roomNameHash}) will not be in kBucket and marked as outOfKBucket`);

    lastRoom.outOfKBucket = true;
    if (lastRoom.roomNameHash !== newContact.roomNameHash) {
      this.kBucket.remove(lastContact.id);
      this.kBucket.add(newContact);
    }


    // TODO: disconnect oldContacts
  }

  getConnectedPeer(peerId, inState = ['connected']) {
    const peer = this.peers.get(peerId);
    if (peer && inState.indexOf(peer.state) !== -1) return peer;
    return null;
  }

  /**
   * caller HAVE to make sure the peer is pending state
   * otherwise this promise may never be resolved!
   */
  pendingPeerToComplete(peer) {
    return new Promise((resolve, reject) => {
      peer.connectedResolves.push(resolve);
      peer.closingAndRejects.push(reject);
    });
  }

  /**
   * @param {string} peerId
   * @param {{ addrs?: [], roomNameHashes?: [], connectedResolves?: (Peer) => void, ws?: WebSocket, rtc?: Rtc, setConnected?: boolean }} payload
   */
  setPeer(peerId, payload) {
    let peer = this.peers.get(peerId);
    if (!peer) {
      peer = {
        peerId,
        state: 'pending',
        addrs: [],
        nodeType: 'clientNode',
        roomNameHashes: [],
        connectedResolves: [],
        closingAndRejects: [],
      };
      this.peers.set(peerId, peer);
    }

    if (payload.addrs) {
      peer.addrs = payload.addrs;
      peer.nodeType = peer.addrs.length > 0 ? 'serviceNode' : 'clientNode';
    }
    if (payload.roomNameHashes) {
      peer.roomNameHashes.forEach(roomNameHash => {
        if (payload.roomNameHashes.indexOf(roomNameHash) === -1) {
          this.rmRoomMember(this.rooms.get(roomNameHash), peerId);
        }
      });
      peer.roomNameHashes = payload.roomNameHashes;
      peer.roomNameHashes.forEach(roomNameHash => {
        this.setRoom(roomNameHash, false, {
          members: [peerId],
        });
      });
    }
    if (payload.connectedResolves) {
      peer.connectedResolves.push(...payload.connectedResolves);
    }
    if (payload.ws) {
      if (peer.ws) peer.ws.close();
      peer.ws = payload.ws;
    }
    if (payload.rtc) {
      if (peer.rtc && peer.rtc.simplePeer) peer.rtc.simplePeer.destroy();
      peer.rtc = payload.rtc;
    }
    if (payload.setConnected) {
      peer.state = 'connected';
    }
    if (peer.state === 'connected') {
      peer.connectedResolves.forEach(r => r(peer));
      peer.connectedResolves = [];

      this.loopPeerRoutine(peer);
    }

    return peer;
  }

  /**
   * notice: rtc/addr conn will not be closed here
   */
  setPeerClosing(peerId) {
    const peer = this.getConnectedPeer(peerId);
    peer.state = 'closing';
    logger.closePeer(`peer '${peerId}' set to closing!`);

    for (const room of this.rooms.values()) {
      this.rmRoomMember(room, peerId);
    }
  }

  getJoinedRoom(roomNameHash) {
    const room = this.rooms.get(roomNameHash);
    if (room && room.joined) return room;
    return null;
  }

  addRoomToKBucket(room) {
    if (
      this.getRoomMembers(room).length <= 0 ||
      room.roomNameHash === this.primaryRoomNameHash
    ) return;

    this.kBucket.add({
      id: BufferUtils.fromString(room.roomNameHash, 'base64'),
      roomNameHash: room.roomNameHash,
      vectorClock: Date.now(),
    });
  }

  setRoom(roomNameHash, toJoin, payload) {
    // payload: { name?: roomName, members?: PeerId[] }
    // to remove room or peer in room, implement another function

    let room = this.rooms.get(roomNameHash);
    if (!room) {
      room = {
        roomNameHash,
        joined: false,
        members: new Map(),
      }
      this.rooms.set(roomNameHash, room);
    }

    room.name = room.name || payload.name;
    if (toJoin) {
      if (!room.name) throw new Error('setRoom: joined room but no room.name', { room });
      room.joined = true;
    }

    if (payload.members) {
      this.setRoomMembers(room, payload.members);
    }
    this.addRoomToKBucket(room); // will not be added to kBucket if no member

    return room;
  }

  getRoomMembers(room, inStates = CONNECTED_ROOM_MEMBER_STATES) {
    return [...room.members.entries()].filter(
      ([_peerId, state]) => inStates.indexOf(state) >= 0
    ).map(
      ([peerId]) => peerId
    );
  }

  /**
   * state machine: see SET_ROOM_MEMBER_STATE_MACHINE
   */
  setRoomMembers(room, members, state = 'connected') {
    if (!room.joined && state === 'joined') {
      throw new Error(`setRoomMembers: this node does not join to room '${room.roomNameHash}', but is setting member to joined (${members.join(', ')})`, { room });
    }

    const joinedPeers = [];

    members.map(peerId => ([
      room.members.get(peerId) || 'none', peerId,
    ])).filter(([oriState, peerId]) => (
      (SET_ROOM_MEMBER_STATE_MACHINE[oriState] || []).indexOf(state) !== -1 &&
      peerId !== this.id
    )).forEach(([oriState, peerId]) => {
      room.members.set(peerId, state);

      if (oriState !== 'joined' && state === 'joined') {
        joinedPeers.push(peerId);
      }
    });

    joinedPeers.forEach(peerId => {
      this.emit('new-member', {
        memberPeer: this.peers.get(peerId),
        room,
      });
    });
  }

  rmRoomMember(room, member) {
    if (!room.members.has(member)) return;
    const peer = this.peers.get(member);
    const roomMemberState = room.members.get(member);

    room.members.delete(member);
    this.cleanEmptyRoom(room);

    if (room.joined && roomMemberState === 'joined') {
      this.emit('member-left', { memberPeer: peer, room });
    }
  }
  leaveJoinedRoom(room) {
    this.setRoomMembers(
      room,
      this.getRoomMembers(room, ['connected', 'joined']),
      'left-connected',
    );

    room.joined = false;
    delete room.name;
    this.cleanEmptyRoom(room);
  }

  cleanEmptyRoom(room) {
    let reportMessage = `cleanEmptyRoom: room '${room.roomNameHash}${room.name ? ` (${room.name})` : ''}'`;
    if (this.getRoomMembers(room).length <= 0) {
      reportMessage += ' has no connected peers!';

      this.kBucket.remove(
        BufferUtils.fromString(room.roomNameHash, 'base64'),
      );
      reportMessage += ' room is removed from kBucket';

      if (room.members.size === 0 && !room.joined) {
        this.rooms.delete(room.roomNameHash);
        reportMessage += ' and this.rooms (because room is not joined and empty)';
      }
    } else {
      reportMessage += ' has connected peers...leaving as it is';
    }
    logger.leave(reportMessage);
  }

  addIceServers(iceServers) {
    if (!Array.isArray(iceServers)) return;
    const existingUrls = this.iceServers.flatMap(
      ({ urls }) => Array.isArray(urls) ? urls : [urls]
    );
    const newIceServers = iceServers.map(({ urls, ...rest }) => ({
      ...rest,
      urls: Array.isArray(urls) ? urls : [urls]
    })).filter(({ urls }) => (
      urls.every(
        url => url && existingUrls.indexOf(url) === -1
      )
    ))
    this.iceServers.push(...newIceServers);
  }

  connectPeerPromise(peerId) {
    const existingPeer = this.peers.get(peerId);
    if (existingPeer) {
      switch (existingPeer.state) {
        case 'pending':
          return [existingPeer, this.pendingPeerToComplete(existingPeer)];
        case 'connected':
          return [existingPeer, true];
        case 'closing':
          throw new Error(`connectPeerPromise: try to connect to a closing peer '${existingPeer.peerId}'`);
      }
    }
    const peer = this.setPeer(peerId, {});
    return [
      peer,
      this.pendingPeerToComplete(peer),
    ];
  }

  async connectAddr(addrs) {
    const addr = sample(addrs);
    const mAddr = multiaddr(addr);
    const peerId = mAddr.getPeerId();

    const [peer, promise] = this.connectPeerPromise(peerId);
    if (promise === true) return true;

    logger.addrConn(`connectAddr: to '${peerId}' via '${addr}'`);
    const ws = new WebSocket(multiaddrToUrl(mAddr));
    ws.onopen = () => {
      logger.addrConn(`connectAddr: ws between '${peerId}' is connected via '${addr}'`);
      this.setPeer(peerId, {
        addrs, ws
      });
      this.ping(peerId);
    }
    ws.onmessage = event => {
      this.handleWsRtcPacket(peer, event.data);
    }
    ws.onclose = () => {
      logger.addrConn(`connectAddr: ws between '${peerId}' is closed (${addr})`);
      this.disconnectAndRmPeer(peerId);
    }
    ws.onerror = event => {
      console.warn('connectAddr: onerror', event);
      this.disconnectAndRmPeer(peerId);
    }

    return promise;
  }

  async handleReceivedAddrConn(ws) {
    logger.addrConn(`handleReceivedAddrConn: receive ws:`, { ws });

    const disconnectTimeout = setTimeout(() => {
      console.warn(`handleReceivedAddrConn: timeout after ${RECEIVE_ADDR_CONN_TIMEOUT}ms! closing...`, { ws });
      ws.close();
    }, RECEIVE_ADDR_CONN_TIMEOUT);
    let peer = {
      pending: {
        ws,
        connectedResolves: [
          completePeer => {
            logger.addrConn(`handleReceivedAddrConn: connectedResolves being called`, { completePeer });
            clearTimeout(disconnectTimeout);
            peer = completePeer;
          },
        ]
      }
    };
    ws.onmessage = event => {
      this.handleWsRtcPacket(peer, event.data);
    };
    ws.onclose = () => {
      logger.addrConn(`handleReceivedAddrConn: ws between '${peer.peerId}' is closed`);
      this.disconnectAndRmPeer(peer.peerId);
    }
    ws.onerror = event => {
      console.warn('handleReceivedAddrConn: onerror', event);
      this.disconnectAndRmPeer(peer.peerId);
    }
  }

  async connectRtc(route, ephemeral, peerEphemeralKey, initiator) {
    const sharedKey = await ephemeral.genSharedKey(BufferUtils.fromString(peerEphemeralKey, 'base64'));
    const keyStretched = await crypto.keys.keyStretcher(EPHEMERAL_STRETCHER_CIPHER_TYPE, EPHEMERAL_STRETCHER_HASH_TYPE, sharedKey);
    const cipherK1 = await crypto.aes.create(keyStretched.k1.cipherKey, keyStretched.k1.iv);
    const cipherK2 = await crypto.aes.create(keyStretched.k2.cipherKey, keyStretched.k2.iv);

    const encrypter = initiator ? cipherK1 : cipherK2;
    const decrypter = initiator ? cipherK2 : cipherK1;

    const peerId = last(route);
    const simplePeer = new SimplePeer({
      initiator,
      config: {
        iceServers: this.iceServers,
      },
    });
    const peer = this.setPeer(peerId, {
      rtc: {
        simplePeer,
        ephemeral, encrypter, decrypter,
        chunksReceived: [],
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
        ), 'base64',
      );

      const connectSignalPacket = this.createNetworkPacket(route, {
        type: 'connectSignal',
        encryptedSignal,
      });
      this.sendNetworkPacket(connectSignalPacket);
    });
    simplePeer.on('connect', () => {
      logger.webrtcConn(`connectRtc: rtc between '${peerId}' is connected`);

      if (initiator) this.ping(peerId);
    });

    simplePeer.on('data', chunk => {
      if (isEOF(chunk) && peer.rtc.chunksReceived.length > 0) {
        const data = BufferUtils.toString(BufferUtils.concat(peer.rtc.chunksReceived));
        peer.rtc.chunksReceived.splice(0, peer.rtc.chunksReceived.length);
        this.handleWsRtcPacket(peer, data);
      } else {
        peer.rtc.chunksReceived.push(chunk);
      }
    });

    simplePeer.on('close', () => {
      logger.webrtcConn(`connectRtc: rtc between '${peerId}' is closed`);
      this.disconnectAndRmPeer(peerId);
    })
    simplePeer.on('error', error => {
      console.warn(`connectRtc: rtc between '${peerId}' has error`, error);
      this.disconnectAndRmPeer(peerId);
    })

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

  handleWsRtcPacket(peer, data) {
    let packet;
    try {
      packet = JSON.parse(data);
    } catch (error) {
      return console.warn(`handleWsRtcPacket: not valid json from ${peer.peerId}: ${data}`, error);
    }

    this.handlePacket(peer.peerId, packet, peer);
  }

  handlePacket(from, packet, peer) {
    if (packet.protocol !== PROTOCOL) {
      return console.warn(`handlePacket: unexpected protocol '${packet.protocol}', currently using '${PROTOCOL}'`);
    }
    const logMessage = `handlePacket: receive ${briefPacket(packet, 'from', from)}`;
    logger.packetReceived(logMessage);
    logger.packetContentReceived(logMessage, packet);

    switch(packet.type) {
      case 'ping':
        return this.handlePingPacket(from, packet, peer);
      case 'pong':
        return this.handleResponsePacket(from, packet, peer);
      case 'find':
        return this.handleFindPacket(from, packet, peer);
      case 'findRes':
        return this.handleNetworkPacket(from, packet, peer) || this.handleResponsePacket(from, packet, peer);
      case 'connect':
        return this.handleNetworkPacket(from, packet, peer) || this.handleConnectPacket(from, packet, peer);
      case 'connectRes':
        return this.handleNetworkPacket(from, packet, peer) || this.handleResponsePacket(from, packet, peer);
      case 'connectSignal':
        return this.handleNetworkPacket(from, packet, peer) || this.handleConnectSignalPacket(from, packet, peer);
      case 'join':
        return this.handleJoinPacket(from, packet, peer);
      case 'joinRes':
        return this.handleResponsePacket(from, packet, peer);
      case 'roomMessage':
        return this.handleRoomMessagePacket(from, packet, peer);
    }
  }

  handleNetworkPacket(_from, packet) {
    if (
      packet.route.length === (packet.hop + 1) &&
      packet.route[packet.hop] === this.id
    ) {
      return false;
    }

    this.sendNetworkPacket(packet);
    return true;
  }

  /**
   * @param {PeerId | undefined} from - peerId or undefined (new ws connection)
   * @param {PingPacket} packet
   * @param {Peer} receivedPeer
   */
  handlePingPacket(from, packet, receivedPeer) {
    // TODO: check if peer is closing, and await for closing completes
    if (this.processedPackets.has(packet.packetId)) return true;
    this.hasProcessedPacket(packet);

    const peer = this.gotPingPongPayload(from || packet.id, packet, receivedPeer.pending);
    const pongPacket = this.createPacket({
      type: 'pong',
      ...this.pingPongPayload(),
    });
    this.respond(packet, pongPacket);
    this.sendPacket(peer, pongPacket);

    return true;
  }

  handleFindPacket(_from, packet) {
    if (this.getJoinedRoom(packet.targetHash)) {
      const foundPacket = this.createNetworkPacket(
        [...packet.fromPath, this.id].reverse(),
        {
          type: 'findRes',
          found: true,
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
    this.setPeer(peerId, {});

    this.acceptConnectionFromNetwork(packet);
    return true;
  }

  handleConnectSignalPacket(_from, packet) {
    this.rtcReceivedSignal(packet.route[0], packet.encryptedSignal);
    return true;
  }

  handleJoinPacket(from, packet) {
    const room = this.getJoinedRoom(packet.roomNameHash);
    const peer = this.getConnectedPeer(from, ['pending', 'connected']);

    if (!peer) throw new Error(`handleJoinPacket: peer '${from}' attempt to join without connection (and this should never happen)`);
    if (!room || room.name !== packet.roomName) {
      const joinResPacket = this.createPacket({
        type: 'joinRes',
        ok: false,
      });
      this.respond(packet, joinResPacket);
      this.sendPacket(peer, joinResPacket);
      return true;
    }
    this.acceptToJoin(peer, room, packet); // async

    return true;
  }

  handleRoomMessagePacket(from, packet) {
    const room = this.getJoinedRoom(packet.roomNameHash);
    if (!room) throw new Error(`handleRoomMessagePacket: room not found using nameHash: ${packet.roomNameHash}`);
    if (room.members.get(from) !== 'joined') throw new Error(`handleRoomMessagePacket: peer '${from}' attempt to send room message without join`);
    if (packet.author === this.id) return;
    if (room.members.get(packet.author) !== 'joined') throw new Error(`handleRoomMessagePacket: peer (author) '${from}' attempt to send room message without join`);
    if (this.processedPackets.has(packet.packetId)) return true;
    
    if (
      packet.recipients.length <= 0 ||
      packet.recipients.indexOf(this.id) >= 0
    ) {
      this.emit('room-message', {
        room,
        fromMember: this.peers.get(packet.author),
        message: packet.message,
      });
    }

    this.spreadOutRoomMessage(room, packet, from);
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
    const logMessage = `sendPacket: send ${briefPacket(packet, 'to', peer.peerId)}`;
    logger.packetSend(logMessage);
    logger.packetContentSend(logMessage, packet);

    if ([this.nodeType, peer.nodeType].indexOf('serviceNode') !== -1) {
      peer.ws.send(JSON.stringify(packet));
    } else if (peer.rtc) {
      packetToChunks(packet).forEach(chunk => {
        peer.rtc.simplePeer.write(chunk);
      });
    } else {
      throw new Error('sendPacket: peer is not serviceNode nor connected via rtc');
    }
  }

  async sendNetworkPacket(packet) {
    if (packet.route[packet.hop] !== this.id) {
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
      id: this.id,
      addrs: this.addrs,
      roomNameHashes: [...this.rooms.keys()].filter(roomNameHash => this.getJoinedRoom(roomNameHash)),
      providing: this.config.providing,
    }
  }
  gotPingPongPayload(peerId, packet, peerPending = {}) {
    const peer = this.setPeer(peerId, {
      ...packet, ...peerPending, setConnected: true,
    });
    peer.addrs.forEach(addr => {
      if (this.knownServiceAddrs.indexOf(addr) === -1) {
        this.emit('new-known-service-addr', { addr });
        this.knownServiceAddrs.push(addr);
      }
    });
    if (peer.nodeType === 'serviceNode' && packet.providing) {
      this.addIceServers(packet.providing.iceServers);
    }

    return peer;
  }

  async ping(peerId) {
    const peer = this.peers.get(peerId);
    const packet = this.createPacket({
      type: 'ping',
      ...this.pingPongPayload(),
    });
    let counter = 1;
    let pongPacket;

    while (counter < 10 && !pongPacket) {
      try {
        const pingRequest = this.request(packet, 500);
        logger.addrConn(`ping: [#${counter}] ping peer '${peerId}'`);
        this.sendPacket(peer, packet);
        counter++;
        pongPacket = await pingRequest;
      } catch (error) {
        if (!error.message.match(/timeout/)) throw error;
      }
    }
    if (!pongPacket) throw new Error(`ping: did not get pong from peer '${peerId}'`)
    this.gotPingPongPayload(peerId, pongPacket);
  }

  async pingAllPeers() {
    return Promise.all(
      [...this.peers.keys()].filter(peerId => (
        this.getConnectedPeer(peerId)
      )).map(async peerId => {
        try {
          await this.ping(peerId);
        } catch (err) {
          console.warn(`pingAllPeers: ping member '${peerId}' failed:`, err);
        }
      }),
    );
  }

  async findRoom(roomNameHash) {
    const packet = this.createPacket({
      type: 'find',
      targetHash: roomNameHash,
      fromPath: [],
      lastDistance: Infinity, // Infinity cannot be encode in JSON, but it should and will be updated in routeAndSendFindPacket
    });

    const findRequest = this.request(packet);
    this.routeAndSendFindPacket(packet);
    return await findRequest;
  }

  async connectJoinAndRefreshMembers(route, room) {
    const roomMember = last(route);
    try {
      logger.join(`connectJoinAndRefreshMembers: connect to room member '${roomMember}'... (route: ${route.join(' -> ')}`);
      const peer = await this.connectPeerOnNetwork(route);
      logger.join(`connectJoinAndRefreshMembers: '${roomMember}' connected! start to join...`);

      const packet = this.createPacket({
        type: 'join',
        roomNameHash: room.roomNameHash,
        roomName: room.name,
      });
      const joinRequest = this.request(packet);
      this.sendPacket(peer, packet);
      const joinResPacket = await joinRequest;
      if (!joinResPacket.ok) {
        throw new Error(`connectJoinAndRefreshMembers: peer '${peer.peerId}' rejected join packet`, { joinResPacket });
      }

      this.setRoomMembers(room, [peer.peerId], 'joined');
      this.setRoomMembers(room, joinResPacket.members, 'pending');

      return joinResPacket.members.filter(member => room.members.get(member) === 'pending');
    } catch (error) {
      console.warn(`connectJoinAndRefreshMembers: error to '${roomMember}' of '${room.name}'`, error);
      this.setRoomMembers(room, [roomMember], 'failed');
      return [];
    }

  }

  async acceptToJoin(peer, room, joinPacket) {
    if (peer.state === 'pending') {
      await this.pendingPeerToComplete(peer);
    }

    this.setRoomMembers(room, [peer.peerId], 'joined');

    const joinResPacket = this.createPacket({
      type: 'joinRes',
      ok: true,
      members: this.getRoomMembers(room, ['joined']),
    });
    this.respond(joinPacket, joinResPacket);
    this.sendPacket(peer, joinResPacket);
  }

  async connectPeerOnNetwork(route) {
    const peerId = last(route);
    const [peer, promise] = this.connectPeerPromise(peerId);
    if (promise === true) return peer;

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
        break; // simply wait for peer to connectAddr and receive ping, setPeer to call connectedResolves as connection completion
      case 'webrtc':
        this.connectRtc(route, ephemeral, connectResPacket.ephemeralKey, true);
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

    await this.connectRtc(routeToPeer, ephemeral, connectPacket.ephemeralKey, false);
    // initiator will start sending signal immediately,
    //   at this moment the other peer does not know we are going to use webrtc (because connectRes has not been sent)
    //   to prevent connectRes packet arrive after connectSignal, let the other peer be the initiator.

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
    // routeAndSendFindPacket should not be used when the node itself is in the target room, which should be handled by caller and not invoking this method

    const targetHashBuffer = BufferUtils.fromString(packet.targetHash, 'base64');

    const contact = this.kBucket.closest(targetHashBuffer, 1)[0] || {};
    const room = this.rooms.get(contact.roomNameHash);

    if (!room) {
      return this.routeFindPacketFailed(packet, 'routeAndSendFindPacket: no room in kBucket');
    }

    const distance = KBucket.distance(contact.id, targetHashBuffer);
    if (distance > packet.lastDistance) {
      return this.routeFindPacketFailed(packet, `routeAndSendFindPacket: cannot find smaller distance between target (smallest distance here: ${distance}, last distance: ${packet.lastDistance}`);
    }

    const peerId = sample(
      this.getRoomMembers(room).filter(
        id => packet.fromPath.indexOf(id) === -1
      )
    );

    if (!peerId) {
      return this.routeFindPacketFailed(packet, 'routeAndSendFindPacket: no peer in room available');
    }
    const peer = this.getConnectedPeer(peerId);

    packet.fromPath.push(this.id);
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
      [...packet.fromPath, this.id].reverse(),
      {
        type: 'findRes',
        found: false,
      },
    );

    this.respond(packet, notFoundPacket);
    this.sendNetworkPacket(notFoundPacket);
  }
  
  loopPeerRoutine(peer) {
    if (peer.routineTimer) return;
    if (peer.routineTimer === undefined) {
      logger.routine(`routine loop for '${peer.peerId}' starting with interval: ${KEEP_ALIVE_PING_INTERVAL}ms`);
    }
    peer.routineTimer = setTimeout(async () => {
      const keepNext = await this.peerRoutine(peer);
      if (keepNext) {
        peer.routineTimer = null;
        this.loopPeerRoutine(peer);
      } else {
        delete peer.routineTimer;
      }
    }, KEEP_ALIVE_PING_INTERVAL);
  }

  async peerRoutine(peer) {
    const startedAt = Date.now();
    if (peer.state !== 'connected') {
      logger.routine(`peerRoutine: peer.state = ${peer.state}, stop pinging '${peer.peerId}] at ${new Date(startedAt)}`);
      return false;
    }

    logger.routine(`peerRoutine: for '${peer.peerId}' at ${new Date(startedAt)}`);

    const connectedNotJoinedRoomMaxMembers = this.nodeType === 'serviceNode' ? CONNECTED_NOT_JOINED_ROOM_MAX_MEMBERS_SERVICE_NODE : CONNECTED_NOT_JOINED_ROOM_MAX_MEMBERS_CLIENT_NODE;

    const relatedRooms = peer.roomNameHashes.map(roomNameHash => {
      const room = this.rooms.get(roomNameHash);
      const { joined, outOfKBucket } = room;
      const connectedMembersLength = this.getRoomMembers(room).length;
      return { roomNameHash, joined, outOfKBucket, connectedMembersLength };
    });
    const keepAlive = relatedRooms.some(({ joined, outOfKBucket, connectedMembersLength }) => {
      if (joined) return true;
      if (outOfKBucket) return false;
      return connectedMembersLength <= connectedNotJoinedRoomMaxMembers;
    });

    if (
      keepAlive ||
      this.nodeType === 'serviceNode' // for now for stability
    ) {
      logger.routine(`peerRoutine: should keepAlive, start pinging '${peer.peerId}' at ${new Date(startedAt)}`);
      try {
        await this.ping(peer.peerId);
        peer.ping = Date.now() - startedAt;
        logger.routine(`done pinging '${peer.peerId}', ping: ${peer.ping}ms`);
        return true;
      } catch (error) {
        console.warn(`peerRoutine: error while pinging '${peer.peerId}', disconnecting...`, error);
        await this.disconnectAndRmPeer(peer.peerId);
        return false;
      }
    } else {
      logger.routine(`peerRoutine: should not keepAlive, relatedRooms: ${JSON.stringify(relatedRooms)} and connectedNotJoinedRoomMaxMembers: ${connectedNotJoinedRoomMaxMembers}, start disconnecting '${peer.peerId}' at ${new Date(startedAt)}`);
      await this.disconnectAndRmPeer(peer.peerId);
      return false;
    }
  }

  async disconnectAndRmPeer(peerId) {
    const peer = this.getConnectedPeer(peerId);
    if (!peer) return;

    this.setPeerClosing(peerId);

    if (peer.rtc) {
      const rtcDestroyResult = peer.rtc.simplePeer.destroy();
      logger.closePeer(`disconnectAndRmPeer: peer '${peerId}' rtc destroyed`, rtcDestroyResult);
    }
    if (peer.ws) {
      peer.ws.close();
      logger.closePeer(`disconnectAndRmPeer: peer '${peerId}' ws closed`);
    }

    this.peers.delete(peerId);
    logger.closePeer(`disconnectAndRmPeer: peer '${peerId}' deleted`);

    peer.closingAndRejects.forEach(reject => reject(peer));
  }

  hasProcessedPacket(packet) {
    const deleteRecord = () => {
      this.processedPackets.delete(packet.packetId);
    };
    const timer = setTimeout(deleteRecord, PACKET_ID_CLEAR_TIMEOUT);
    this.processedPackets.set(packet.packetId, () => {
      deleteRecord();
      clearTimeout(timer);
    });
  }

  spreadOutRoomMessage(room, packet, from = '') {
    this.hasProcessedPacket(packet);

    const members = this.getRoomMembers(room, ['joined']);
    const leftRecipients = packet.recipients.filter(
      recipientPeerId => members.indexOf(recipientPeerId) === -1 && recipientPeerId !== this.id
    );
    const recipientsOnly = packet.recipients.length > 0 && leftRecipients.length <= 0;

    members.filter(peerId => {
      if (recipientsOnly) {
        if (packet.recipients.indexOf(peerId) === -1) return false;
      }
      return peerId !== from;
    }).forEach(peerId => {
      this.sendPacket(
        this.getConnectedPeer(peerId),
        packet,
      );
    });
  }

  logIfStarted(ns, ...message) {
    if (this.started) {
      logger[ns](...message);
    }
  }
}

export default UnamedNetwork;

const SET_ROOM_MEMBER_STATE_MACHINE = {
  none: ['pending', 'connected', 'joined'],
  pending: ['connected', 'joined', 'failed'],
  connected: ['joined', 'failed', 'left-connected'],
  joined: ['left-connected'],
}
const CONNECTED_ROOM_MEMBER_STATES = ['connected', 'joined', 'left-connected'];

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
function briefPacket(packet, direction, peerId) {
  return `'${packet.type}'` +
    (packet.route ? ` [${packet.route[0]} -> ${last(packet.route)}]` : '') +
    (packet.reqId ? ` (reqId: ${packet.reqId})` : '') +
    ` ${direction} linked peer '${peerId}'`;
}
function isEOF(chunk) {
  return chunk.length === 1 && chunk[0] === 0;
}
function packetToChunks(packet) {
  const data = BufferUtils.fromString(JSON.stringify(packet));
  const chunks = Array(Math.ceil(data.length / WEBRTC_DATA_CHUNK_SIZE)).fill(null).map((_, i) => {
    const length = (i + 1) * WEBRTC_DATA_CHUNK_SIZE > data.length ? data.length - i * WEBRTC_DATA_CHUNK_SIZE : WEBRTC_DATA_CHUNK_SIZE;
    return new Uint8Array(data.buffer, i * WEBRTC_DATA_CHUNK_SIZE, length);
  });

  return [...chunks, EOF];
}
