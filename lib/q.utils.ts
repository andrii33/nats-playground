import { StreamName } from './q.types'

export const streamToSubject = (streamName: StreamName) => `${streamName}.run`

export const sleep = (duration: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, duration * 1000))