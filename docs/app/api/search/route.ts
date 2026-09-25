import { source } from '@/lib/docs-source'
import { createFromSource } from 'fumadocs-core/search/server'

// Exported once at build time; the client searches the index in the browser.
export const revalidate = false

export const { staticGET: GET } = createFromSource(source, {
  language: 'english',
})
