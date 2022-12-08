import { AxiosResponse } from 'axios';
import { URL } from 'whatwg-url';

/**
 * Creates an absolute URL from a possibly relative URL
 * 
 * @returns an absolute URL
 * @param url the URL to possibly make absolute
 * @param base the base/source URL needed to make it absolute
 */
 export const normalizeUrl = (url: string, base: string): string => {
  const full = new URL(url, base);

  // do not include hashes...
  full.hash = '';

  return full.href;
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
export const okToStoreResponse = (response: AxiosResponse) => {
  if (typeof response.headers['content-type'] === 'string') {
    return response.headers['content-type'].indexOf('text/html') > -1;
  }

  return false;
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

export default {
  normalizeUrl,
  getHostname,
  hasProto,
  okToStoreResponse
}