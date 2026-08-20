import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import * as plugin from '../src/index.ts'

describe('{{PLUGIN_ID}} Host plugin', () => {
  it('exports the stable Cordis plugin id', () => {
    expect(plugin.name).toBe('{{PLUGIN_ID}}')
  })

  it('activates and disposes inside a real Cordis Context', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(plugin)

    expect(fiber.getEffects()).toHaveLength(1)
    await fiber.dispose()
    expect(fiber.uid).toBeNull()
    expect(fiber.getEffects()).toHaveLength(0)
  })
})
