import * as mobilenet from '@tensorflow-models/mobilenet';
import * as tf from '@tensorflow/tfjs-node';
import { fetch } from 'undici';
import debug from 'debug';
import sharp from 'sharp';
import { ClassifyState, ImageClassification, ImageLink } from './types';

const state: ClassifyState = {};

const logger = debug('classify');

export const loadModel = async () => {
  state.model = await mobilenet.load();
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