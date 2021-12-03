FROM node:16.12.0-alpine

WORKDIR /unamed-network

COPY package.json package-lock.json ./
RUN npm install

COPY . .
COPY env.js.docker env.js

CMD ["npm", "start"]
