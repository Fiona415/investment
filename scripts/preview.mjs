import http from 'node:http';
import worker from '../worker/index.js';
const port = Number(process.env.PORT || 4174);
http.createServer(async (req, res) => {
  const response = await worker.fetch(new Request(`http://127.0.0.1:${port}${req.url}`));
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, '127.0.0.1', () => console.log(`Share preview: http://127.0.0.1:${port}/`));

