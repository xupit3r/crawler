import { crawl } from './lib/crawl';
import { createIndices } from './lib/indices';

createIndices();

crawl({
  start: '',
  limitTo: ''
});