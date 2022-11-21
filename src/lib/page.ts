import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'whatwg-url';
import { createClient } from 'redis';
import { MongoClient } from 'mongodb';
import debug from 'debug';
import { Page } from './types';
import axiosConfig from './config/axios.json';

const requester = axios.create(axiosConfig);

const logger = debug('page');

const storage = new MongoClient('mongodb://localhost:27017');

const publisher = createClient({
  url: 'redis://localhost:6380'
});

publisher.on('error', err => logger('publisher error', err));
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
export const getPage = async (url: string) => {
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

    await storage.connect();
    
    // keep the page in storage
    const db = storage.db('crawler');
    const pages = db.collection('pages');
    await pages.insertOne(page);
    
    // send it aht for procesing
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