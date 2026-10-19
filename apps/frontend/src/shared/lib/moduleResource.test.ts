import { createModuleResource } from './moduleResource'

it('shares concurrent loading and keeps the successfully loaded value', async () => {
  let attempts = 0
  const resource = createModuleResource(async () => ++attempts)
  expect(await Promise.all([resource.load(), resource.load()])).toEqual([1, 1])
  expect(await resource.load()).toBe(1)
  expect(resource.peek()).toBe(1)
})

it('starts another loading attempt after a rejected import', async () => {
  let attempts = 0
  const resource = createModuleResource(async () => {
    if (++attempts === 1) throw new TypeError('offline')
    return 'loaded'
  })
  await expect(resource.load()).rejects.toThrow('offline')
  expect(resource.peek()).toBeUndefined()
  expect(await resource.retry()).toBe('loaded')
})
