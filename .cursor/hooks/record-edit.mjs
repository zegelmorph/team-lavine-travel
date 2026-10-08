// afterFileEdit: remember which reviewable files this conversation changed.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'

const REVIEWABLE = /\.(ts|tsx|js|jsx|mjs|cjs|sql|css|html|toml)$|(^|\/)(package|tsconfig|vercel)\.json$/
const IGNORED = /^(node_modules|dist|\.cursor|supabase\/\.temp)\/|(^|\/)(package-lock\.json|database\.types\.ts)$/

try {
  const input = JSON.parse(readFileSync(0, 'utf8'))
  const root = process.env.CURSOR_PROJECT_DIR || process.cwd()
  const rel = relative(root, input.file_path ?? '').replaceAll('\\', '/')

  if (rel && !rel.startsWith('..') && !isAbsolute(rel) && REVIEWABLE.test(rel) && !IGNORED.test(rel)) {
    const dir = join(root, '.cursor', 'hooks', 'state')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, `${input.conversation_id ?? 'unknown'}.txt`), rel + '\n')
  }
} catch {
  // Never block the agent because bookkeeping failed.
}
process.exit(0)
