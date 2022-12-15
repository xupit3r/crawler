import debug from 'debug';
import * as cheerio from 'cheerio';
import { SentimentAnalyzer, PorterStemmer,TreebankWordTokenizer } from 'natural';
import { removeStopwords } from 'stopword';
import { Lookup, PageText, WeightedText } from './types';

const logger = debug('text');

const punctuation = /[!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~]/g;

/**
 * Extracts text from a specified HTML document
 * 
 * @param html the document from which we want to extract text
 * @returns an array of PageText objects
 */
export const extractText = (html: string): Array<PageText> => {
  try {
    const $ = cheerio.load(html);

    // retrieve text nodes in document order
    const pageTexts = $('p,div').contents().map((i, element): PageText => {
      const $el = $(element);
      
      return {
        text: $el.text()
      };
    }).get().filter(node => typeof node.text !== 'undefined');

    return pageTexts;
  } catch (err) {
    if (err instanceof RangeError) {
      logger(`failed to extract text: ${err}`);
    }

    return [];
  }
}

/**
 * Removes pesky punctuation from a string
 * 
 * @param text the text to remove summaries from
 * @returns a string with punctuation removed
 */
export const removePunctuation = (text: string = ''): string => {
  return text.replace(punctuation, '');
}

/**
 * Prepares a normalized set of tokens for the text of a page.
 * 
 * This will also remove stop words and lowercase tokens
 * 
 * @param pageText the page text to tokenize
 * @returns an array of string tokens representing a clean
 * version of the sentence
 */
export const tokenizeSentence = (pageText: PageText): Array<string> => {
  const tokenizer = new TreebankWordTokenizer();
  const tokens = tokenizer.tokenize(removePunctuation(pageText.text)).map(token => token.toLowerCase());
  return removeStopwords(tokens);
}

/**
 * Creates a mapping of token to weighted frequency within the corpus of text.
 * 
 * @param texts the set of page texts to calculate weighted frequency 
 * counts for
 * @returns a lookup of tokens to weighted frequencies
 */
export const getWeightedFrequencies = (texts: Array<PageText>): Lookup => {
  const frequencies = texts.reduce((h: Lookup, pageText: PageText) => {
    const tokens = tokenizeSentence(pageText);

    tokens.forEach(token => {
      if (!h[token]) {
        h[token] = 0;
      }

      h[token]++;
    });

    return h;
  }, {} as Lookup);
  const max = Math.max.apply(Math.max, Object.values(frequencies));
  
  return Object.keys(frequencies).reduce((h: Lookup, key: string) => {
    h[key] = frequencies[key] / max;

    return h;
  }, {})
}

/**
 * For each "sentence" (chunk of text on the page), this will assign
 * a weight for that text relative to the overall corpus of text.
 * 
 * This weight indicates relevance (0 - 1)
 * 
 * @param pageTexts the page texts to calculate weights for
 * @returns an array of weighted page texts
 */
export const addWeights = (pageTexts: Array<PageText>): Array<WeightedText> => {
  const frequencies = getWeightedFrequencies(pageTexts);
  return pageTexts.map((pageText: PageText) => {
    const tokens = tokenizeSentence(pageText);
    const weightedSum = tokens.reduce((sum, token) => {
      return sum + frequencies[token];
    }, 0);

    return {
      pageText: pageText,
      weight: (tokens.length > 0 
        ? weightedSum / tokens.length 
        : 0
      )
    }
  });
}

/**
 * Calculates a relevance threshold for the set of weighted texts
 * 
 * @param weighted the set of weighted texts to calculate threshold for
 * @returns a relevance threshold for the corpus of text
 */
export const calcThreshold = (weighted: Array<WeightedText>): number => {
  const total = weighted.map(w => w.weight).reduce((s, w) => s + w, 0);
  return total / weighted.length;
}

/**
 * Summarizes a corpus of text
 * 
 * @param pageTexts the page texts to summarize
 * @returns a string that represents the page summary or 🤷‍♀️ if no summary 
 * could be generated
 */
export const getSummary = (pageTexts: Array<PageText>): string => {
  const weighted = addWeights(pageTexts);
  const threshold = calcThreshold(weighted);
  const candidates = weighted.sort((a, b) => {
    return b.weight - a.weight;
  }).filter((weighted) => {
    return weighted.weight > threshold;
  });

  const summary = candidates.map(weighted => {
    return weighted.pageText.text?.trim();
  }).slice(0, 2).join('\n')

  return (summary.length
    ? summary
    : '🤷‍♀️'
  );
}