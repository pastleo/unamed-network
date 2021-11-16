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
    name?: string;
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

  interface Packet {
    type: string;
    protocol: string;
    packetId: string;
    reqId?: string;
  }

  interface PingPacket extends Packet {
    type: 'ping';
    nodeType: NodeType;
    roomNameHashes: RoomNameHash[];
  }
  interface PongPacket extends Packet {
    type: 'pong';
    nodeType: NodeType;
    roomNameHashes: RoomNameHash[];
  }

  interface InternetPacket extends Packet {
    targetHash: string;
    fromPath: PeerId[];
  }

  interface JoinPacket extends InternetPacket {
    type: 'join';
    roomName: string;
  }

  // ==========

  class SimplePeer {
  }
}

