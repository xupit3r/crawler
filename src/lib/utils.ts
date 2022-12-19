import path from 'path';
import { HTTPResponse } from 'puppeteer';
import { Response } from 'undici';
import { URL } from 'whatwg-url';

const BAD_EXTENSIONS = [
  'json',
  'csv',
  'xml'
];

/**
 * Creates an absolute URL from a possibly relative URL
 * 
 * @returns an absolute URL
 * @param url the URL to possibly make absolute
 * @param base the base/source URL needed to make it absolute
 */
 export const normalizeUrl = (url: string, base: string): string => {
  try {
    const full = base.length ? new URL(url, base) : new URL(url);
  
    // do not include hashes...
    full.hash = '';
  
    return full.href;
  } catch (err) {
    return '';
  }
}

export const removeHash = (url: string) =>{
  const full = new URL(url);
  full.hash = '';
  return full.href;
}

/**
 * Retrieves the hostname from a supplied url
 * 
 * @param url the url to pull the host from
 * @returns the hostname
 */
export const getHostname = (url: string): string => {
  const parsed = new URL(url);

  return parsed.hostname;
}

/**
 * Determines if a URL has a protocol or not
 * 
 * @param url the URL to determin if it has a protocol
 * @returns true if the URL has a protocol false otherwise
 */
export const hasProto = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return !!parsed.protocol;
  } catch (err) {
    return false;
  }
}

/**
 * Determines if a response is OK to be store.
 * 
 * NOTE: right now it is just flagging HTML responses
 * 
 * @param response the response to check
 * @returns true if the response is OK, false otherwise
 */
export const okToStoreResponse = (response: Response | HTTPResponse) => {
  const checks = {
    contentType: false
  };

  let contentType = '';

  if (response instanceof Response) {
    contentType = (response.headers.get('content-type') || '');
  } else {
    const headers = response.headers();
    contentType = (headers['content-type'] || '')
  }

  checks.contentType = contentType.indexOf('text/html') > -1;

  return checks.contentType;
}

/**
 * Checks for an obviously bad URL (to avoid LARGE file 
 * downloads... hopefully)
 * 
 * @param requestUrl the url we are attempting to request
 * @returns true if the extension is bad...
 */
export const isBadExtension = (requestUrl: string) => {
  const url = new URL(requestUrl);
  const extension = path.extname(url.pathname);
  
  return BAD_EXTENSIONS.includes(extension);
}

/**
 * Determines if a supplied status is that of a "cooldown"
 * type (e.g. "Too many requests" - 429)
 * 
 * @param status the status to check
 * @returns true if this is a cooldown status, false otherwise
 */
export const isCoolDownStatus = (status: number) => {
  return status === 429;
}

/**
 * A utility that generates a sleep interval that resolves
 * in the amount of time specified
 * 
 * @param time the amount of time to sleep
 * @returns a promise that resolves in the specificed amount 
 * of time
 */
export const sleep = async (time: number = 50) => {
  return new Promise((resolve) => setTimeout(resolve, time));
}