import { crawl } from './lib/crawl';
import { moveLinks, normalizeQueueLinks, moveHTML } from './lib/reconfigure';
import { createIndices } from './lib/indices';

createIndices();

crawl({
  start: '',
  limitTo: ''
});

// moveLinks();
// normalizeQueueLinks();

// moveHTML();