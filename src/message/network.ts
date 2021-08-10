export interface PingMessage {
  term: 'ping'
  timestamp: number
}

export interface FindNodeMessage {
  term: 'find-node'
}

export interface FindNodeResponseMessage {
  term: 'find-node-response'
}
