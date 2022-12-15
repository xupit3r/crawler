import { parentPort } from 'worker_threads';
import debug from 'debug';
import { extractText } from '../text';
import { PageText } from '../types';

const logger = debug('worker:texter')

parentPort?.on('message', ({ html, storage, workerId }) => {
  const pageTexts: Array<PageText> = extractText(html);

  logger('extracted page texts.');
  
  parentPort?.postMessage({
    pageTexts: pageTexts,
    workerId: workerId
  });
});