import { crawl } from './lib/crawl';
import { addImageClassification } from './lib/learn';
import { getMissingHTML } from './lib/reconfigure';
import { createIndices } from './lib/indices';

createIndices();

// crawl({
//   start: '',
//   limitTo: ''
// });

addImageClassification();

// getMissingHTML();