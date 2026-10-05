/** Runs eval cases through an assistant and checks each reply. */
import type { Assistant, EngineResult } from '../types';
import type { EvalCase } from './cases';

export type CaseResult = { case: EvalCase; result: EngineResult; problems: string[]; ok: boolean };

/** What is wrong with a reply, empty when it passes. */
export function checkCase(c: EvalCase, { reply, meta }: EngineResult): string[] {
  const problems: string[] = [];
  if (!(c.acceptableActions as string[]).includes(meta.action)) problems.push(`action ${meta.action}`);

  if (c.alert !== undefined) {
    const kind = reply.alert?.kind ?? null;
    if (kind !== c.alert) problems.push(`alert ${kind ?? 'none'}`);
  }

  if (c.productNames) {
    for (const name of c.productNames) {
      if (!reply.text.includes(name)) problems.push(`missing ${name}`);
    }
    for (const item of c.profile.catalog) {
      if (!c.productNames.includes(item.name) && reply.text.includes(item.name)) problems.push(`extra ${item.name}`);
    }
  }

  for (const text of c.mustNotContain ?? []) {
    if (reply.text.includes(text)) problems.push(`contains "${text}"`);
  }
  return problems;
}

/** One case at a time: gentle on rate limits, and the order of the log follows the cases. */
export async function runCases(assistant: Assistant, cases: EvalCase[]): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const c of cases) {
    const result = await assistant.respond({ profile: c.profile, history: c.history ?? [], message: c.message });
    const problems = checkCase(c, result);
    results.push({ case: c, result, problems, ok: problems.length === 0 });
  }
  return results;
}
