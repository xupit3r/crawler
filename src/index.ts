import { getPage } from './lib/page';

getPage('http://thejoeshow.net').then(page => console.log(page));