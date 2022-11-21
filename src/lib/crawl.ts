import { MongoClient } from 'mongodb';
import { getPage } from './page';
import debug from 'debug';
import { Page } from './types';
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
  
  forever(async next => {
    if (LINKS.length > 0 && STATE.processing < 10) {
      const link = LINKS.shift();

      if (typeof link === 'string') {
        await storage.connect();
        const db = storage.db('crawler');
        const pages = db.collection('pages');
      
        const page: null | Page = await pages.findOne<Page | null>({
          url: link
        });

        if (page) {  
          page.links.forEach(link => LINKS.push(link));
        } else {
          try {
            STATE.processing++;
            const page: Page = await getPage(link);
            logger(`retrieved page ${page.url}`);
          } catch (err) {
            logger(`failed to retrieve ${link}`)
          } finally {
            STATE.processing--;
          }
        }

        setTimeout(next, 250);
      } else {
        setTimeout(next, 1000);
      }
    } else {
      setTimeout(next, 1000);
    }
  }, err => logger(`exiting...${err}`));
}