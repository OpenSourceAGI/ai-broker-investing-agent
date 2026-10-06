import type { Message } from '../types'
import type { LLMClient, LLMResponse } from './llm-client'

export interface ScriptedRule {
  name: string
  match: string | RegExp
  response: string | ((prompt: string) => string)
}
export class ScriptedLLMClient implements LLMClient {
  readonly calls: Array<{ rule: string; prompt: string }> = []
  constructor(private rules: ScriptedRule[]) {}
  async invoke(input: string | Message[]): Promise<LLMResponse> {
    const prompt = typeof input === 'string' ? input : JSON.stringify(input, null, 2)
    const rule = this.rules.find(r =>
      typeof r.match === 'string' ? prompt.includes(r.match) : r.match.test(prompt)
    )
    if (!rule) throw new Error('No scripted rule matched prompt')
    this.calls.push({ rule: rule.name, prompt })
    return { content: typeof rule.response === 'string' ? rule.response : rule.response(prompt) }
  }
}
