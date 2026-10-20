import { readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
import { gzipSync } from 'node:zlib'

// Use an installed Playwright module without adding a product dependency.
const { chromium } = await import(process.argv[3] || 'playwright')
const directory = process.argv[2]
const types = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(
    /^\/ReleaseBoardGameP2P\//,
    '',
  )
  try {
    const file = extname(path) ? path : 'index.html'
    const data = await readFile(join(directory, 'dist', file))
    res.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Content-Encoding': 'gzip',
      'Cache-Control': file === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    res.end(gzipSync(data))
  } catch {
    res.writeHead(404)
    res.end()
  }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const route of ['', 'start'])
    for (let n = 0; n < 5; n++) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        locale: 'en',
      })
      const page = await context.newPage()
      const client = await context.newCDPSession(page)
      await client.send('Network.enable')
      await client.send('Network.setCacheDisabled', { cacheDisabled: true })
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 150,
        downloadThroughput: 200000,
        uploadThroughput: 93750,
      })
      await client.send('Emulation.setCPUThrottlingRate', { rate: 4 })
      await client.send('Performance.enable')
      await page.addInitScript(() => {
        window.lcp = null
        new PerformanceObserver((list) => {
          const e = list.getEntries().at(-1)
          window.lcp = { time: e.startTime, element: e.element?.tagName, id: e.element?.className }
        }).observe({ type: 'largest-contentful-paint', buffered: true })
      })
      const failures = []
      page.on('pageerror', (e) => failures.push(String(e)))
      page.on('requestfailed', (r) => failures.push(r.url()))
      await page.goto(`http://127.0.0.1:${server.address().port}/ReleaseBoardGameP2P/${route}`, {
        waitUntil: 'load',
      })
      await page.waitForTimeout(10000)
      const result = await page.evaluate(() => ({
        fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
        lcp: window.lcp,
        requests: performance
          .getEntriesByType('resource')
          .map((r) => ({ url: r.name, bytes: r.transferSize, encoded: r.encodedBodySize })),
        text: document.body.innerText.slice(0, 160),
      }))
      result.route = route
      result.version = browser.version()
      result.failures = failures
      result.metrics = (await client.send('Performance.getMetrics')).metrics
      results.push(result)
      await page.screenshot({ path: `${directory}/screen-${route || 'root'}-${n}.png` })
      await context.close()
      process.stdout.write(`${route || 'root'} ${n} ${result.fcp} ${result.lcp?.time}\n`)
    }
  await writeFile(`${directory}/browser.json`, JSON.stringify(results, null, 2))
} finally {
  await browser.close()
  server.close()
}
