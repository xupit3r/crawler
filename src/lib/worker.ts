import { processPage } from './page';
import debug from 'debug';
import { addHostToCooldown, removeFromQueue } from './storage';
import { CrawlerError } from './types';
import { isCoolDownStatus } from './utils';
import { parentPort } from 'worker_threads';

const logger = debug('crawler:worker');

parentPort?.on('message', async ({ url, workerId}) => {
  logger(`processing ${url}`);

  try {
    const page = await processPage(url);
    logger(`retrieved page ${page.url}`);
  } catch (err) {
    let crawlerError = err as CrawlerError;

    logger(`failed to retrieve ${url} -- ${crawlerError.message}`);

    if (isCoolDownStatus(crawlerError.status)) {
      const waitTime: number = (typeof crawlerError.headers['Retry-After'] !== 'undefined' 
        ? Number.parseInt(crawlerError.headers['Retry-After']) 
        : 3600
      );

      await addHostToCooldown(crawlerError.host, waitTime);
    }
  }


  await removeFromQueue(url);

  parentPort?.postMessage({
    url: url,
    workerId: workerId
  });
});