import { exit } from 'process';
import { crawl } from './lib/crawl';
import { updateIndices, combineImages } from './lib/reconfigure';
import { collectImages, collectText, summarizeText, addSentiment, addTermFrequencies, addPageTags, splitTerms } from './lib/learn';

const [ type ] = process.argv.slice(2);

if (type === 'crawl') {
  crawl({
    start: '',
    limitTo: ''
  });
} else if (type === 'collectImages') {
  collectImages();
} else if (type === 'collectText') {
  collectText();
} else if (type === 'updateIndices') {
  updateIndices();
} else if (type === 'combineImages') {
  combineImages();
} else if (type === 'summarizeText') {
  summarizeText();
} else if (type === 'addSentiment') {
  addSentiment();
} else if (type === 'addTermFrequencies') {
  addTermFrequencies();
} else if (type === 'addPageTags') {
  addPageTags();
} else if (type === 'splitTerms') {
  splitTerms();
} else {
  console.log(`argument type did not match a valid value`);
  exit(1);
}

