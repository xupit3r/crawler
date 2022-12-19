import { processPage } from '../page';
import debug from 'debug';
import { addHostToCooldown, removeFromQueue } from '../storage';
import { CrawlerError } from '../types';
import { isCoolDownStatus } from '../utils';
import { parentPort } from 'worker_threads';

const logger = debug('worker:crawler');

parentPort?.on('message', async ({ url, workerId}) => {
  logger(`processing ${url}`);

  try {
    const page = await processPage(url);
    logger(`retrieved page ${page.url}`);
  } catch (err) {
    let crawlerError = err as CrawlerError;

    logger(`failed to retrieve ${url} -- ${crawlerError.message}`);

    if (isCoolDownStatus(crawlerError.status)) {
      const waitTime: number = (typeof crawlerError.headers['retry-After'] !== 'undefined' 
        ? Number.parseInt(crawlerError.headers['retry-After']) 
        : 3600
      );

      try {
        await addHostToCooldown(crawlerError.host, waitTime);
      } catch (err) {
        logger(`failed to add ${crawlerError.host} to cooldown ${err}`);
      }
    }
  }

  try {
    await removeFromQueue(url);
  } catch (err) {
    logger(`failed to remove from the queue ${url} ${err}`)
  }

  parentPort?.postMessage({
    url: url,
    workerId: workerId
  });
});