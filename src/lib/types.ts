export type Page = {
  url: string
  host: string
  html: string
};

export type Link = {
  source: string
  sourceHost: string
  host: string
  url: string
  visited: boolean
  status: number
}

export type LinkLookup = {
  [key: string]: {
    visited: boolean,
    status: number
  }
}