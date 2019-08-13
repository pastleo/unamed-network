# unnamed-network
experiments about WebRTC and WebSocket p2p network

## Example

### get it running

```sh
git clone git@github.com:pastleo/unnamed-network.git
cd unnamed-network
npm install
./example/prepare.sh
cp ./example/app/config.js.example ./example/app/config.js # change config if needed
```

#### wss node part

```sh
npm run example
```

#### browser part

```sh
npm run example-serve
```

then open http://localhost:8080 on your browser (please see outputs from above command)
