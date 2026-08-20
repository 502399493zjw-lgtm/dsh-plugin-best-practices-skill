import type { Context } from '@deepseek-ai/cordis'

export const name = '{{PLUGIN_ID}}'

export const inject: string[] = []

export function apply(ctx: Context): void {
  ctx.effect(() => {
    // Register Host services, routes, timers, or subprocesses here.
    return () => {
      // Dispose every resource owned by this plugin instance here.
    }
  })
}
