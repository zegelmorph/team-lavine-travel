// stop: if this turn changed code, send the agent back to get an architect review.
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const respond = (body = {}) => {
  process.stdout.write(JSON.stringify(body))
  process.exit(0)
}

try {
  const input = JSON.parse(readFileSync(0, 'utf8'))
  // Leave pending edits in place after an abort or error so the next completed turn still reviews them.
  if (input.status !== 'completed') respond()

  const root = process.env.CURSOR_PROJECT_DIR || process.cwd()
  const stateFile = join(root, '.cursor', 'hooks', 'state', `${input.conversation_id ?? 'unknown'}.txt`)
  if (!existsSync(stateFile)) respond()

  const files = [...new Set(readFileSync(stateFile, 'utf8').split('\n').filter(Boolean))].sort()
  unlinkSync(stateFile)
  if (files.length === 0) respond()

  respond({
    followup_message: [
      `Automated review gate: your last turn changed ${files.length} file(s):`,
      ...files.map((f) => `- ${f}`),
      '',
      'Use the /architect-reviewer subagent to review these changes. Pass it this file list and a one-paragraph summary of what you were trying to accomplish.',
      'Then fix every Blocking finding yourself and re-run `npm run typecheck` and `npm test`.',
      "Don't act on Should-fix or Nit findings unless they're trivial and clearly correct. In your final message, give me the reviewer's verdict, what you fixed, and the remaining findings you left for me to decide.",
    ].join('\n'),
  })
} catch {
  respond()
}
