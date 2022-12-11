import { crawl } from './lib/crawl';
import { collectImages } from './lib/learn';
import { fixImageFlags } from './lib/reconfigure';

// crawl({
//   start: '',
//   limitTo: ''
// });

collectImages();

// fixImageFlags();