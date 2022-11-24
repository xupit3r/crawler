import { MongoClient } from 'mongodb';
import debug from 'debug';

const logger = debug('indices');

export const createIndices = async () => {
  const storage = new MongoClient('mongodb://root:root@localhost:27018');

  await storage.connect();

  const db = storage.db('crawler');

  logger('creating links status: 1, unvisited: 1 index');
  await db.collection('links').createIndex({
    status: 1,
    unvisited: 1
  });

  logger('indices created');
}