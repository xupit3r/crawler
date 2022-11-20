import { getPage } from './page';
import debug from 'debug';
import { Page, Crawled } from './types';

const logger = debug('crawler');

const crawled: Crawled = {};

/**
 * Initiates a crawl on a particular page
 * 
 * @param page the page to process
 */
const processPage = (page: Page) => {
  page.links.filter(link => !crawled[link]).forEach(link => crawl(link));
}

/**
 * Simple crawler. Give it a URL, it does its thing.
 * 
 * @param start the URL to start crawling from
 */
export const crawl = (start: string) => {
  logger(`starting with ${start}`);

  crawled[start] = true;

  getPage(start).then(processPage).catch(err => logger(`failed to process ${start}`));
}