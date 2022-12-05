import { processPage } from './page';
import debug from 'debug';
import { exit } from 'process';
import { forever } from 'async';
import { v4 as uuid } from 'uuid';
import { getNextLink, getPage, cleanup } from './storage';
import { CrawlerOptions, WorkerRegister } from './types';
import { Worker } from 'worker_threads';

const logger = debug('crawler');

const MAX_WORKERS = 5;
const workers: WorkerRegister = {};

const state = {
  exiting: false
};

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

  forever(async next => {
    try {
      if (Object.keys(workers).length < MAX_WORKERS && !state.exiting) {
        const nextVisit = await getNextLink(options.limitTo);
  
        if (nextVisit !== null) {
          const workerId = uuid();
          const worker = new Worker('./src/lib/worker.js');
          
          logger(`STARTING: spawing worker ${workerId} to process ${nextVisit.url}`);
    
          worker.postMessage({
            url: nextVisit.url,
            workerId: workerId
          });
    
          workers[workerId] = worker;
    
          worker.on('message', ({ workerId, url }) => {
            logger(`COMPLETE: worker ${workerId} processed ${url}`);
            delete workers[workerId];
          });
        }
      }
    } catch (err) {
      logger(`crawler received err ${err}`);
    }

    setTimeout(next, 200);
  }, err => logger(`exiting...${err}`));
}

const gracefulExit = async () => {
  state.exiting = true;

  logger('cleaning up before exit...');

  // wait for any running workers to exit...
  forever(async next => {
    if (Object.keys(workers).length === 0) {
      await cleanup();
      exit();
    }

    setTimeout(next, 25);
  }, err => exit(1));
}

//do something when app is closing
process.on('exit', async () => {
  logger('EXITING -- exit');
  await gracefulExit();
});

//catches ctrl+c event
process.on('SIGINT', async () => {
  logger('EXITING -- SIGINT');
  await gracefulExit();
});

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', async () => {
  logger('EXITING -- SIGUSR1');
  await gracefulExit();
});
process.on('SIGUSR2', async () => {
  logger('EXITING -- SIGUSR2');
  await gracefulExit();
});

//catches uncaught exceptions
process.on('uncaughtException', async (err) => {
  logger('EXITING -- uncaughtException');
  console.error(err);
  await gracefulExit();
});