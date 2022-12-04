import axios, { AxiosError } from 'axios';
import * as cheerio from 'cheerio';
import debug from 'debug';
import { Link, Page, CrawlerError } from './types';
import axiosConfig from './config/axios.json';
import { savePage, updateQueue } from './storage';
import { getHostname, okToStoreResponse, hasProto, normalizeUrl} from './utils';

const requester = axios.create(axiosConfig);

const logger = debug('page');

/**
 * Given a url this will retrieve and process the content, 
 * returning a Page.
 * 
 * @param url the url for which we want to retrieve a Page for
 */
export const processPage = async (url: string) => {
  const hostname = getHostname(url);

  try {

    // perform a preflight request to see if this is 
    // something we want to handle, bail if not
    const preflight = await requester.options(url);
    
    if (!okToStoreResponse(preflight)) {
      throw new AxiosError(
        'Will not process',
        'BAD_RESPONSE_TYPE',
        preflight.request,
        preflight
      );
    }

    const resp = await requester.get(url);
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

    return page;
  } catch (err) {
    const page: Page = {
      host: hostname,
      url: url,
      type: 'error',
      data: '',
      status: -100
    };

    const crawlerError: CrawlerError = {
      host: hostname,
      url: url,
      status: -100,
      message: '',
      headers: {}
    }

    if (axios.isAxiosError(err) && err.response) {
      page.status = err.response.status;
      crawlerError.status = err.response.status;
      crawlerError.headers = err.response.headers;

      // set the messages
      page.data = err.message;
      crawlerError.message = err.message;
    }

    await savePage(page);

    logger(`${url} failed with error code ${crawlerError.status}`);

    return crawlerError;
  }
}

export default {
  processPage
}