// Preload for every Node process the video-director scripts start (Remotion
// CLI and renderer): keep every server on loopback. Remotion binds its studio
// and render servers to all interfaces and has no --host flag. Loaded with
//   NODE_OPTIONS="--require <this file>"
const net = require('net');

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);
const origListen = net.Server.prototype.listen;

net.Server.prototype.listen = function (...args) {
  const first = args[0];
  if (first === undefined || typeof first === 'function') {
    // listen() or listen(cb): a random port on every interface by default
    args.unshift(0, '127.0.0.1');
  } else if (first && typeof first === 'object' && !Array.isArray(first)) {
    const isSocket = first.path !== undefined || first.fd !== undefined || first.handle !== undefined || first._handle !== undefined;
    if (!isSocket && !LOOPBACK.has(first.host)) {
      args[0] = { ...first, host: '127.0.0.1' };
    }
  } else if (typeof first === 'number' || (typeof first === 'string' && /^\d+$/.test(first))) {
    // listen(port[, host][, backlog][, cb])
    if (typeof args[1] === 'string') {
      if (!LOOPBACK.has(args[1])) args[1] = '127.0.0.1';
    } else {
      args.splice(1, 0, '127.0.0.1');
    }
  }
  return origListen.apply(this, args);
};
