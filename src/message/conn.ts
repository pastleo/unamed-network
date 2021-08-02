import Identity from '../misc/identity';
import {
  RequestToConnMessage, RequestToConnResultMessage
} from './message';

export async function makeRequestToConnMessage(myIdentity: Identity, peerAddr: string, offer?: RTCSessionDescription): Promise<RequestToConnMessage> {
  return {
    term: 'requestToConn',
    srcAddr: myIdentity.addr, desAddr: peerAddr,
    signingPubKey: myIdentity.exportedSigningPubKey,
    encryptionPubKey: myIdentity.expoertedEncryptionPubKey,
    signature: await myIdentity.signature(),
    offer
  };
}

export async function makeRequestToConnResultMessage(myIdentity: Identity, peerAddr: string, answer?: RTCSessionDescription): Promise<RequestToConnResultMessage> {
  return {
    term: 'requestToConnResult',
    srcAddr: myIdentity.addr, desAddr: peerAddr,
    signingPubKey: myIdentity.exportedSigningPubKey,
    encryptionPubKey: myIdentity.expoertedEncryptionPubKey,
    signature: await myIdentity.signature(),
    answer,
  };
}
