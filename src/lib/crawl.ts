import { MongoClient } from 'mongodb';
import { processPage } from './page';
import debug from 'debug';
import { Link, Page } from './types';
import { forever } from 'async';

const LINKS: Array<string> = [];
const STATE = {
  processing: 0
};

const logger = debug('crawler');

const storage = new MongoClient('mongodb://root:root@localhost:27018');

/**
 * Simple crawler. Give it a URL, it does its thing.
 * 
 * @param start the URL to start crawling from
 */
export const crawl = async (start: string) => {
  logger(`starting with ${start}`);

  LINKS.push(start);

  await storage.connect();

  const db = storage.db('crawler');
  const links = db.collection('links');
  const unvisited = await links.find({
    visited: {
      $ne: true
    }
  }).toArray();

  unvisited.forEach(({url}) => LINKS.push(url));
  
  forever(async next => {
    if (LINKS.length > 0 && STATE.processing < 10) {
      const link = LINKS.shift();

      if (typeof link === 'string') {
        const db = storage.db('page');
        const pages = db.collection('pages');
        const page: null | Page = await pages.findOne<Page>({ url: link});
        
        if (page) {
          return next();
        }

        try {
          STATE.processing++;
          const links: Array<Link> = await processPage(link);
          links.filter(link => !link.visited).forEach(({url}) => LINKS.push(url));
          logger(`retrieved page ${link}`);
        } catch (err) {
          logger(`failed to retrieve ${link}`)
        } finally {
          STATE.processing--;
        }

        return setTimeout(next, 500);

      }
    }

    // try again in a bit
    setTimeout(next, 1000);
  }, err => logger(`exiting...${err}`));
}