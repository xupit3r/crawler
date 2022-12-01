import { MongoClient } from 'mongodb';
import debug from 'debug';

const logger = debug('indices');

export const createIndices = async () => {
  const storage = new MongoClient('mongodb://root:root@localhost:27018');

  await storage.connect();

  const db = storage.db('crawler');

  logger('creating links status: 1, unvisited: 1 index');
  await db.collection('links').createIndex({
    url: 1,
    sourceUrl: 1
  });

  logger('creating queue host: 1, _id: 1');
  await db.collection('links').createIndex({
    host: 1,
    _id: 1
  });

  logger('creating TTL index for cooldown');
  await db.collection('cooldown').createIndex({
    expireAt: 1
  }, {
    expireAfterSeconds: 0
  });

  logger('indices created');
}