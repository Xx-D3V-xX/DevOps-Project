require('dotenv').config();
const http = require('node:http');
const express = require('express');
const cors = require('cors');
const roomsRouter = require('./routes/rooms');
const { setupSocket } = require('./socket');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(express.json());
app.use('/api/rooms', roomsRouter);

const httpServer = http.createServer(app);
setupSocket(httpServer);

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, httpServer };
