import axios, { AxiosError, AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import debug from 'debug';
import { Link, Page, WebData, CrawlerError, ErrorGenerated } from './types';
import axiosConfig from './config/axios.json';
import { savePage, saveWebData, updateQueue } from './storage';
import { getHostname, okToStoreResponse, hasProto, normalizeUrl} from './utils';

const requester = axios.create(axiosConfig);

const logger = debug('page');

/**
 * Generates a CrawlerError and Page to store for a given error
 * situation
 * 
 * @param url the URL that generated the error 
 * @param hostname the host of the URL that generated the error
 * @param err an error that was raised (known)
 * @returns ErrorGenerated which contains the Page and CrawlerError
 * associated with the error
 */
const generateError = (url: string, hostname: string, err: unknown): ErrorGenerated => {
  const page: Page = {
    host: hostname,
    url: url,
    type: 'error',
    links: [],
    status: -100
  };

  const crawlerError: CrawlerError = {
    host: hostname,
    url: url,
    status: -100,
    message: '',
    headers: {}
  }

  // if this is an Axios error, attach additional
  // metadata to the Page and CrawlerError
  if (axios.isAxiosError(err) && err.response) {
    page.status = err.response.status;
    crawlerError.status = err.response.status;
    crawlerError.headers = err.response.headers;

    // set the messages
    crawlerError.message = err.message;
  }

  return {
    page,
    crawlerError
  }
}

/**
 * Given a url this will retrieve and process the content, 
 * returning a Page.
 * 
 * @param url the url for which we want to retrieve a Page for
 */
export const processPage = async (url: string) => {
  const hostname = getHostname(url);

  // try just grab the headers, if they are not 
  // of a type that we want to process bail
  try {
    const head = await requester.head(url);

    if (!okToStoreResponse(head)) {
      throw new AxiosError(
        'Will not process',
        'CRAWLER_BAD_RESPONSE_TYPE',
        head.request,
        head
      );
    }
  } catch (err) {
    if (axios.isAxiosError(err) && 
        err.code === 'CRAWLER_BAD_RESPONSE_TYPE') {
      const { page, crawlerError } = generateError(url, hostname, err);
      
      logger(`${url} will not be processed`);

      await savePage(page);
      throw crawlerError;
    }
  }

  try {
    // grab the page
    const resp = await requester.get(url, {
      responseType: 'document'
    });

    // bail if this is not something we want to store
    if (!okToStoreResponse(resp)) {
      throw new AxiosError(
        'Will not process',
        'BAD_RESPONSE_TYPE',
        resp.request,
        resp
      );
    }

    const html = resp.data;
    const $ = cheerio.load(html);
    const hrefs = $('a').toArray().map(anchor => {
      const [href] = anchor.attributes.filter(attribute => attribute.name === 'href');
      return href ? href.value : '';
    }).filter(hasProto).map(link => normalizeUrl(link, url));

    const pageLinks: Array<Link> = hrefs.map(link => ({
      source: url,
      sourceHost: hostname,
      host: getHostname(link),
      url: link
    }));

    const page: Page = {
      host: hostname,
      url: url,
      type: 'html',
      status: resp.status,
      links: pageLinks
    };

    const addedPage = await savePage(page);

    const webData: WebData = {
      data: html,
      page: addedPage._id
    };
    await saveWebData(webData);
    
    await updateQueue(pageLinks);

    return page;
  } catch (err) {
    const { page, crawlerError } = generateError(url, hostname, err);

    logger(`${url} failed with error code ${crawlerError.status}`);
    await savePage(page);
    throw crawlerError;
  }
}

export default {
  processPage
}