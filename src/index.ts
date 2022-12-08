import { crawl } from './lib/crawl';
import { moveLinks, normalizeQueueLinks } from './lib/reconfigure';
import { createIndices } from './lib/indices';

createIndices();

crawl({
  start: '',
  limitTo: ''
});

// moveLinks();
// normalizeQueueLinks();