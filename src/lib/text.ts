import debug from 'debug';
import * as cheerio from 'cheerio';
import { SentimentAnalyzer, PorterStemmer,TreebankWordTokenizer } from 'natural';
import { removeStopwords } from 'stopword';
import { Lookup, PageText, TextRegister, WeightedText } from './types';

const logger = debug('text');

const punctuation = /[!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~]/g;
const spaces = /\s+/g;
const newlines = /(\r\n|\n|\r)/gm;

/**
 * Removes duplicate spaces within the string and any newlines
 * that might be present.
 * 
 * @param text text to "clean"
 * @returns cleaned text
 */
export const cleanText = (text: string): string => {
  return text.replace(spaces, ' ').replace(newlines, ' ').trim()
}

/**
 * Remove duplicates from a corpus of text.
 * 
 * @param pageTexts set of texts to dedupe
 * @returns a version of the text corpus with any duplicated phrases removed
 */
export const dedupe = (pageTexts: Array<PageText>): Array<PageText> => {
  return Object.values(pageTexts.reduce((h: TextRegister, pageText: PageText): TextRegister => {
    if (typeof pageText.text === 'string') {
      h[pageText.text] = pageText;
    }

    return h;
  }, {}));
}

/**
 * Extracts text from a specified HTML document
 * 
 * @param html the document from which we want to extract text
 * @returns an array of PageText objects
 */
export const extractText = (html: string): Array<PageText> => {
  try {
    const $ = cheerio.load(html);    
    const allParagraphs = $('body p');
    const text = allParagraphs.map((i, element): PageText => {
      return {
        text: cleanText($(element).text())
      };
    }).get().filter((pageText: PageText) => {
      return (
        typeof pageText.text !== 'undefined' &&
        pageText.text.split(/\s/).length > 1
      )
    });

    // now, keep text around that seems relevant to the general
    // corpus of text found withing the document. not a summary,
    // but just an attempt to keep the text gathered sane...
    const base = dedupe(text);
    const weighted = addWeights(base);
    const threshold = calcThreshold(weighted);
    const candidates = weighted.filter((value: WeightedText) => {
      return value.weight >= threshold;
    });

    return candidates.map(weighted => {
      return {
        text: weighted.pageText.text?.trim()
      };
    });
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
export const tokenizePageText = (pageText: PageText): Array<string> => {
  const tokenizer = new TreebankWordTokenizer();
  const noPunct = removePunctuation(pageText.text)
  const tokens = tokenizer.tokenize(noPunct).map(token => token.toLowerCase());
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
    const tokens = tokenizePageText(pageText);

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
    const tokens = tokenizePageText(pageText);
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
export const calcSummary = (pageTexts: Array<PageText>): string => {
  if (pageTexts.length === 1) {
    return (pageTexts[0].text || '🤷‍♀️');
  }

  const weighted = addWeights(pageTexts);
  const threshold = calcThreshold(weighted);
  const candidates = weighted.sort((a, b) => {
    return b.weight - a.weight;
  }).filter((weighted) => {
    return weighted.weight > threshold;
  });

  const summary = candidates.map(weighted => {
    return weighted.pageText.text?.trim();
  }).slice(0, 2).join('\n');

  return (summary.length
    ? summary
    : '🤷‍♀️'
  );
}


/**
 * Given a set of page text documents, this will calculate the 
 * sentiment of each page text
 * 
 * @param pageTexts the texts to calculate sentiment for
 * @return an array of page text documents with sentiment calculations
 * added
 */
export const calcSentiment = (pageTexts: Array<PageText>): Array<PageText> => {
  const analyzer = new SentimentAnalyzer('English', PorterStemmer, 'afinn');

  return pageTexts.map(pageText => {
    const tokens: Array<string> = tokenizePageText(pageText);
    pageText.sentiment = analyzer.getSentiment(tokens);
    return pageText;
  });
}