import axios, { AxiosError, AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'whatwg-url';
import { MongoClient } from 'mongodb';
import debug from 'debug';
import { Link, Page } from './types';
import axiosConfig from './config/axios.json';
import { savePage, updateQueue } from './storage';
import { hostname } from 'os';

const requester = axios.create(axiosConfig);

const logger = debug('page');

const storage = new MongoClient('mongodb://root:root@localhost:27018');

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

const getHostname = (url: string): string => {
  const parsed = new URL(url);

  return parsed.hostname;
}

const hasProto = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return !!parsed.protocol;
  } catch (err) {
    return false;
  }
}

const okToStoreResponse = (response: AxiosResponse) => {
  if (typeof response.headers['content-type'] === 'string') {
    return response.headers['content-type'].indexOf('text/html') > -1;
  }

  return false;
}

/**
 * Given a url this will retrieve and process the content, 
 * returning a Page.
 * 
 * @param url the url for which we want to retrieve a Page for
 */
export const processPage = (url: string): Promise<Page> => {
  const hostname = getHostname(url);

  return new Promise((resolve, reject) => {
    requester.get(url).then(async resp => {

      // if we are not going to store the response
      // then just create an "other" entry and bail
      if (!okToStoreResponse(resp)) {
        const page: Page = {
          host: hostname,
          url: url,
          type: 'other',
          data: '',
          status: resp.status
        };

        await savePage(page);

        return resolve(page);
      }

      const html = resp.data;
      const $ = cheerio.load(html);
      const hrefs = $('a').toArray().map(anchor => {
        const [href] = anchor.attributes.filter(attribute => attribute.name === 'href');
        return href ? href.value : '';
      }).filter(hasProto).map(link => makeAbsolute(link, url));
  
      const page: Page = {
        host: hostname,
        url: url,
        type: 'html',
        data: html,
        status: resp.status
      };

      const pageLinks: Array<Link> = hrefs.map(link => ({
        source: url,
        sourceHost: hostname,
        host: getHostname(link),
        url: link
      }));

      // update our storage with the page/links
      // and add any new links to the queue
      await savePage(page, pageLinks);
      await updateQueue(pageLinks);

      resolve(page);
    }).catch(async (err: AxiosError) => {
      const page: Page = {
        host: getHostname(url),
        url: url,
        type: 'error',
        data: err.message,
        status: -100
      };

      if (err.response) {
        page.status = err.response.status;
      }

      await savePage(page);

      logger(`${url} failed with error code ${err}`);

      reject(err);
    });
  })
}

export default {
  processPage
}