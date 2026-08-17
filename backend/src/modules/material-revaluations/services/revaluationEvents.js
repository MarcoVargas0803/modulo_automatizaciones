const clients = new Map();

function addClient(res, { userId = null } = {}) {
  clients.set(res, { userId });
}

function removeClient(res) {
  clients.delete(res);
}

function broadcast(event, data, { userId = null } = {}) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`;
  let delivered = 0;

  for (const [res, meta] of clients) {
    if (userId !== null && meta.userId !== userId) {
      continue;
    }

    try {
      res.write(payload);
      delivered += 1;
    } catch {
      clients.delete(res);
    }
  }

  return delivered;
}

function clientCount() {
  return clients.size;
}

module.exports = {
  addClient,
  removeClient,
  broadcast,
  clientCount,
};
