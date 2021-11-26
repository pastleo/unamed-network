import { EventEmitter } from 'tsee';
import { create as createIPFS, IPFS } from 'ipfs-core';
import KBucket from 'k-bucket';
import crypto from 'libp2p-crypto';
import debug from 'debug';

declare module 'unamed-network' {

  type UnamedNetworkEvents = {
    'new-member': (event: { member: Peer, room: Room }) => void,
    'new-known-service-addr': (event: { addr: MultiAddr }) => void,
    'room-message': (event: { room: Room, fromMember: Peer, message: any }) => void,
  }

  export default class UnamedNetwork extends EventEmitter<UnamedNetworkEvents> {
    readonly ipfs: IPFS;
    readonly nodeType: NodeType;
    readonly idInfo: Awaited<ReturnType<IPFS['id']>>;
    readonly rooms: Map<RoomNameHash, Room>;
    readonly primaryRoomNameHash: RoomNameHash | null; // for kBucket's localNodeId, which determine this node's location in Kademlia DHT network
    readonly peers: Map<PeerId, Peer>;
    readonly kBucket: KBucket<KBucketContact>; // rooms without other peers should not be added

    readonly knownServiceNodes: MultiAddr[];
    readonly started: boolean;
    readonly config: Config;
    readonly iceServers: RTCIceServers;
    readonly providing?: Providing;

    private requestResolveRejects: Map<ReqId, [(payload: any) => void, (error: any) => void]>;
    private broadcastedMessages: Map<string, () => void>; // value is a fn to clearTimeout

    constructor(ipfs: IPFS, config?: Config);
    start(knownServiceNodes: MultiAddr[]): Promise<void>;

    /** @returns if room has other peers */
    join(roomName: string, makePrimary?: boolean): Promise<boolean>;

    broadcast(roomName: string, message: any): void;
  }

  /** WARNING: only available from webLib */
  export const WEB_DEV_IPFS_OPTIONS: any;
  /** WARNING: only available from webLib */
  export { createIPFS, debug };

  type RTCIceServers = ConstructorParameters<typeof RTCPeerConnection>[0]['iceServers']

  interface Config {
    iceServers?: RTCIceServers;
    providing?: {
      iceServers?: RTCIceServers,
      gateway?: boolean | string,
    };
  }

  type RoomNameHash = string;
  type RoomNameHashBuffer = Uint8Array;
  type PeerId = string;
  type MultiAddr = string;
  type ReqId = string;
  type NodeType = 'serviceNode' | 'clientNode';
  type RoomMemberState = 'pending' | 'connected' | 'joined';
  type PeerConnState = 'pending' | 'connected';

  interface Room {
    roomNameHash: RoomNameHash;
    joined: boolean;
    name?: string; // not hashed, only room member knows
    members: Map<PeerId, RoomMemberState>;
  }
  interface Peer {
    peerId: PeerId;
    state: PeerConnState;
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

  type Ephemeral = Awaited<ReturnType<typeof crypto.keys.generateEphemeralKeyPair>>;
  type Encrypter = Awaited<ReturnType<typeof crypto.aes.create>>;
  type Decrypter = Awaited<ReturnType<typeof crypto.aes.create>>;
  interface Rtc {
    simplePeer: SimpleRtcPeer;
    ephemeral: Ephemeral;
    encrypter: Encrypter;
    decrypter: Decrypter;
  }

  interface Providing {
    iceServers?: RTCIceServers;
    gateway?: string,
  }

  // Packets (just as memo)

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
    providing?: Providing;
  }
  interface PongPacket extends Packet, Response {
    type: 'pong';
    addrs: MultiAddr[];
    roomNameHashes: RoomNameHash[];
    providing?: Providing;
  }

  interface FindPacket extends Packet, Request {
    type: 'find';
    targetHash: string;
    fromPath: PeerId[];
    lastDistance: number;
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
    encryptedSignal?: any;
  }

  interface JoinPacket extends Packet, Request {
    type: 'join';
    roomNameHash: RoomNameHash;
    roomName: string; // not hashed, can be kind of a passphrase
  }
  interface JoinResPacket extends Packet, Response {
    type: 'joinRes';
    ok: boolean;
    members?: PeerId[];
  }

  interface RoomMessagePacket extends Packet {
    type: 'roomMessage';
    roomNameHash: RoomNameHash;
    author: PeerId;
    message: any;
  }

  // 3rd package that don't have typings:

  class SimpleRtcPeer {
  }
}
