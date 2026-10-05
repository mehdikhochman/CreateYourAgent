/**
 * `npm run eval`: runs every eval case through the assistant and prints a
 * score. Uses Claude when ANTHROPIC_API_KEY is set (model: ASSISTANT_MODEL,
 * default claude-haiku-4-5), else the offline keyword rules. Needs no
 * database. Exits 0 whatever the score: it is for reading, not for failing a build.
 */
import { createAssistant } from '../assistant';
import { createDecider } from '../index';
import { EVAL_CASES } from './cases';
import { runCases } from './score';

const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));

async function main() {
  const config = {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || undefined,
    assistantModel: process.env.ASSISTANT_MODEL?.trim() || 'claude-haiku-4-5',
  };
  const assistant = createAssistant(createDecider(config));
  console.log(`Assistant: ${config.anthropicApiKey ? config.assistantModel : 'keyword rules (no ANTHROPIC_API_KEY)'}\n`);

  const started = Date.now();
  const results = await runCases(assistant, EVAL_CASES);

  console.log(`${pad('case', 30)} ${pad('expected', 30)} ${pad('got', 22)} ok`);
  console.log('-'.repeat(88));
  let input = 0;
  let output = 0;
  for (const r of results) {
    const expected = `${r.case.acceptableActions.join('|')}${r.case.alert !== undefined ? ` / ${r.case.alert ?? 'no alert'}` : ''}`;
    const got = `${r.result.meta.action} / ${r.result.reply.alert?.kind ?? 'no alert'}`;
    console.log(`${pad(r.case.id, 30)} ${pad(expected, 30)} ${pad(got, 22)} ${r.ok ? 'ok' : `FAIL ${r.problems.join('; ')}`}`);
    if (r.result.meta.error) console.log(`${' '.repeat(31)}error: ${r.result.meta.error}`);
    input += r.result.meta.usage?.inputTokens ?? 0;
    output += r.result.meta.usage?.outputTokens ?? 0;
  }

  const passed = results.filter((r) => r.ok).length;
  console.log('-'.repeat(88));
  console.log(`Score: ${passed}/${results.length} (${Math.round((passed / results.length) * 100)} %) in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  if (input || output) console.log(`Tokens: ${input} in, ${output} out`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
