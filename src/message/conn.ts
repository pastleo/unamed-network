import Identity from '../misc/identity';
import {
  RequestToConnMessage, RequestToConnResultMessage
} from './message';

export async function makeRequestToConnMessage(myIdentity: Identity, peerPath: string, offer?: RTCSessionDescription): Promise<RequestToConnMessage> {
  return {
    term: 'requestToConn',
    srcPath: myIdentity.addr, desPath: peerPath,
    signingPubKey: myIdentity.exportedSigningPubKey,
    encryptionPubKey: myIdentity.expoertedEncryptionPubKey,
    signature: await myIdentity.signature(),
    offer
  };
}

export async function makeRequestToConnResultMessage(myIdentity: Identity, peerPath: string, answer?: RTCSessionDescription): Promise<RequestToConnResultMessage> {
  return {
    term: 'requestToConnResult',
    srcPath: myIdentity.addr, desPath: peerPath,
    signingPubKey: myIdentity.exportedSigningPubKey,
    encryptionPubKey: myIdentity.expoertedEncryptionPubKey,
    signature: await myIdentity.signature(),
    answer,
  };
}
