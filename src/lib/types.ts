import { MobileNet } from "@tensorflow-models/mobilenet";
import { string } from "@tensorflow/tfjs";
import { ObjectId } from "mongodb";
import { Worker } from "worker_threads";

export type Link = {
  source: string
  sourceHost: string
  host: string
  url: string
}

export type Page = {
  url: string
  host: string
  status: number
  type: 'html' | 'error' | 'other'
  links: Array<Link>,
  images?: Array<ImageLink>
}

export type ImageLink = {
  url: string
  alt: string
  categories?: Array<ImageClassification>
}

export type ImageClassification = {
  className?: string
  probability?: number
  depth?: number
  index?: number
  err?: string
}

export type WebData = {
  data: string,
  page: string
}

export type ToBeVisited = {
  _id?: undefined | ObjectId
  url: string
  host: string
  date: Date
  processing: boolean
}

export type CooldownHost = {
  expireAt: Date
  hostname: string
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

export type CrawlerError = {
  host: string
  url: string
  status: number
  message: string,
  headers: Partial<Record<string, string>>
}

export type ErrorGenerated = {
  page: Page
  crawlerError: CrawlerError
}

export type WorkerRegister = {
  [id: string]: Worker
}

export type ClassifyState = {
  model?: MobileNet
}