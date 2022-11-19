import axios from 'axios';
import * as cheerio from 'cheerio';
import { v4 as uuid } from 'uuid';
import { URL } from 'whatwg-url';

type Page = {
  uuid: string,
  url: string,
  html: string 
  links: Array<string>
}

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
    axios.get(url).then(resp => {
      const html = resp.data;
      const $ = cheerio.load(html);
      const links = $('a').toArray().map(anchor => {
        const [href] = anchor.attributes.filter(attribute => attribute.name === 'href');
        return makeAbsolute(href.value, url);
      });

      resolve({
        uuid: uuid(),
        url: url,
        html: html,
        links: links
      });
    }).catch(reject);
  });
}

export default {
  getPage
}