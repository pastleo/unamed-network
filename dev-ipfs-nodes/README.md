## Setup

### `config`

```json
{
  "Addresses": {
    "Swarm": [
      "/ip4/0.0.0.0/tcp/4005/ws",
    ],
    "API": "/ip4/127.0.0.1/tcp/5011",
    "Gateway": "/ip4/127.0.0.1/tcp/8081"
  },
  "API": {
    "HTTPHeaders": {
      "Access-Control-Allow-Origin": ["*"]
    }
  },
  "Swarm": {
    "DisableRelay": false,
    "EnableRelayHop": true,
  }
}
```

and delete all urls in `Bootstrap`

### `dev-1`

```bash
export IPFS_PATH=./dev-ipfs-nodes/dev-1
export IPFS_API=http://localhost:5011

rm -rf dev-ipfs-nodes/dev-1
ipfs init
git checkout dev-ipfs-nodes/dev-1
ipfs id

# start deamon
IPFS_PATH=./dev-ipfs-nodes/dev-1 ipfs daemon --enable-pubsub-experiment

# start unamed-network node
IPFS_API=http://localhost:5011 npm start
```

### `dev-2`

```bash
export IPFS_PATH=./dev-ipfs-nodes/dev-2
export IPFS_API=http://localhost:5012

rm -rf dev-ipfs-nodes/dev-2
ipfs init
git checkout dev-ipfs-nodes/dev-2
ipfs id

# start daemon
IPFS_PATH=./dev-ipfs-nodes/dev-2 ipfs daemon --enable-pubsub-experiment

# start unamed-network node
IPFS_API=http://localhost:5012 npm start
```

### `dev-3`

```bash
export IPFS_PATH=./dev-ipfs-nodes/dev-3
export IPFS_API=http://localhost:5013

rm -rf dev-ipfs-nodes/dev-3
ipfs init
git checkout dev-ipfs-nodes/dev-3
ipfs id

# start deamon
IPFS_PATH=./dev-ipfs-nodes/dev-3 ipfs daemon --enable-pubsub-experiment

# start unamed-network node
IPFS_API=http://localhost:5013 npm start
```
