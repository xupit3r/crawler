import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'whatwg-url';
import { MongoClient } from 'mongodb';
import debug from 'debug';
import { Link, LinkLookup, Page } from './types';
import axiosConfig from './config/axios.json';

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

/**
 * Given a url this will retrieve and process the content, 
 * returning a Page.
 * 
 * @param url the url for which we want to retrieve a Page for
 */
export const processPage = (url: string): Promise<Array<Link>> => {
  return new Promise(async (resolve, reject) => {
    requester.get(url).then(async resp => {
      const html = resp.data;
      const $ = cheerio.load(html);
      const hrefs = $('a').toArray().map(anchor => {
        const [href] = anchor.attributes.filter(attribute => attribute.name === 'href');
        return href ? href.value : '';
      }).filter(link => link).map(link => makeAbsolute(link, url));

      const hostname = getHostname(url);
  
      const page: Page = {
        url: url,
        host: hostname,
        html: html
      };
  
      // add the page to storage for safe keeping
      await storage.connect();
      const db = storage.db('crawler');

      // store the page
      const pages = db.collection('pages');
      await pages.insertOne(page);

      // store the links
      const links = db.collection('links');

      // create an entry for this page
      await links.updateOne({
        url: page.url,
        host: page.host
      }, { $set: {
        source: url,
        sourceHost: hostname,
        host: hostname,
        url: url,
        visited: true,
        status: resp.status
      } }, { upsert: true});

      // update any instances that may exist (so we don't revisit)
      await links.updateMany({ url: url }, { $set: { visited: true, status: resp.status }});

      // handle visited links
      const visitedLinks = await links.find({ visited: { $eq: true }, url: { $in: hrefs }}).toArray();
      const lookup: LinkLookup = visitedLinks.reduce<LinkLookup>((h, link) => {
        h[link.url] = {
          visited: link.visited,
          status: link.status
        };
        return h;
      }, {});

      const pageLinks: Array<Link> = hrefs.map(link => ({
        source: url,
        sourceHost: hostname,
        host: getHostname(link),
        url: link,
        visited: lookup[link] ? lookup[link].visited : false,
        status: lookup[link] ? lookup[link].status: -1
      }));

      // add in all the links found
      await links.insertMany(pageLinks);

      // k, all done
      resolve(pageLinks)
    }).catch((err) => {
      if (err.response) {
        logger(`${url} failed with error code ${err.response.status}`);
      }

      reject(err);
    });
  });
}

export default {
  processPage
}