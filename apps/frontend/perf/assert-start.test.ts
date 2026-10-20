import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const script = resolve(import.meta.dirname, 'assert-start.mjs')
let directory: string

beforeEach(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'release-manifest-'))
  await mkdir(resolve(directory, 'dist/.vite'), { recursive: true })
  await mkdir(resolve(directory, 'dist/assets'))
  await writeFile(
    resolve(directory, 'dist/.vite/manifest.json'),
    JSON.stringify({
      'index.html': { file: 'assets/start.js', isEntry: true, imports: ['_shared.js'] },
      '_shared.js': { file: 'assets/shared.js', css: ['assets/start.css'] },
      'src/pages/board/[gameId]/index.tsx': {
        file: 'assets/board.js',
        isDynamicEntry: true,
        css: ['assets/index-board.css'],
      },
      '../../packages/translation/src/locales/en/rules.json': { file: 'assets/rules-en.json' },
    }),
  )
  for (const file of ['start.js', 'shared.js', 'start.css', 'index-board.css', 'rules-en.json'])
    await writeFile(resolve(directory, 'dist/assets', file), 'content')
  for (const file of ['start', 'shared'])
    await writeFile(
      resolve(directory, `dist/assets/${file}.js.map`),
      JSON.stringify({ sources: [`../../src/${file}.tsx`] }),
    )
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

function check(log?: string) {
  return spawnSync(process.execPath, [script, directory, ...(log ? [log] : [])], {
    encoding: 'utf8',
  })
}

it('checks a standard Vite output without custom report files, following static imports and CSS', () => {
  const result = check()
  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({
    loaded: ['assets/start.js', 'assets/shared.js', 'assets/start.css'],
    sizes: { js: { raw: 14 }, css: { raw: 7 } },
    findings: [],
  })
})

it('rejects engine code pulled into a shared initial chunk', async () => {
  await writeFile(
    resolve(directory, 'dist/assets/shared.js.map'),
    JSON.stringify({ sources: ['../../packages/engine/src/index.ts'] }),
  )
  const result = check()
  expect(result.status).toBe(1)
  expect(JSON.parse(result.stdout).findings).toContainEqual({
    file: 'assets/shared.js',
    module: '../../packages/engine/src/index.ts',
  })
})

it.each([
  'assets/rules-en.json',
  'assets/index-board.css',
])('rejects a deferred asset requested on start: %s', async (file) => {
  const log = resolve(directory, 'browser.json')
  await writeFile(
    log,
    JSON.stringify([{ requests: [{ url: `http://localhost/custom-base/${file}?cache=1` }] }]),
  )
  const result = check(log)
  expect(result.status).toBe(1)
  expect(JSON.parse(result.stdout).findings).toEqual(
    expect.arrayContaining([expect.objectContaining({ file })]),
  )
})
