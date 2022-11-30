export type Page = {
  url: string
  host: string
  status: number
  type: 'html' | 'error' | 'other'
  data: string
};

export type Link = {
  source: string
  sourceHost: string
  host: string
  url: string
}

export type ToBeVisited = {
  url: string
  host: string
  date: Date
}

export type State = {
  processing: {
    [key: string]: boolean
  }
}

export type CrawlerOptions = {
  start: string
  limitTo: string
}