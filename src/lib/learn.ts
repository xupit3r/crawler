import * as dotenv from 'dotenv';
import { MongoClient, ObjectId } from "mongodb";
import debug from 'debug';
import { exit } from 'process';
import * as cheerio from 'cheerio';
import { ImageLink, PageText, WorkerRegister } from './types';
import { normalizeUrl, sleep } from './utils';
import { updateIndices } from './reconfigure';
import { getSummary } from './text';
import { v4 as uuid } from 'uuid';
import { Worker } from 'worker_threads';

const MAX_WORKERS = 5;
const WORKER_SCRIPT = './src/lib/workers/texter.js';
const workers: WorkerRegister = {};

const logger = debug('learn');

dotenv.config();

if (typeof process.env.MONGO_CONNECT_STRING === 'undefined') {
  logger('MONGO_CONNECT_STRING must be defined in .env');
  exit(-1);
}

const storage = new MongoClient(process.env.MONGO_CONNECT_STRING);

const storeImages = async (pageId: ObjectId, pageImages: Array<ImageLink>) => {
  await storage.connect();
  const db = storage.db('crawler');
  const pages = db.collection('pages');
  const images = db.collection('images');

  if (pageImages.length) {
    // remove any previous images
    await images.deleteMany({
      page: pageId
    });

    // add all the new images for the page
    await images.insertMany(pageImages.map(img => {
      return {
        page: pageId,
        ...img
      };
    }));

    logger(`added ${pageImages.length} images for ${pageId}`);
  } else {
    logger(`no images to add for ${pageId}`);
  }

  // mark this as having had image collection
  await pages.updateOne({
    _id: pageId
  }, {
    $set: {
      images: true
    }
  });

  return storage.close();
}

const processImagesInHtml = async (pageId: ObjectId, pageUrl: string): Promise<Array<ImageLink>> => {
  await storage.connect();
  const db = storage.db('crawler');
  const webdata = db.collection('webdata');

  const html = await webdata.findOne({
    page: pageId
  });
  await storage.close();

  if (html !== null && typeof html.data === 'string') {
    const $ = cheerio.load(html.data);
    const imageTags = $('img');
    const imageLinks: Array<ImageLink> = imageTags.get().filter((img) => {
      const url = $(img).attr('src')
      return !!url && normalizeUrl(url, pageUrl);
    }).map((img) => {
      const $el = $(img);
      const url = $el.attr('src') || '';
      const alt = $el.attr('alt') || '';
      const depth = $el.parents().length;

      return {
        url: normalizeUrl(url, pageUrl),
        depth: depth,
        alt: alt,
        classified: false
      };
    });
    
    return imageLinks;
  }

  logger(`no HTML data for ${pageUrl}`);
  return [];
}

export const collectImages = async () => {
  await storage.connect();
  const db = storage.db('crawler');
  const pages = db.collection('pages');

  logger('collecting images...');

  const pageDocs = await pages.find({
    $and: [{
      type: 'html'
    }, {
      classifiedImages: {
        $ne: true
      }
    }]
  }).project({
    _id: 1,
    url: 1
  }).toArray();
  
  await storage.close();

  for (let i = 0; i < pageDocs.length; i++) {
    const pageDoc = pageDocs[i];
    const pageId = new ObjectId(pageDoc._id);
    const pageUrl = pageDoc.url;
    const images = await processImagesInHtml(pageId, pageUrl);

    await storeImages(pageId, images);
  }

  logger('image collection done.');

  exit();
}

export const collectText = async () => {
  await storage.connect();
  const db = storage.db('crawler');
  const pages = db.collection('pages');
  const webdata = db.collection('webdata');
  const text = db.collection('text');

  await updateIndices();

  const cursor = await pages.find({
    text: {
      $ne: true
    }
  }).project({
    _id: 1,
    url: 1
  });

  while (await cursor.hasNext()) {
    if (Object.keys(workers).length < MAX_WORKERS) {
      const page = await cursor.next();
      
      if (page) {
        const html = await webdata.findOne({
          page: page._id
        });
  
        if (html && typeof html.data === 'string') {
          try {
            const workerId = uuid();
            const worker = new Worker(WORKER_SCRIPT);
            
            logger(`STARTING: spawing worker ${workerId} to process ${page.url}`);
      
            worker.postMessage({
              html: html.data,
              workerId: workerId
            });
      
            workers[workerId] = worker;
      
            worker.on('message', async ({ workerId, pageTexts }) => {
              logger(`COMPLETE: worker ${workerId}`);
              logger(`adding page text document for ${page.url}`);
    
              // create a text document for this page
              if (pageTexts.length) {
                await text.updateOne({
                  page: page._id
                }, {
                  $set: {
                    text: pageTexts
                  }
                }, { upsert: true});
        
                // indicate that we have added text for this page
                await pages.updateOne({
                  _id: page._id
                }, {
                  $set: {
                    text: true
                  }
                });
              } else {
                // indicate that we could not retrieve page 
                // texts
                await pages.updateOne({
                  _id: page._id
                }, {
                  $set: {
                    text: false
                  }
                });
              }
  
              await workers[workerId].terminate();
              delete workers[workerId];
            });
          } catch (err) {
            logger(`failed to process text for ${page.url}`);
          }
        }      
      }
    } else {
      await sleep(50);
    }
  }

  logger('text has been processed');

  exit();
}

export const summarizeText = async () => {
  await storage.connect();
  const db = storage.db('crawler');
  const pages = db.collection('pages');
  const text = db.collection('text');

  const cursor = await text.find();

  while (await cursor.hasNext()) {
    const doc = await cursor.next();

    if (doc) {
      const relevants = doc.text.filter((pageText: PageText) => {
        return pageText.parent === 'p' || pageText.parent === 'div';
      });
      const summary = getSummary(relevants);

      logger(summary);

      await text.updateOne({
        _id: doc._id
      }, {
        $set: {
          summary: summary
        }
      });

      await pages.updateOne({
        _id: doc.page
      }, {
        $set: {
          summarized: true
        }
      });
    }
  }

  exit();
}