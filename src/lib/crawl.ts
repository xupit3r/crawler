import { createClient } from 'redis';
import { getPage } from './page';
import debug from 'debug';
import { Page } from './types';

const logger = debug('crawler');

const subscriber = createClient({
  url: 'redis://localhost:6380'
});

subscriber.on('error', (err) => console.log('Redis Client Error', err));
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