import axios, { AxiosError } from 'axios';
import * as cheerio from 'cheerio';
import debug from 'debug';
import { Link, Page } from './types';
import axiosConfig from './config/axios.json';
import { savePage, updateQueue } from './storage';
import { getHostname, okToStoreResponse, hasProto, makeAbsolute} from './utils';

const requester = axios.create(axiosConfig);

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