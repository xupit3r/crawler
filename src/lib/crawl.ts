import { getPage } from './page';
import debug from 'debug';
import { Page } from '../types/page';

const logger = debug('crawler');

const processPage = (page: Page) => {
  page.links.forEach(link => crawl(link));
}

/**
 * Simple crawler. Give it a URL, it does its thing.
 * 
 * @param start the URL to start crawling from
 */
export const crawl = (start: string) => {
  logger(`starting with ${start}`);

  getPage(start).then(processPage).catch(err => logger(`failed to process ${start}`));
}