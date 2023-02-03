import * as dotenv from 'dotenv';
import * as mobilenet from '@tensorflow-models/mobilenet';
import * as tf from '@tensorflow/tfjs-node-gpu';
import { Configuration, OpenAIApi } from 'openai';
import { fetch } from 'undici';
import debug from 'debug';
import sharp from 'sharp';
import { ClassifyState, ImageClassification, ImageLink } from './types';

dotenv.config();

const state: ClassifyState = {};

const logger = debug('classify');

export const loadModel = async () => {
  state.model = await mobilenet.load();
}

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

const OPENAI_PROMPTS = {
  categories: 'provide the top 5 categories for the following text and provide it as a json array only'
};

const ARRAY_MATCHER = /(\[.*\])/;

/**
 * Given some text this function will extract the top 5 categories.
 * 
 * @param text the text from which we wish to extract categories
 * @returns an array of categories for the supplied text or an empty array if 
 * no categories could be assigned
 */
export const categoriesFromText = async (text: string): Promise<Array<string>> => {
  const response = await openai.createCompletion({
    model: 'text-davinci-003',
    prompt: `${OPENAI_PROMPTS.categories}:\n\n${text}`,
    temperature: 0.5,
    max_tokens: 1200,
    top_p: 1.0,
    frequency_penalty: 0.8,
    presence_penalty: 0.0,
  });
  const answer = response.data.choices[0].text;

  if (typeof answer === 'string') {
    const matches = answer.match(ARRAY_MATCHER);

    if (matches) {
      return JSON.parse(matches[0]);
    }
  }

 
  return [];
}

/**
 * Runs an classifier on the supplied image.
 * 
 * @param image the image to classify
 * @param top number of predictions to return (default is 3)
 * @returns an array of possible guesses at what the image contains
 */
export const classify = async (image: Buffer, top: number = 3): Promise<Array<ImageClassification>> => {
  if (!state.model) {
    await loadModel();
  }

  let classification: Array<ImageClassification> = [{
    err: 'no classification'
  }];

  try {
    const sharpImage = sharp(image);

    // make sure it is a format that we can process
    const meta = await sharpImage.metadata();
    if (meta.format === 'gif') {
      return classification;
    }

    const buffer = (meta.format === 'webp'
      ? await sharpImage.png().toBuffer()
      : image
    );

    const tfImage = tf.node.decodeImage(buffer) as tf.Tensor3D;
    const result = await state.model?.classify(tfImage, top);

    tfImage.dispose();

    if (result) {
      classification = result;
    } 
  } catch (err) {
    tf.dispose();
    classification = [{
      err: 'invalid image'
    }];
  }
  

  return classification;
}

/**
 * Given a set of image links, this function will process and return
 * the set of links with categories attached
 * 
 * @param imageLinks the array of image links to process
 * @returns an array of ImageLink objects with categories attached
 */
export const classifyMany = async (imageLinks: Array<ImageLink>): Promise<Array<ImageLink>> => {
  const processed: Array<ImageLink> = [];

  logger(`classifying ${imageLinks.length} images`);

  for (let i = 0; i < imageLinks.length; i++) {
    const imageLink = imageLinks[i];

    try {
      const resp = await fetch(imageLink.url);
      const arrayBuffer = await resp.arrayBuffer();
      
      if (arrayBuffer) {
        const classification: Array<ImageClassification> = await classify(
          Buffer.from(arrayBuffer)
        );
    
        processed.push({
          ...imageLink,
          ...{
            categories: classification.filter(guess => !guess.err)
          }
        });
      }
    } catch (err) {
      logger(`failed to retrieve image ${imageLink.url}`)
    }
  }

  return processed;
}