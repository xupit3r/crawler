import * as dotenv from 'dotenv';
import { MongoClient, ObjectId } from "mongodb";
import debug from 'debug';
import { exit } from 'process';
import * as cheerio from 'cheerio';
import { CrawlerError, ImageLink, Site, WorkerRegister } from './types';
import { normalizeUrl, sleep } from './utils';
import { updateIndices } from './reconfigure';
import { calcSummary, calcSentiment, extractText, calcNgrams, extractTags } from './text';
import { v4 as uuid } from 'uuid';
import { Worker } from 'worker_threads';
import { getPageContent } from './page';
import { categoriesFromText, classifyMany } from './classify';

const MAX_WORKERS = 10;
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
  const text = db.collection('text');

  await updateIndices();

  const pageDocs = await pages.find({
    extractedText: {
      $ne: true
    }
  }).project({
    _id: 1,
    url: 1,
  }).toArray();

  let currentIdx = 0;

  while (currentIdx < pageDocs.length) {
    if (Object.keys(workers).length < MAX_WORKERS) {
      const page = pageDocs[currentIdx++];
      
      if (page) {
        const workerId = uuid();
        const worker = new Worker(WORKER_SCRIPT);

        logger(`STARTING -- ${workerId}`);

        worker.postMessage({
          pageId: page._id.toString(),
          workerId: workerId
        });

        workers[workerId] = worker;

        worker.on('message', async ({ workerId, pageTexts }) => {
          try {
            // create a text document for this page
            if (pageTexts.length == 0) {
              logger(`NOTEXT -- ${page._id}`);
            }

            const summary = calcSummary(pageTexts);

            await text.updateOne({
              page: page._id
            }, {
              $set: {
                text: calcSentiment(pageTexts)
              }
            }, { upsert: true });

            // indicate that we have added text for this page
            await pages.updateOne({
              _id: page._id
            }, {
              $set: {
                extractedText: true,
                summarized: true,
                sentiment: true,
                summary: summary
              }
            });

            logger(`COMPLETE -- ${workerId}`);
          } catch (err) {
            logger(`ERROR -- ${workerId} ${err}`);
          } finally {
            await workers[workerId].terminate();
            delete workers[workerId];
          }
        });
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

  const cursor = await pages.find({
    $or: [{
      summary: {
        $exists: false
      }
    }, {
      summary: {
        $eq: '🤷‍♀️'
      }
    }]
  });

  while (await cursor.hasNext()) {
    const pageDoc = await cursor.next();

    if (pageDoc) {
      const textDoc = await text.findOne({
        page: pageDoc._id
      });

      if (textDoc) {   
        const summary = calcSummary(textDoc.text);

        await pages.updateOne({
          _id: pageDoc._id
        }, {
          $set: {
            summarized: true,
            summary: summary
          }
        });
      }
    }
  }

  exit();
}


export const addSentiment = async () => {
  await storage.connect();
  
  const db = storage.db('crawler');
  const pages = db.collection('pages');
  const text = db.collection('text');

  await updateIndices();

  const cursor = await pages.find({
    sentiment: {
      $ne: true
    }
  }).project({
    _id: 1,
    url: 1
  });
  
  while (await cursor.hasNext()) {
    const pageDoc = await cursor.next();

    if (pageDoc) {
      const textDoc = await text.findOne({
        page: pageDoc._id
      });

      if (textDoc) {
        logger(`adding sentiment to ${pageDoc.url}`);

        const pageTexts = calcSentiment(textDoc.text);
  
        await text.updateOne({
          _id: textDoc._id
        }, {
          $set: {
            text: pageTexts
          }
        });
  
        await pages.updateOne({
          _id: textDoc.page
        }, {
          $set: {
            sentiment: true
          }
        });
      }
    }
  }

  exit();
}

export const addTermFrequencies = async () => {
  await storage.connect();
  
  const db = storage.db('crawler');
  const pages = db.collection('pages');
  const text = db.collection('text');
  const tokens = db.collection('terms');

  await updateIndices();

  const cursor = await pages.find({
    $and: [{
      tf: {
        $ne: true
      }
    }, {
      extractedText: {
        $eq: true
      }
    }]
  }).project({
    _id: 1,
    url: 1
  });
  
  while (await cursor.hasNext()) {
    const pageDoc = await cursor.next();

    if (pageDoc) {
      const textDoc = await text.findOne({
        page: pageDoc._id
      });

      if (textDoc && textDoc.text && textDoc.text.length > 0) {
        logger(`adding tf for ${pageDoc.url}`);

        const termFrequencies = calcNgrams(textDoc.text);

        const entries = Object.entries(termFrequencies);
        const tokenDocs = entries.map(([term, score]) => {
          return {
            page: pageDoc._id,
            term: term,
            score: score
          };
        });

        await tokens.insertMany(tokenDocs);
  
        await pages.updateOne({
          _id: pageDoc._id
        }, {
          $set: {
            tf: true
          }
        });
      } else {
        logger(`no text for ${pageDoc._id}`);
      }
    }
  }

  exit();
}

export const addPageTags = async () => {
  await storage.connect();
  
  const db = storage.db('crawler');
  const pages = db.collection('pages');
  const terms = db.collection('terms');

  await updateIndices();

  const cursor = await pages.find().project({
    _id: 1,
    url: 1
  });
  
  while (await cursor.hasNext()) {
    const pageDoc = await cursor.next();

    if (pageDoc) {
      const termsDoc = await terms.findOne({
        page: pageDoc._id
      });

      if (termsDoc) {
        const tags = extractTags(termsDoc.tf);

        logger(`setting ${tags} tags for ${pageDoc.url}`);

        await pages.updateOne({
          _id: pageDoc._id
        }, {
          $set: {
            tags: tags 
          }
        });
      }
    }
  }

  exit();
}

export const splitTerms = async () => {
  await storage.connect();

  const db = storage.db('crawler');
  const terms = db.collection('terms');
  const tokens = db.collection('tokens');

  await updateIndices();

  const cursor = await terms.find();

  logger('splitting terms');
  while (await cursor.hasNext()) {
    const termsDoc = await cursor.next();

    if (termsDoc) {
      const entries = Object.entries(termsDoc.tf);
      const tokenDocs = entries.map(([term, score]) => {
        return {
          page: termsDoc.page,
          term: term,
          score: score
        };
      });

      await tokens.insertMany(tokenDocs);
    }
  }

  logger('creating index for tokens.term')
  await tokens.createIndex({
    term: 1
  });

  exit();
}

export const testSPA = async () => {
  try {
    const content = await getPageContent('https://github.com/blog/2496-commit-together-with-co-authors');

    logger(extractText(content.html));

  } catch (err) {
    const error = err as CrawlerError;
    logger(`FAILED: ${error.message}`);
  }

  exit();
}

export const classifyImages = async () => {
  await storage.connect();

  const db = storage.db('crawler');
  const images = db.collection('images');

  const cursor = await images.find();

  while (await cursor.hasNext()) {
    const doc = await cursor.next();

    if (doc) {
      const classifications = await classifyMany(doc.images);

      console.log(`classified images for ${doc._id}`);
      console.log(classifications.map(c => c.categories));

      await images.updateOne({
        _id: doc._id
      }, {
        $set: {
          images: classifications
        }
      });
    }
  }

  exit();
}

export const categorizeText = async () => {
  await storage.connect();

  const db = storage.db('crawler');
  const text = db.collection('text');

  const cursor = await text.find();

  while (await cursor.hasNext()) {
    const doc = await cursor.next();

    if (doc) {
      const categories = await categoriesFromText(doc.text.join(' '));

      console.log(`categories for ${doc._id} -- ${categories.join(',')}`);

      await text.updateOne({
        _id: doc._id
      }, {
        $set: {
          categories: categories
        }
      });
    }
  }

  exit();
}

export const createSites = async () => {
  await storage.connect();

  const db = storage.db('crawler');
  const sites = db.collection('sites');
  const pages = db.collection('pages');

  const hostDocs = await pages.distinct('host');
  const hosts: Array<Site> = hostDocs.filter(host => host.length).map(host => ({
    name: host
  }));

  console.log('adding sites...')
  await sites.insertMany(hosts);

  exit();
}