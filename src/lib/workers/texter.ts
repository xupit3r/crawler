import { parentPort } from 'worker_threads';
import debug from 'debug';
import { getPageContent, prepareLinks } from '../page';
import { extractText } from '../text';
import { storage } from '../storage';
import { ObjectId } from 'mongodb';
import { CrawlerError } from '../types';

const logger = debug('worker:texter')

parentPort?.on('message', async ({ pageId, workerId }) => {
  await storage.connect();
  const db = storage.db('crawler');
  const pages = db.collection('pages');
  const webdata = db.collection('webdata');

  try {
    const dataDoc = await webdata.findOne({
      page: new ObjectId(pageId)
    });

    const page = await pages.findOne({
      _id: new ObjectId(pageId)
    });

    if ((!dataDoc || dataDoc.data.length === 0) && 
         (page && page.type !== 'error' && page.type !== 'other')) {
      const content = await getPageContent(page.url);
      const links = prepareLinks(page.url, page.host, content.links);

      await pages.updateOne({
        _id: new ObjectId(pageId)
      }, {
        $set: {
          type: 'html',
          links: links
        }
      });
  
      await webdata.updateOne({
        page: new ObjectId(pageId)
      }, {
        $set: {
          data: content.html
        }
      }, { upsert: true });

      parentPort?.postMessage({
        pageTexts: extractText(content.html),
        workerId: workerId
      });
    } else if (dataDoc && dataDoc.data.length) {
      parentPort?.postMessage({
        pageTexts: extractText(dataDoc.data),
        workerId: workerId
      });
    } else {
      parentPort?.postMessage({
        pageTexts: [],
        workerId: workerId
      });
    }
  } catch (err) {
    const error = err as CrawlerError;

    logger(`ERROR -- ${error.message}`);

    parentPort?.postMessage({
      pageTexts: [],
      workerId: workerId
    });
  }
});