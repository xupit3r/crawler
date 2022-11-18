import axios from 'axios';
import * as cheerio from 'cheerio';
import { v4 as uuid } from 'uuid';

type Page = {
  uuid: string,
  url: string,
  html: string 
  links: Array<string>
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
        return href.value;
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