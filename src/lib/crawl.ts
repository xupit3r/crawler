import { processPage } from './page';
import debug from 'debug';
import { forever } from 'async';
import { addHostToCooldown, getNextLink, getPage, removeFromQueue } from './storage';
import { CrawlerError, CrawlerOptions } from './types';
import { isCoolDownStatus } from './utils';

const logger = debug('crawler');

const requests: Array<() => Promise<Boolean>> = [];

const MAX_REQUESTS = 5;

/**
 * Simple crawler. Give it a URL, it does its thing.
 * 
 * @param options a set of options for the crawler:
 * 
 *  start: a URL to start at
 *  limitTo: a hostname to limit crawling to
 */
export const crawl = async (options: CrawlerOptions) => {
  if (options.start.length) {
    const page = await getPage(options.start);
  
    if (page === null) {
      await processPage(options.start);
    }

    logger(`starting with ${options.start}`);
  } else {
    logger('reading from queue');
  }

  forever(next => {

    if (requests.length < MAX_REQUESTS) {
      const currentIdx = requests.length - 1;

      requests.push(async () :Promise<Boolean> => {
        const nextVisit = await getNextLink(options.limitTo);

        if (nextVisit !== null) {
          const link = nextVisit.url;
          
          logger(`processing ${link}`);
    
          try {
            const page = await processPage(link);
            logger(`retrieved page ${page.url}`);
          } catch (err) {
            let crawlerError = err as CrawlerError;
    
            logger(`failed to retrieve ${link} -- ${crawlerError.message}`);
    
            if (isCoolDownStatus(crawlerError.status)) {
              const waitTime: number = (typeof crawlerError.headers['Retry-After'] !== 'undefined' 
                ? Number.parseInt(crawlerError.headers['Retry-After']) 
                : 3600
              );
    
              await addHostToCooldown(crawlerError.host, waitTime);
            }
          } finally {
            await removeFromQueue(nextVisit.url);
          }
        }


        return true;
      });

      requests[requests.length - 1]().then(() => {
        requests.splice(currentIdx, 1);
      });

      return setTimeout(next, 200);
    }

    // try again in a bit
    setTimeout(next, 1000);
  }, err => logger(`exiting...${err}`));
}