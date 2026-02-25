import {io} from 'socket.io-client';

const options = {
    "force new connection": true,
    reconnectionAttempts: "Infinity",
    timeoot: 10000,
    transports: ["websocket"]
}

const socket = io('https://ТВОЙ-RAILWAY-URL.up.railway.app', options);

export default socket;