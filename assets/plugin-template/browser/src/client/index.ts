import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

export const inject: string[] = []

export function apply(_ctx: ClientContext): void {
  // Register UI slots or a Settings card here. Keep privileged data on Host.
}
