import Agent from 'unnamed-network/agent';
import WssConnManager from 'unnamed-network/conn-manager/wss';

console.log('starting ...');

const connManager = new WssConnManager({ port: 8081 });
const agent = new Agent(connManager, { id: 'node' });

connManager.start();

agent.addEventListener('hello', event => console.log(event.type, event.name));
agent.hello();
agent.showConfig();
