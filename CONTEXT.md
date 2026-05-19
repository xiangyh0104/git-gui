# Git 助手 — 项目上下文

## 当前状态

- 版本：0.1.0
- 可正常编译为 release `.exe`
- 已实现全部核心功能

## 架构决策

1. **Git 调用方式**：使用 `std::process::Command` 包装在 `tokio::spawn_blocking` 中，而非 libgit2。优点是行为与用户命令行一致，缺点是依赖系统 `git`。
2. **lock 文件处理**：`run_git` 内部自动检测 `index.lock` 错误并尝试删除后重试一次。
3. **CREATE_NO_WINDOW**：Windows 上给 `Command` 设置 `creation_flags(0x08000000)` 避免弹出控制台窗口。
4. **配置持久化**：JSON 文件存放在 exe 同目录，便于绿色部署。`save_config` 在前端每次切换项目/修改设置时调用。
5. **合并流程**：分三阶段（选择 → 冲突 → push 确认），commit 和 push 拆分为独立命令以支持中间状态。
6. **单实例**：使用 `tauri-plugin-single-instance`，重复启动时激活已有窗口。

## 已知限制

- 图标从 200×200 Lanczos 上采样到 512，有轻微锯齿；如需完美清晰度需提供矢量源图
- 合并模板硬编码了 public/release/patch/master 四个分支名，仅通过设置面板可编辑模板内容
- 未实现 `git stash` / `git cherry-pick` / `git rebase` 等高级操作

## 可扩展方向

- 拆分 `git.rs` 为子模块（当命令超过 20 个时）
- 加入操作队列防止并发 git 命令冲突
- 定义 `GitError` enum 进行类型化错误处理
- 支持 SSH key / credential 配置
