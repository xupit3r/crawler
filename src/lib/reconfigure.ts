import * as dotenv from 'dotenv';
import { MongoClient, ObjectId } from "mongodb";
import debug from 'debug';
import { exit } from 'process';
import { removeHash } from './utils';

const logger = debug('reconfigure');

dotenv.config();

if (typeof process.env.MONGO_CONNECT_STRING === 'undefined') {
  logger('MONGO_CONNECT_STRING must be defined in .env');
  exit(-1);
}

const storage = new MongoClient(process.env.MONGO_CONNECT_STRING);

/**
 * Utility to move links from separate collection to the page on
 * which they were found (much better storage format)
 */
export const moveLinks = async () => {
  await storage.connect();
  const db = storage.db('crawler');
  const pages = db.collection('pages');
  const links = db.collection('links');

  logger('creating links source: 1 index');
  await db.collection('links').createIndex({
    source: 1
  });

  logger('moving links to appropriate page doc');

  const pageDocs = await pages.find({}).project({
    _id: 1,
    url: 1
  }).toArray();

  for (let i = 0; i < pageDocs.length; i++) {
    const page = pageDocs[i];
    const linkDocs = await links.find({
      source: page.url
    }).project({
      source: 1,
      sourceHost: 1,
      host: 1,
      url: 1
    }).toArray();

    logger(`moving ${linkDocs.length} to ${page.url}`);

    await pages.updateOne({
      _id: new ObjectId(page._id)
    }, {
      $set: {
        links: linkDocs,
        linkCount: linkDocs.length
      }
    });
  }

  logger('all links move.');
  exit();
}

/**
 * some of the early URLs didn't have hashes removed,
 * this will correct that situation
 */
export const normalizeQueueLinks = async () => {
  await storage.connect();
  const db = storage.db('crawler');
  const queue = db.collection('queue');
  
  const cursor = queue.find({}).project({
    _id: 1,
    url: 1
  });

  logger('normalizing queue URLs');

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    
    
    if (doc) {
      logger(`updating ${doc.url}`);
      await queue.updateOne({
        _id: new ObjectId(doc._id)
      }, {
        $set: {
          url: removeHash(doc.url)
        }
      });
    }
  }

  logger('all docs updated.');

  exit();
}