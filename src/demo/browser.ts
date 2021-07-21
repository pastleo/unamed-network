import Agent from 'unnamed-network/agent';

console.log('works ...');
const agent = new Agent({ id: 'browser', routeTtl: 20 });
agent.hello();
agent.showConfig();
