import { EventEmitter } from 'events';
import { IPFS } from 'ipfs-core';
import KBucket from 'k-bucket';

declare module 'unamed-network' {
  type RoomNameHash = string;
  type RoomNameHashBuffer = Uint8Array;
  type PeerId = string;
  type NodeType = 'serviceNode' | 'clientNode';

  interface Room {
    id: RoomNameHashBuffer;
    roomNameHash: RoomNameHash;
    vectorClock: number; // for KBucket.Contact
    name?: string; // not hashed, only room member knows
    peers: Set<PeerId>;
  }
  interface Peer {
    peerId: PeerId;
    nodeType: NodeType;
    roomNameHashes: Set<RoomNameHash>;
    rtcPeer?: SimplePeer;
  }

  export default class UnamedNetwork extends EventEmitter {
    nodeType: NodeType;
    ipfs: IPFS;
    kBucket: KBucket<Room>; // known rooms, rooms without other peers should not be added this bucket
    rooms: Map<RoomNameHash, Room>; // joined
    peers: Map<PeerId, Peer>; // connected
  }

  // Packets
  // ==========

  interface Packet { // abstract
    type: string;
    protocol: string;
    packetId: string;
  }
  interface Request { // abstract
    reqId: string;
  }
  interface Response { // abstract
    reqId: string;
  }

  interface PingPacket extends Packet, Request {
    type: 'ping';
    nodeType: NodeType;
    roomNameHashes: RoomNameHash[];
  }
  interface PongPacket extends Packet, Response {
    type: 'pong';
    nodeType: NodeType;
    roomNameHashes: RoomNameHash[];
  }

  interface FindPacket extends Packet, Request {
    type: 'find';
    targetHash: string;
    fromPath: PeerId[];
    lastDistance: number;

    roomName: string; // development
  }

  interface InternetPacket extends Packet { // abstract
    route: PeerId[]; // include sender
    hop: number; // index in toPath
  }

  interface InternetNoPeerPacket extends InternetPacket {
    type: 'noPeer';
    oriPacketId: string;
  }

  interface FindResPacket extends InternetPacket, Response {
    type: 'findRes';
    found: boolean;

    roomName: string; // development
  }

  interface ConnectPacket extends InternetPacket, Request {
    type: 'connect';
  }
  interface ConnectResPacket extends InternetPacket, Response {
    type: 'connectRes';
    accept: boolean;
    method?: 'addr' | 'webrtc';
    addr?: string;
  }
  interface ConnectSignalPacket extends InternetPacket {
    type: 'connectSignal';
    data?: any;
  }

  interface JoinPacket extends Packet, Request {
    type: 'join';
    roomName: string; // not hashed
  }
  interface JoinResPacket extends Packet, Response {
    type: 'joinRes';
    peers: PeerId[];
  }

  // ==========

  class SimplePeer {
  }
}

