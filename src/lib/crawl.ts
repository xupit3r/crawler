import { processPage } from './page';
import debug from 'debug';
import { exit } from 'process';
import { v4 as uuid } from 'uuid';
import { getNextLink, getPage, cleanup } from './storage';
import { CrawlerOptions, WorkerRegister } from './types';
import { Worker } from 'worker_threads';
import { sleep } from './utils';

const logger = debug('crawler');

const MAX_WORKERS = 5;
const WORKER_SCRIPT = './src/lib/workers/crawler.js';
const workers: WorkerRegister = {};

const state = {
  exiting: false,
  exited: false,
  tries: 0
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
  }

  while (!state.exiting) {
    if (Object.keys(workers).length < MAX_WORKERS) {
      try {
        const nextVisit = await getNextLink(options.limitTo);
  
        if (nextVisit !== null) {
          const workerId = uuid();
          const worker = new Worker(WORKER_SCRIPT);
          
          logger(`STARTING: spawing worker ${workerId} to process ${nextVisit.url}`);
    
          worker.postMessage({
            url: nextVisit.url,
            workerId: workerId
          });
    
          workers[workerId] = worker;
    
          worker.on('message', async ({ workerId, url }) => {
            logger(`COMPLETE: worker ${workerId} processed ${url}`);
            await workers[workerId].terminate();
            delete workers[workerId];
          });
        }
      } catch (err) {
        logger(`crawler received err ${err}`);
      }
    } else {
      await sleep(50);
    }
  }
}

const gracefulExit = async () => {
  state.exiting = true;

  if (!state.exited) {
    logger('cleaning up before exit...');
  
    // if everything already exited, we are done
    if (Object.keys(workers).length === 0) {
      await cleanup();
      exit();
    }
  
    // otheriwse, wait for any running workers to exit...
    while (Object.keys(workers).length !== 0 && !state.exited) {
      // if we waited for 5 seconds and there are still
      // workers, we are going to terminate them and then 
      // cleanup the DB
      if (state.tries === 10) {
        const workerIds = Object.keys(workers);
  
        logger('terminating unresponsive threads...');
  
        for (let i = 0; i < workerIds.length; i++) {
          const workerId = workerIds[i];
          if (workerId) {
            await workers[workerId].terminate();
            delete workers[workerId];
          }
        }
  
        await cleanup();
  
        state.exited = true;
        exit(1);
      }
  
      state.tries++;
      await sleep(50);
    }
  }
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