import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'whatwg-url';
import { createClient } from 'redis';
import debug from 'debug';
import { Page } from './types';
import axiosConfig from './config/axios.json';

const requester = axios.create(axiosConfig);

const logger = debug('page');

const storage = createClient({
  url: 'redis://localhost:6380'
});
const publisher = storage.duplicate();

storage.on('error', (err) => console.log('Redis Client Error', err));
storage.connect();
publisher.connect();

/**
 * Creates an absolute URL from a possibly relative URL
 * 
 * @param url the URL to possibly make absolute
 * @param base the base/source URL needed to make it absolute
 * @returns an absolute URL
 */
const makeAbsolute = (url: string, base: string): string => {
  const full = new URL(url, base);

  return full.href;
}

/**
 * Given a url this will retrieve and process the content, 
 * returning a Page.
 * 
 * @param url the url for which we want to retrieve a Page for
 */
export const getPage = (url: string) => {
  requester.get(url).then(async resp => {
    const html = resp.data;
    const $ = cheerio.load(html);
    const links = $('a').toArray().map(anchor => {
      const [href] = anchor.attributes.filter(attribute => attribute.name === 'href');
      return href ? href.value : '';
    }).filter(link => link).map(link => makeAbsolute(link, url));

    const page: Page = {
      url: url,
      html: html,
      links: links
    };
    const pageString = JSON.stringify(page);

    logger(`found ${links.length} links in ${url}`);

    await storage.set(url, pageString);
    publisher.publish('pages', pageString)
  }).catch((err) => {
    if (err.response) {
      logger(`${url} failed with error code ${err.response.status}`);
    }
  });
}

export default {
  getPage
}