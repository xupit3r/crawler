export type Page = {
  uuid: string
  url: string
  html: string
  links: Array<string>
}

export type Crawled = {
  [link: string]: boolean
}