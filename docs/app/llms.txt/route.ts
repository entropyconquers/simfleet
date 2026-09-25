import { source } from '@/lib/docs-source'
import { siteConfig, getSiteUrl } from '@/lib/theme-config'

export const dynamic = 'force-static'

export async function GET() {
  const baseUrl = getSiteUrl()
  const pages = source.getPages()

  // Build llms.txt following llmstxt.org format
  let content = `# ${siteConfig.name}

> ${siteConfig.description}

## Documentation

`

  // Add all documentation pages
  for (const page of pages) {
    const title = page.data.title
    const description = page.data.description || ''
    const url = `${baseUrl}${page.url}`

    if (description) {
      content += `- [${title}](${url}): ${description}\n`
    } else {
      content += `- [${title}](${url})\n`
    }
  }

  content += `
## Links

- [GitHub](${siteConfig.links.github})
- [npm](${siteConfig.links.npm})
`

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}
