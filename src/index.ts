import { crawl } from './lib/crawl';
import { addImageClassification } from './lib/learn';
import { getMissingHTML } from './lib/reconfigure';

crawl({
  start: '',
  limitTo: ''
});

// addImageClassification();

// getMissingHTML();