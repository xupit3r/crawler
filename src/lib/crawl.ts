import { MongoClient } from 'mongodb';
import { processPage } from './page';
import debug from 'debug';
import { ToBeVisited, Page } from './types';
import { forever } from 'async';
import { url } from 'inspector';

const logger = debug('crawler');

const storage = new MongoClient('mongodb://root:root@localhost:27018');

/**
 * Simple crawler. Give it a URL, it does its thing.
 * 
 * @param start the URL to start crawling from
 */
export const crawl = async (start: string = '') => {
  if (url.length) {
    await storage.connect();
    const db = storage.db('crawler');
  
    const pages = db.collection('pages');
    const page = await pages.findOne<Page>({
      url: start
    });
  
    if (page === null) {
      await processPage(start);
    }

    logger(`starting with ${start}`);
  } else {
    logger('reading from queue');
  }

  forever(async next => {
    await storage.connect();
    const db = storage.db('crawler');    
    const queue = db.collection('queue');
    const nextVisit = await queue.findOne<ToBeVisited>();

    if (nextVisit !== null) {
      const link = nextVisit.url;

      try {
        const page = await processPage(link);
        logger(`retrieved page ${page.url}`);
      } catch (err) {
        logger(`failed to retrieve ${link} -- ${err}`);
      } finally {
        await queue.deleteMany({
          url: nextVisit.url
        });
      }

      return setTimeout(next, 250);
    }

    // try again in a bit
    setTimeout(next, 1000);
  }, err => logger(`exiting...${err}`));
}