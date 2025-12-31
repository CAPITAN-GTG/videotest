const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  const io = new Server(httpServer);

  io.on('connection', (socket) => {
    socket.on('join-room', (roomCode) => {
      socket.join(roomCode);
      const room = io.sockets.adapter.rooms.get(roomCode);
      const clients = Array.from(room || []);
      const otherClients = clients.filter(id => id !== socket.id);
      if (otherClients.length > 0) {
        socket.emit('user-joined', otherClients[0]);
      }
    });
    
    socket.on('offer', (offer, toId) => {
      socket.to(toId).emit('offer', offer, socket.id);
    });
    
    socket.on('answer', (answer, toId) => {
      socket.to(toId).emit('answer', answer, socket.id);
    });
    
    socket.on('ice-candidate', (candidate, toId) => {
      socket.to(toId).emit('ice-candidate', candidate, socket.id);
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});

