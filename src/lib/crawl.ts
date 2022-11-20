import { createClient } from 'redis';
import { getPage } from './page';
import debug from 'debug';
import { Page } from './types';

const logger = debug('crawler');

const storage = createClient({
  url: 'redis://localhost:6380'
});
const subscriber = storage.duplicate();

storage.on('error', (err) => console.log('Redis Client Error', err));
storage.connect();
subscriber.connect();

/**
 * Simple crawler. Give it a URL, it does its thing.
 * 
 * @param start the URL to start crawling from
 */
export const crawl = async (start: string) => {
  logger(`starting with ${start}`);

  getPage(start);

  await subscriber.subscribe('pages', pageString => {
    const page: Page = JSON.parse(pageString);
    page.links.forEach(link => getPage(link));
  });
}