import Agent from 'unnamed-network/agent';
import BrowserConnManager from 'unnamed-network/conn-manager/browser';
import WsConn from 'unnamed-network/conn/ws';

const connManager = new BrowserConnManager();

console.log('works ...');
const agent = new Agent(connManager, { id: 'browser', routeTtl: 20 });

agent.addEventListener('bello', event => console.log(event.type, event.name));
agent.hello();
agent.showConfig();

const conn = new WsConn();
conn.startLink({ addr: 'ws://localhost:8081' })
