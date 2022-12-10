import * as dotenv from 'dotenv';
import { MongoClient, ObjectId } from "mongodb";
import debug from 'debug';
import { exit } from 'process';
import * as cheerio from 'cheerio';
import { ImageLink } from './types';
import { classifyMany } from './classify';
import { normalizeUrl } from './utils';

const logger = debug('learn');

dotenv.config();

if (typeof process.env.MONGO_CONNECT_STRING === 'undefined') {
  logger('MONGO_CONNECT_STRING must be defined in .env');
  exit(-1);
}

const storage = new MongoClient(process.env.MONGO_CONNECT_STRING);

const storeImages = async (pageId: ObjectId, url: string, classifiedImages: Array<ImageLink>) => {
  await storage.connect();
  const db = storage.db('crawler');
  const pages = db.collection('pages');
  const images = db.collection('images');

  if (classifiedImages.length) {
    // remove any previous images
    await images.deleteMany({
      page: pageId
    });

    // add all the new images for the page
    await images.insertMany(classifiedImages.map(img => {
      return {
        page: pageId,
        ...img
      };
    }));

    logger(`added ${classifiedImages.length} images for ${url}`);
  } else {
    logger(`no images to add for ${url}`);
  }

  // mark this as having had image classification
  return await pages.updateOne({
    _id: pageId
  }, {
    $set: {
      classifiedImages: true
    }
  });
}

export const addImageClassification = async () => {
  await storage.connect();
  const db = storage.db('crawler');
  const pages = db.collection('pages');
  const webdata = db.collection('webdata');

  logger('running image classification');

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

  for (let i = 0; i < pageDocs.length; i++) {
    const pageDoc = pageDocs[i];
    const pageId = new ObjectId(pageDoc._id);

    const html = await webdata.findOne({
      page: pageId
    });

    if (html !== null && typeof html.data === 'string') {
      const $ = cheerio.load(html.data);
      const imageTags = $('img');
      const imageLinks: Array<ImageLink> = imageTags.get().filter((img) => {
        return !!$(img).attr('src');
      }).map((img) => {
        const $el = $(img);
        const url = $el.attr('src') || '';
        const alt = $el.attr('alt') || '';
        const depth = $el.parents().length;

        return {
          url: normalizeUrl(url, pageDoc.url),
          depth: depth,
          alt: alt
        };
      });
      
      const classifiedImages = await classifyMany(imageLinks);

      await storeImages(pageId, pageDoc.url, classifiedImages);
      
    } else {
      logger(`no HTML data for ${pageDoc.url}`)
    }
  }

  exit();
}