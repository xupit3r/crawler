import { createClient } from 'redis';
import { MongoClient } from 'mongodb';
import { getPage } from './page';
import debug from 'debug';
import { Page } from './types';

const logger = debug('crawler');

const storage = new MongoClient('mongodb://localhost:27017');

const subscriber = createClient({
  url: 'redis://localhost:6380'
});

subscriber.on('error', (err) => console.log('Redis Client Error', err));
subscriber.connect();

const processPage = async (link: string) => {
  await storage.connect();
  const db = storage.db('crawler');
  const pages = db.collection('pages');

  const page: null | Page = await pages.findOne<Page | null>({
    url: link
  });

  if (!page) {
    getPage(link);
  } else {
    page.links.forEach(link => getPage(link));
  }
}

/**
 * Simple crawler. Give it a URL, it does its thing.
 * 
 * @param start the URL to start crawling from
 */
export const crawl = async (start: string) => {
  logger(`starting with ${start}`);

  getPage(start);
  await subscriber.subscribe('pages', processPage);
}