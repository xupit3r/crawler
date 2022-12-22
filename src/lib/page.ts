import puppeteer, { HTTPResponse, TimeoutError } from 'puppeteer';
import { fetch, Response } from 'undici';
import debug from 'debug';
import { Link, Page, WebData, CrawlerError, ErrorGenerated, RequestError, HTMLContent } from './types';
import { savePage, saveWebData, updateQueue } from './storage';
import { getHostname, okToStoreResponse, normalizeUrl, isBadExtension, hasProto} from './utils';

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
const generateError = (url: string, hostname: string, err: RequestError): ErrorGenerated => {
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
    message: err.message,
    headers: {}
  };

  // if this is an Axios error, attach additional
  // metadata to the Page and CrawlerError
  if (err.response) {
    if (err.response instanceof Response) {
      const headers: Partial<Record<string, string>> = {};
  
      for (const pair of err.response.headers.entries()) {
        headers[pair[0].toLowerCase()] = pair[1];
      }
  
      page.status = err.response.status;
      crawlerError.status = err.response.status;
      crawlerError.headers = headers;
    } else if (err instanceof HTTPResponse) {
      page.status = err.response.status();
      crawlerError.status = err.response.status();
      crawlerError.headers = err.response.headers();
    }
  }

  return {
    page,
    crawlerError
  }
}

/**
 * Pulls the page and grabs any relevant content for storage
 * 
 * @param url the url to retrieve content for
 * @returns an HTMLContent object that contains the html and any links
 */
export const getPageContent = async (url: string): Promise<HTMLContent> => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  try {
    const response: HTTPResponse = await page.goto(url) as HTTPResponse;

    if (!okToStoreResponse(response)) {
      throw {
        message: 'will not process',
        type: 'CRAWLER_BAD_RESPONSE_TYPE',
        url: url,
        response: response
      };
    }
  
    await page.waitForNetworkIdle({
      idleTime: 1000
    });
  
    const html = await page.$eval('html', (el) => el.outerHTML);
    const links = await page.$$eval('a', (anchors) => anchors.map(a => a.href));
    
    await browser.close();
  
    return {
      html: html,
      links
    } as HTMLContent;
  } catch (err) {
    await browser.close();

    if (err instanceof TimeoutError) {
      throw {
        message: err.message || 'request timed out',
        type: 'TIMEOUT_ERROR',
        url: url
      };
    }

    throw err;
  }
}

/**
 * Prepares an array of links found within a page's HTML
 * 
 * @param url the page url
 * @param hostname the page hostname
 * @param links links found in page
 * @returns an array of Link objects associated with the page
 */
export const prepareLinks = (url: string, hostname: string, links: Array<string>): Array<Link> => {
  return links.filter(hasProto).map(link => ({
    source: url,
    sourceHost: hostname,
    host: getHostname(link),
    url: normalizeUrl(link, '')
  }));
}

/**
 * Given a url this will retrieve and process the content, 
 * returning a Page.
 * 
 * @param url the url for which we want to retrieve a Page for
 */
export const processPage = async (url: string) => {
  const hostname = getHostname(url);

  // just do a quick check of the extension
  // before we attempt anything
  if (isBadExtension(url)) {
    await savePage({
      host: hostname,
      url: url,
      type: 'error',
      links: [],
      status: -100
    });

    logger(`failed for a bad extension: ${url}`);

    throw {
      host: hostname,
      url: url,
      status: -100,
      message: 'Bad Extension: may be a large file',
      headers: {}
    } as CrawlerError;
  }

  // try just grab the headers, if they are not 
  // of a type that we want to process bail
  try {
    const head = await fetch(url, { method: 'HEAD' });

    if (!okToStoreResponse(head)) {
      throw {
        message: 'Will not process',
        type: 'CRAWLER_BAD_RESPONSE_TYPE',
        url: url,
        response: head
      };
    }
  } catch (err) {
    const error: RequestError = err as RequestError;

    if (error.type === 'CRAWLER_BAD_RESPONSE_TYPE') {
      const { page, crawlerError } = generateError(url, hostname, error);
      
      logger(`${url} will not be processed`);

      await savePage(page);
      throw crawlerError;
    }
  }

  try {
    // try to grab the page
    const content = await getPageContent(url);

    const pageLinks: Array<Link> = prepareLinks(url, hostname, content.links);

    const page: Page = {
      host: hostname,
      url: url,
      type: 'html',
      links: pageLinks
    };

    const addedPage = await savePage(page);

    const webData: WebData = {
      data: content.html,
      page: addedPage._id
    };

    await saveWebData(webData);

    await updateQueue(pageLinks);

    return page;
  } catch (err) {
    const { page, crawlerError } = generateError(url, hostname, err as RequestError);

    logger(`${url} failed with error code ${crawlerError.status} -- ${crawlerError.message}`);
    await savePage(page);
    throw crawlerError;
  }
}

export default {
  processPage
}