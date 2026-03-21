import fs from 'fs';
import path from 'path';

const CLAUDE_DIR   = path.join(process.env.USERPROFILE || process.env.HOME || '', '.claude');
const IDE_DIR      = path.join(CLAUDE_DIR, 'ide');
const HISTORY_DIR  = path.join(CLAUDE_DIR, 'file-history');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');

export interface IdeSession {
  lockFile: string;
  pid: number;
  workspaceFolders: string[];
  ideName: string;
  active: boolean;
  /** lock 文件的创建时间（= 该 VSCode 窗口的开启时间） */
  openedAtMs: number;
}

/** 读取所有 .lock 文件并检测进程是否存活 */
export function getIdeSessions(): IdeSession[] {
  if (!fs.existsSync(IDE_DIR)) return [];
  return fs
    .readdirSync(IDE_DIR)
    .filter((f) => f.endsWith('.lock'))
    .map((f) => {
      try {
        const fullPath = path.join(IDE_DIR, f);
        const raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as {
          pid: number; workspaceFolders: string[]; ideName: string;
        };
        const stat = fs.statSync(fullPath);
        return {
          lockFile: f.replace('.lock', ''),
          pid: raw.pid,
          workspaceFolders: raw.workspaceFolders ?? [],
          ideName: raw.ideName ?? 'VSCode',
          active: isPidAlive(raw.pid),
          // birthtimeMs = 文件创建时间（Windows 可靠），fallback 到 mtime
          openedAtMs: stat.birthtimeMs || stat.mtimeMs,
        } satisfies IdeSession;
      } catch { return null; }
    })
    .filter((s): s is IdeSession => s !== null);
}

/** 工作目录路径 → Claude 项目名 */
export function workspaceToProjectName(folder: string): string {
  return folder.replace(/\\/g, '-').replace(':', '-');
}

/** 活跃项目名集合（PID 存活的 lock 文件对应的 workspace） */
export function getActiveProjectNames(): Set<string> {
  const names = new Set<string>();
  for (const s of getIdeSessions()) {
    if (s.active) {
      for (const folder of s.workspaceFolders) names.add(workspaceToProjectName(folder));
    }
  }
  return names;
}

/**
 * 获取某个项目中"在当前 VSCode 会话里打开的"会话 ID 列表。
 *
 * 判断依据：
 *   1. 该项目 JSONL 目录下的会话 ID 存在于 ~/.claude/file-history/
 *   2. file-history 目录的 mtime >= 对应 VSCode 窗口的 lock 文件创建时间
 *      （即：该会话是在本次 VSCode 开启之后才被打开/使用的）
 *
 * 这样可以精确区分"当前 VSCode 打开的会话"与"历史上曾经打开过的旧会话"。
 * 结果按 mtime 降序排列（最近活跃的排前面）。
 */
export function getOpenSessionIds(projectName: string): string[] {
  const projDir = path.join(PROJECTS_DIR, projectName);
  if (!fs.existsSync(projDir)) return [];

  // 找到管理该项目的所有活跃 VSCode 窗口，取最早的开启时间作为基准
  // （如果同一个 workspace 被多个窗口打开，取最早那个以免漏掉会话）
  let vscodeOpenedAtMs = 0;
  for (const s of getIdeSessions()) {
    if (!s.active) continue;
    for (const folder of s.workspaceFolders) {
      if (workspaceToProjectName(folder) === projectName) {
        if (vscodeOpenedAtMs === 0 || s.openedAtMs < vscodeOpenedAtMs) {
          vscodeOpenedAtMs = s.openedAtMs;
        }
      }
    }
  }

  // 没有活跃的 VSCode 窗口打开该项目 → 返回空
  if (vscodeOpenedAtMs === 0) return [];

  const results: { id: string; mtime: number }[] = [];

  // 今天零点（本地时间），用于过滤当日之前的过期会话
  const todayStartMs = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();

  for (const f of fs.readdirSync(projDir)) {
    if (!f.endsWith('.jsonl') || f.includes('subagent')) continue;
    const sessionId = f.replace('.jsonl', '');
    const jsonlPath = path.join(projDir, f);
    const jsonlStat = fs.statSync(jsonlPath);

    // JSONL 最后写入时间 = 会话实际最后活跃时间
    // 早于今天零点的会话不再返回（避免初始化时展示大量过期等待会话）
    if (jsonlStat.mtimeMs < todayStartMs) continue;

    const histDir = path.join(HISTORY_DIR, sessionId);

    let mtime = 0;

    if (fs.existsSync(histDir)) {
      // 有 file-history：用其 mtime 判断（更可靠）
      mtime = fs.statSync(histDir).mtimeMs;
    } else {
      // 没有 file-history（新建会话尚未做过文件操作）：
      // 用 JSONL 文件的创建时间判断
      mtime = jsonlStat.birthtimeMs || jsonlStat.mtimeMs;
    }

    if (mtime >= vscodeOpenedAtMs) {
      results.push({ id: sessionId, mtime });
    }
  }

  return results
    .sort((a, b) => b.mtime - a.mtime)
    .map((r) => r.id);
}

/** 监听 ide 目录变化（VSCode 窗口开关） */
export function watchIdeDir(onChange: () => void): fs.FSWatcher | null {
  if (!fs.existsSync(IDE_DIR)) return null;
  return fs.watch(IDE_DIR, () => setTimeout(onChange, 200));
}

/** 监听 file-history 目录变化（VSCode 内切换会话时触发） */
export function watchFileHistoryDir(onChange: () => void): fs.FSWatcher | null {
  if (!fs.existsSync(HISTORY_DIR)) return null;
  return fs.watch(HISTORY_DIR, () => setTimeout(onChange, 500));
}

/** 监听某个项目目录，新增 JSONL（新建会话）时触发 */
export function watchProjectDir(projectName: string, onChange: () => void): fs.FSWatcher | null {
  const dir = path.join(PROJECTS_DIR, projectName);
  if (!fs.existsSync(dir)) return null;
  return fs.watch(dir, () => setTimeout(onChange, 500));
}

function isPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}
