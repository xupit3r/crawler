import * as dotenv from 'dotenv';
import { Document, MongoClient, ObjectId } from "mongodb";
import debug from 'debug';
import { Page, Link, ToBeVisited, CooldownHost, WebData } from './types';
import { exit } from 'process';
import { getHostname } from './utils';

const logger = debug('storage');

dotenv.config();

if (typeof process.env.MONGO_CONNECT_STRING === 'undefined') {
  logger('MONGO_CONNECT_STRING must be defined in .env');
  exit(-1);
}

export const storage = new MongoClient(process.env.MONGO_CONNECT_STRING);

/**
 * Saves a page in storage. Updates all necessary
 * collections associated with the page
 * 
 * @param page the page to save in storage
 * @param pageLinks any links that were found within the page
 * @returns a Promise that resolves to the inserted doc
 */
export const savePage = async (page: Page): Promise<Document> => {
  await storage.connect();

  const db = storage.db('crawler');
  const pages = db.collection('pages');
  
  logger(`saving page ${page.url}.`);

  return await pages.insertOne(page);
}

/**
 * Add a page's data (e.g. HTML) to our web data collection
 * 
 * @param webData response data to save into our collection
 * @returns a Promise that will resolve to the inserted doc
 */
export const saveWebData = async (webData: WebData): Promise<Document> => {
  await storage.connect();

  const db = storage.db('crawler');
  const data = db.collection('webdata');

  return await data.insertOne({
    ...webData,
    ...{
      page: new ObjectId(webData.page)
    }
  })
}

/**
 * Looksup up a page by its URL
 * 
 * @param url the url of the page we want to retrieve
 * @returns a Promise that resolves to a Page or null if the page 
 * does not exist
 */
export const getPage = async (url: string): Promise<Page | null> => {
  await storage.connect();
  const db = storage.db('crawler');
  const pages = db.collection('pages');

  return await pages.findOne<Page>({
    url: url
  });
}

/**
 * Will update our queue with any links that lead to pages that 
 * we have yet to explore.
 * 
 * @param pageLinks links within a page to potentially add to our
 * queue
 */
export const updateQueue = async (pageLinks: Array<Link>) => {
  await storage.connect();

  const db = storage.db('crawler');
  const pages = db.collection('pages');
  const queue = db.collection('queue');

  // what URLs did we find?
  const urls = pageLinks.map(link => link.url);

  // find urls that have a page entry, this means
  // we have visted them
  const visitedLinks = await pages.find({
    url: { $in: urls }
  }).project({ url: true }).toArray();

  // any links that do not have a page entry have not been visited
  const toBeVisited: Array<ToBeVisited> = pageLinks.filter(link =>
    visitedLinks.findIndex(({ url }) => link.url === url) === -1
  ).map(link => ({
    url: link.url,
    host: getHostname(link.url),
    date: new Date(),
    processing: false
  }));

  if (toBeVisited.length) {
    logger(`adding ${toBeVisited.length} links to the queue.`);
    await queue.insertMany(toBeVisited);
  }
}


/**
 * Will remove all instances of a particular URL from the queue
 * 
 * @param url the url to remove form the queue
 */
export const removeFromQueue = async (url: string) => {
  await storage.connect();
  const db = storage.db('crawler');    
  const queue = db.collection('queue');

  await queue.deleteMany({
    url: url
  });
}

/**
 * Pulls the next link to visit from the queue and removes that 
 * and any other instances from the queue.
 * 
 * @param limitTo if set, this will limit links to a specified hostname
 * @returns the next link to visit
 */
export const getNextLink = async (limitTo: string = ''): Promise<ToBeVisited | null> => {
  await storage.connect();

  const session = storage.startSession();

  let nextVisit = null;

  try {
    session.startTransaction({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary'
    });

    const db = storage.db('crawler');    
    const queue = db.collection('queue');
    const cooldown = db.collection('cooldown');

    const cooldownHosts = await cooldown.distinct('hostname');

    let query = {};
    if (limitTo.length > 0) {
      query = {
        $and: [
          { processing: { $ne: true }},
          { host: { $nin: cooldownHosts }},
          { host: limitTo }
        ]
      };
    } else if (cooldownHosts.length > 0) {
      query = {
        $and: [
          { processing: { $ne: true }},
          { host: { $nin: cooldownHosts }}
        ]
      };
    } else {
      query = {
        processing: { $ne: true }
      };
    }
  
    nextVisit = await queue.findOne<ToBeVisited>(query, { sort: { _id: 1 }});
  
    if (nextVisit !== null) {
      queue.updateOne({
        _id: nextVisit._id
      }, {
        $set: {
          processing: true
        }
      });
    }

    await session.commitTransaction();
  } catch (err) {
    logger(`failed to retrieve next item in queue ${err}`);
    await session.abortTransaction();
  } finally {
    await session.endSession();
  }

  return nextVisit;
}

/**
 * Adds a hostname to list of hostnames to avoid
 * 
 * @param hostname the hostname to cooldown
 * @param time amount of time (in seconds) to let it cooloff
 */
export const addHostToCooldown = async (hostname: string, time: number) => {
  await storage.connect();
  const db = storage.db('crawler');    
  const cooldown = db.collection('cooldown');
  const coolDocs = await cooldown.distinct('hostname');

  // only add to the cooldown if the hostname doesn't currently
  // exist within the collection
  if (coolDocs.indexOf(hostname) === -1) {
    const expirationDate = new Date();
  
    expirationDate.setSeconds(expirationDate.getSeconds() + time);
  
    logger(`adding ${hostname} to cooldown until ${expirationDate}`);
  
    const host: CooldownHost = {
      expireAt: expirationDate,
      hostname: hostname
    }
  
    await cooldown.insertOne(host);
  }
}

/**
 * when we exit, do some stuff that will be sure
 * we are not in a bad state
 */
export const cleanup = async () => {
  await storage.connect();
  
  const db = storage.db('crawler');

  await db.collection('queue').updateMany({
    processing: true
  }, {
    $set: {
      processing: false
    }
  });
}