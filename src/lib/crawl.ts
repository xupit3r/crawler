import { processPage } from './page';
import debug from 'debug';
import { forever } from 'async';
import { getNextLink, getPage, removeFromQueue } from './storage';

const logger = debug('crawler');

/**
 * Simple crawler. Give it a URL, it does its thing.
 * 
 * @param start the URL to start crawling from
 */
export const crawl = async (start: string = '') => {
  if (start.length) {
    const page = await getPage(start);
  
    if (page === null) {
      await processPage(start);
    }

    logger(`starting with ${start}`);
  } else {
    logger('reading from queue');
  }

  forever(async next => {
    const nextVisit = await getNextLink();

    if (nextVisit !== null) {
      const link = nextVisit.url;

      try {
        const page = await processPage(link);
        logger(`retrieved page ${page.url}`);
      } catch (err) {
        logger(`failed to retrieve ${link} -- ${err}`);
      } finally {
        await removeFromQueue(nextVisit.url);
      }

      return setTimeout(next, 250);
    }

    // try again in a bit
    setTimeout(next, 1000);
  }, err => logger(`exiting...${err}`));
}