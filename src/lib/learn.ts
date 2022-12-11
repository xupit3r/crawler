import * as dotenv from 'dotenv';
import { MongoClient, ObjectId } from "mongodb";
import debug from 'debug';
import { exit } from 'process';
import * as cheerio from 'cheerio';
import { ImageLink } from './types';
import { normalizeUrl } from './utils';

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