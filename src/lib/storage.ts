import * as dotenv from 'dotenv';
import { MongoClient } from "mongodb";
import debug from 'debug';
import { Page, Link, ToBeVisited } from './types';
import { exit } from 'process';

const logger = debug('storage');

dotenv.config();

if (typeof process.env.MONGO_CONNECT_STRING === 'undefined') {
  logger('MONGO_CONNECT_STRING must be defined in .env');
  exit(-1);
}

const storage = new MongoClient(process.env.MONGO_CONNECT_STRING);

/**
 * Saves a page in storage. Updates all necessary
 * collections associated with the page
 * 
 * @param page the page to save in storage
 * @param pageLinks any links that were found within the page
 */
export const savePage = async (page: Page, pageLinks: Array<Link> = []) => {
  // add the page to storage for safe keeping
  await storage.connect();

  // grab the collections
  const db = storage.db('crawler');
  const pages = db.collection('pages');
  const links = db.collection('links');
  
  logger(`saving page ${page.url}.`);

  await pages.insertOne(page);

  // add in all the links found, if they do not already exist
  for (let i = 0; i < pageLinks.length; i++) {
    const pageLink = pageLinks[i];

    await links.updateOne({
      url: pageLink.url,
      sourceUrl: page.url
    }, { $set: pageLink }, { upsert: true });
  }
  
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
  // add the page to storage for safe keeping
  await storage.connect();

  // grab the collections
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
    url: link.url
  }));

  if (toBeVisited.length) {
    logger(`adding page ${toBeVisited.length} links to the queue.`);
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
 * Pulls the next link to visit from the queue
 * 
 * @returns the next link to visit
 */
export const getNextLink = async (): Promise<ToBeVisited | null> => {
  await storage.connect();
  const db = storage.db('crawler');    
  const queue = db.collection('queue');

  return await queue.findOne<ToBeVisited>();
}