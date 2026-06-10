export interface Config {
  projects: string[];
  currentProject: string;
  autoRemoveUntracked: boolean;
  skipPushConfirm: boolean;
  logCount: number;
  mergeTemplates: MergeTemplate[];
  buttonOrder: string[];
}

export interface CommitEntry {
  hash: string;
  author: string;
  dateRelative: string;
  subject: string;
}

export interface MergeTemplate {
  currentBranch: string;
  sourceBranch: string;
  taskId: string;
  title: string;
  url: string;
  description: string;
}

export interface BranchInfo {
  name: string;
  lastCommitDate: string;
  lastCommitRelative: string;
  lastCommitMessage: string;
}

export interface MergeResult {
  success: boolean;
  hasConflicts: boolean;
  conflictFiles: string[];
  output: string;
}

export interface GitOutput {
  success: boolean;
  output: string;
  untrackedFiles: string[];
  needsUntrackedRemoval: boolean;
}

export interface RebaseResult {
  success: boolean;
  hasConflicts: boolean;
  conflictFiles: string[];
  output: string;
  rebaseInProgress: boolean;
}

export interface LogEntry {
  id: number;
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning' | 'command';
  message: string;
}

export interface QueueItem {
  id: number;
  action: string;
  label: string;
  targetBranch: string;
  projectPath: string;
  switchTarget?: string;
}
