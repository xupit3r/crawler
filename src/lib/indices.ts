import * as dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import debug from 'debug';
import { exit } from 'process';

const logger = debug('indices');

dotenv.config();

if (typeof process.env.MONGO_CONNECT_STRING === 'undefined') {
  logger('MONGO_CONNECT_STRING must be defined in .env');
  exit(-1);
}

const storage = new MongoClient(process.env.MONGO_CONNECT_STRING);

export const createIndices = async () => {
  await storage.connect();

  const db = storage.db('crawler');
  
  logger('creating pages host: 1 index');
  await db.collection('pages').createIndex({
    host: 1
  });

  logger('creating pages url: 1 index');
  await db.collection('pages').createIndex({
    url: 1
  });

  logger('creating text page index');
  await db.collection('text').createIndex({
    text: 1
  });

  logger('creating page sentiment index');
  await db.collection('pages').createIndex({
    sentiment: 1
  });

  logger('creating sparse text summary index');
  await db.collection('text').createIndex({
    summary: 1,
  }, { sparse: true });

  logger('creating webdata page index');
  await db.collection('webdata').createIndex({
    page: 1
  });

  logger('creating queue host: 1, processing: 1');
  await db.collection('queue').createIndex({
    host: 1,
    processing: 1
  });

  logger('creating queue processing: 1');
  await db.collection('queue').createIndex({
    url: 1
  });

  logger('creating queue processing: 1');
  await db.collection('queue').createIndex({
    processing: 1
  });

  logger('creating queue host: 1, processing: 1');
  await db.collection('queue').createIndex({
    host: 1,
    processing: 1
  });

  logger('creating TTL index for cooldown');
  await db.collection('cooldown').createIndex({
    expireAt: 1
  }, {
    expireAfterSeconds: 0
  });

  logger('indices created');
}