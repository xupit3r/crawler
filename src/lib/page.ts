import axios from 'axios';
import * as cheerio from 'cheerio';
import { v4 as uuid } from 'uuid';
import { URL } from 'whatwg-url';
import debug from 'debug';
import { Page } from './types';
import axiosConfig from './config/axios.json';

const requester = axios.create(axiosConfig);

const logger = debug('page');

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
 * @returns a Page that contains information on the requested page
 */
export const getPage = (url: string): Promise<Page> => {
  return new Promise((resolve, reject) => {
    requester.get(url).then(resp => {
      const html = resp.data;
      const $ = cheerio.load(html);
      const links = $('a').toArray().map(anchor => {
        const [href] = anchor.attributes.filter(attribute => attribute.name === 'href');
        return href ? href.value : '';
      }).filter(link => link).map(link => makeAbsolute(link, url));

      logger(`found ${links.length} in ${url}`);

      resolve({
        uuid: uuid(),
        url: url,
        html: html,
        links: links
      });
    }).catch((err) => {
      if (err.response) {
        logger(`${url} failed with error code ${err.response.status}`);
        return reject(new Error(err.response.data));
      }
    });
  });
}

export default {
  getPage
}