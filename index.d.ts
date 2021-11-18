import { EventEmitter } from 'tsee';
import { IPFS } from 'ipfs-core';
import KBucket from 'k-bucket';
import crypto from 'libp2p-crypto';

declare module 'unamed-network' {
  type RoomNameHash = string;
  type RoomNameHashBuffer = Uint8Array;
  type PeerId = string;
  type MultiAddr = string;
  type ReqId = string;
  type NodeType = 'serviceNode' | 'clientNode';

  interface Room {
    roomNameHash: RoomNameHash;
    joined: boolean;
    name?: string; // not hashed, only room member knows
    peers: Set<PeerId>;
  }
  interface Peer {
    peerId: PeerId;
    state: 'pending' | 'connected';
    addrs: MultiAddr[];
    nodeType: NodeType;
    roomNameHashes: RoomNameHash[];
    connectedResolves: ((peer: Peer) => void)[];
    rtc?: Rtc;
  }
  interface KBucketContact {
    id: RoomNameHashBuffer;
    roomNameHash: RoomNameHash;
    vectorClock: number;
  }

  type UnamedNetworkEvents = {
    'new-peer': (peer: Peer) => void;
  }

  type Ephemeral = Unpromise<ReturnType<typeof crypto.keys.generateEphemeralKeyPair>>;
  type Encrypter = Unpromise<ReturnType<typeof crypto.aes.create>>;
  type Decrypter = Unpromise<ReturnType<typeof crypto.aes.create>>;
  interface Rtc {
    simplePeer: SimpleRtcPeer;
    ephemeral: Ephemeral;
    encrypter: Encrypter;
    decrypter: Decrypter;
  }

  export default class UnamedNetwork extends EventEmitter<UnamedNetworkEvents> {
    nodeType: NodeType;
    ipfs: IPFS;
    rooms: Map<RoomNameHash, Room>;
    primaryRoomNameHash: RoomNameHash | null; // for kBucket's localNodeId, which determine this node's location in Kademlia DHT network
    peers: Map<PeerId, Peer>; // connected
    kBucket: KBucket<KBucketContact>; // known rooms, but rooms without other peers should not be added

    private requestResolveRejects: Map<ReqId, [(payload: any) => void, (error: any) => void]>;
    private started: boolean;
  }

  // Packets
  // ==========

  interface Packet { // abstract
    type: string;
    protocol: string;
    packetId: string;
  }
  interface Request { // abstract
    reqId: ReqId;
  }
  interface Response { // abstract
    reqId: ReqId;
  }

  interface PingPacket extends Packet, Request {
    type: 'ping';
    addrs: MultiAddr[];
    roomNameHashes: RoomNameHash[];
  }
  interface PongPacket extends Packet, Response {
    type: 'pong';
    addrs: MultiAddr[];
    roomNameHashes: RoomNameHash[];
  }

  interface FindPacket extends Packet, Request {
    type: 'find';
    targetHash: string;
    fromPath: PeerId[];
    lastDistance: number;

    roomName: string; // development
  }

  interface NetworkPacket extends Packet { // abstract
    route: PeerId[]; // include sender
    hop: number; // index in toPath
  }

  interface NetworkNoPeerPacket extends NetworkPacket {
    type: 'noPeer';
    oriPacketId: string;
  }

  interface FindResPacket extends NetworkPacket, Response {
    type: 'findRes';
    found: boolean;

    roomName: string; // development
  }

  interface ConnectPacket extends NetworkPacket, Request {
    type: 'connect';
    ephemeralKey: string;
    addrs: MultiAddr[];
  }
  interface ConnectResPacket extends NetworkPacket, Response {
    type: 'connectRes';
    accepted: boolean;
    method?: 'myAddr' | 'yourAddr' | 'webrtc';

    // for myAddr method
    addrs?: MultiAddr[];

    // for webrtc method's further connectSignal encryption
    ephemeralKey?: string;
  }
  interface ConnectSignalPacket extends NetworkPacket {
    type: 'connectSignal';
    ephemeralKey: string;
    encryptedSignal?: any;
  }

  interface JoinPacket extends Packet, Request {
    type: 'join';
    roomName: string; // not hashed, can be kind of a passphrase
  }
  interface JoinResPacket extends Packet, Response {
    type: 'joinRes';
    accepted: boolean;
    peers: PeerId[];
  }

  // ==========

  class SimpleRtcPeer {
  }
}

type Unpromise<T extends Promise<any>> = T extends Promise<infer U> ? U : never;
