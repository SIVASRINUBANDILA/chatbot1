const { MongoClient } = require('mongodb');

let cachedClient = null;

async function getDb() {
  if (cachedClient) return cachedClient.db('pdf-chat');
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI environment variable not set');
  const client = new MongoClient(uri, {
    tls: true,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 10000,
  });
  await client.connect();
  cachedClient = client;
  return client.db('pdf-chat');
}

module.exports = { getDb };
