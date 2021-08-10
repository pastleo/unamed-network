import { CustomEvent } from './event-target';
import { Message } from '../message/message';
import { MessageReceivedEvent } from '../conn/base';

export class NetworkMessageReceivedEvent extends CustomEvent<Message> {
  type = 'receive-network';
  messageReceivedEvent: MessageReceivedEvent;
  exactForMe: boolean;

  constructor(messageReceivedEvent: MessageReceivedEvent, exactForMe: boolean) {
    super(messageReceivedEvent.detail);
    this.messageReceivedEvent = messageReceivedEvent;
    this.exactForMe = exactForMe;
  }
}

