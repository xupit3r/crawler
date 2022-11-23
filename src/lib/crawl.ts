import { MongoClient } from 'mongodb';
import { processPage } from './page';
import debug from 'debug';
import { Link, Page } from './types';
import { forever } from 'async';

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

  await storage.connect();
  const db = storage.db('crawler');

  const pages = db.collection('pages');
  const page = pages.findOne<Page>({
    url: start
  });

  if (page == null) {
    await processPage(start);
  }

  forever(async next => {
    if (STATE.processing < 4) {
      const links = db.collection('links');
      const unvisited = await links.findOne<Link>({
        status: {
          $eq: -1
        },
        visited: {
          $ne: true
        }
      });

      if (unvisited !== null) {
        const link = unvisited.url;

        try {
          STATE.processing++;
          await processPage(link);
          logger(`retrieved page ${link}`);
        } catch (err) {
          logger(`failed to retrieve ${link} -- ${err}`);
        } finally {
          STATE.processing--;
        }
  
        return setTimeout(next, 250);
      } else {
        logger(`nop`)
      }
    }

    // try again in a bit
    setTimeout(next, 1000);
  }, err => logger(`exiting...${err}`));
}