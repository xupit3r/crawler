import axios, { AxiosError } from 'axios';
import * as cheerio from 'cheerio';
import debug from 'debug';
import { Link, Page, CrawlerError } from './types';
import axiosConfig from './config/axios.json';
import { savePage, updateQueue } from './storage';
import { getHostname, okToStoreResponse, hasProto, normalizeUrl} from './utils';

const requester = axios.create(axiosConfig);


// prevent handling of responses that are not HTML
axios.interceptors.response.use((response) => {
  if (!okToStoreResponse(response)) {
    return response;
  }

  return Promise.reject(new Error('cannot process'));
}, (error) => {
  return Promise.reject(error);
});

const logger = debug('page');

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
      }).filter(hasProto).map(link => normalizeUrl(link, url));
  
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
      const host = getHostname(url);

      const page: Page = {
        host: host,
        url: url,
        type: 'error',
        data: err.message,
        status: -100
      };

      const crawlerError: CrawlerError = {
        host: host,
        url: url,
        status: -100,
        message: err.message,
        headers: {}
      }

      if (err.response) {
        page.status = err.response.status;
        crawlerError.status = err.response.status;
        crawlerError.headers = err.response.headers;
      }

      await savePage(page);

      logger(`${url} failed with error code ${crawlerError.status}`);

      reject(crawlerError);
    });
  })
}

export default {
  processPage
}