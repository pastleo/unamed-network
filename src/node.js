const repl = require('repl');
const { create: createIpfsClient } = require('ipfs-http-client');

async function main() {
  const ipfsClient = createIpfsClient({
    url: process.env.IPFS_API || 'http://localhost:5001',
  })

  global.ipfsClient = ipfsClient;
  console.log('global.ipfsClient created')

  repl.start({ prompt: '> ' });
}

main();
