import { MongoClient } from "mongodb";
import debug from 'debug';
import { Page, Link, ToBeVisited } from './types';

const logger = debug('storage');

const storage = new MongoClient('mongodb://root:root@localhost:27018');

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