import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Config, BranchInfo, GitOutput, MergeResult, CommitEntry, RebaseResult } from '../types';

export async function getConfig(): Promise<Config> {
  return invoke<Config>('get_config');
}

export async function saveConfig(config: Config): Promise<void> {
  return invoke<void>('save_config', { config });
}

export async function addProject(path: string): Promise<Config> {
  return invoke<Config>('add_project', { path });
}

export async function removeProject(path: string): Promise<Config> {
  return invoke<Config>('remove_project', { path });
}

export async function gitFetchAll(projectPath: string): Promise<string> {
  return invoke<string>('git_fetch_all', { projectPath });
}

export async function gitGetCurrentBranch(projectPath: string): Promise<string> {
  return invoke<string>('git_get_current_branch', { projectPath });
}

export async function gitListRemoteBranches(projectPath: string, showAll: boolean = false): Promise<BranchInfo[]> {
  return invoke<BranchInfo[]>('git_list_remote_branches', { projectPath, showAll });
}

export async function gitSwitchBranch(projectPath: string, branch: string, autoRemove: boolean): Promise<GitOutput> {
  return invoke<GitOutput>('git_switch_branch', { projectPath, branch, autoRemove });
}

export async function gitMergeBranch(projectPath: string, sourceBranch: string): Promise<MergeResult> {
  return invoke<MergeResult>('git_merge_branch', { projectPath, sourceBranch });
}

export async function gitCommitAndPush(projectPath: string, message: string): Promise<string> {
  return invoke<string>('git_commit_and_push', { projectPath, message });
}

export async function gitSyncBeforeMerge(projectPath: string): Promise<string> {
  return invoke<string>('git_sync_before_merge', { projectPath });
}

export async function gitCommit(projectPath: string, message: string): Promise<string> {
  return invoke<string>('git_commit', { projectPath, message });
}

export async function gitPush(projectPath: string): Promise<string> {
  return invoke<string>('git_push', { projectPath });
}

export async function gitLog(projectPath: string, count: number): Promise<CommitEntry[]> {
  return invoke<CommitEntry[]>('git_log', { projectPath, count });
}

export async function gitAbortMerge(projectPath: string): Promise<string> {
  return invoke<string>('git_abort_merge', { projectPath });
}

export async function gitResetHard(projectPath: string): Promise<string> {
  return invoke<string>('git_reset_hard', { projectPath });
}

export async function gitCheckoutDiscard(projectPath: string): Promise<string> {
  return invoke<string>('git_checkout_discard', { projectPath });
}

export async function gitUndoCommit(projectPath: string): Promise<string> {
  return invoke<string>('git_undo_commit', { projectPath });
}

export async function gitForcePull(projectPath: string, autoRemove: boolean): Promise<GitOutput> {
  return invoke<GitOutput>('git_force_pull', { projectPath, autoRemove });
}

export async function gitRepair(projectPath: string): Promise<string> {
  return invoke<string>('git_repair', { projectPath });
}

export async function gitFetchRebase(projectPath: string): Promise<RebaseResult> {
  return invoke<RebaseResult>('git_fetch_rebase', { projectPath });
}

export async function runBatScript(projectPath: string, scriptName: string): Promise<string> {
  return invoke<string>('run_bat_script', { projectPath, scriptName });
}

export async function runProjectScript(projectPath: string, scriptPath: string, stdinInput?: string): Promise<string> {
  return invoke<string>('run_project_script', { projectPath, scriptPath, stdinInput: stdinInput ?? null });
}

export async function launchBatScript(projectPath: string, scriptName: string): Promise<string> {
  return invoke<string>('launch_bat_script', { projectPath, scriptName });
}

export async function runImportExternalStreaming(
  projectPath: string,
  stdinInput: string | null,
  onLine: (line: string) => void,
): Promise<number> {
  const unlisten: UnlistenFn = await listen<string>('script-output', (event) => {
    onLine(event.payload);
  });

  try {
    const code = await invoke<number>('run_import_external_streaming', {
      projectPath,
      stdinInput,
    });
    return code;
  } finally {
    unlisten();
  }
}

export async function runScriptStreaming(
  projectPath: string,
  scriptPath: string,
  stdinInput: string | null,
  onLine: (line: string) => void,
): Promise<number> {
  const unlisten: UnlistenFn = await listen<string>('script-output', (event) => {
    onLine(event.payload);
  });

  try {
    const code = await invoke<number>('run_script_streaming', {
      projectPath,
      scriptPath,
      stdinInput,
    });
    return code;
  } finally {
    unlisten();
  }
}

export async function launchUnity(projectPath: string): Promise<string> {
  return invoke<string>('launch_unity', { projectPath });
}
