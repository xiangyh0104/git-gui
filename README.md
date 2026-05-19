# Git 助手

基于 Tauri v2 + React + TypeScript 的 Git 图形化操作工具，面向日常多分支合并/同步场景。

## 功能

- **项目管理** — 添加/切换/移除多个 Git 项目目录，持久化到本地配置
- **拉取远端** — `git fetch --all`
- **切换分支** — 远程分支列表选择，自动处理未跟踪文件冲突
- **合并分支** — 预配置 commit message 模板，合并前自动同步远端，冲突检测，push 确认
- **重置分支** — `git reset --hard`，自动检测并清除残留 `index.lock`
- **更新分支** — `git pull` + 未跟踪文件冲突处理
- **提交日志** — 查看当前分支最近 N 条提交，数量可配置
- **单实例** — 重复启动时激活已运行窗口
- **Windows 通知** — 操作完成后弹出系统通知
- **运行动画** — 像素恐龙跑步动画，失焦时自动暂停

## 技术栈

| 层         | 技术                        |
|------------|---------------------------|
| 前端       | React 18 + TypeScript + Vite |
| 后端       | Rust + Tauri v2             |
| Git 调用   | `std::process::Command` via `tokio::spawn_blocking` |
| 打包       | Tauri bundler → `.exe`      |

## 项目结构

```
scripts/git-gui/
├── src/                    # React 前端
│   ├── App.tsx             # 主组件 + 状态管理
│   ├── App.css             # 全局样式（白色主题）
│   ├── types/index.ts      # 共享 TS 接口
│   ├── lib/commands.ts     # Tauri invoke 封装
│   └── components/
│       ├── ProjectSelector   # 项目选择器
│       ├── ActionButtons     # 操作按钮组
│       ├── BranchSwitcher    # 分支切换面板
│       ├── MergePanel        # 合并流程面板
│       ├── CommitLogPanel    # 提交日志面板
│       ├── Settings          # 设置面板
│       ├── StatusAnimation   # 运行/完成动画
│       ├── LogViewer         # 操作日志面板
│       └── UntrackedFilesDialog # 未跟踪文件确认
├── src-tauri/              # Rust 后端
│   ├── src/
│   │   ├── lib.rs          # 入口 + 命令注册
│   │   ├── config.rs       # 配置读写 + 项目管理
│   │   └── git.rs          # 全部 Git 命令实现
│   ├── icons/              # 应用图标
│   ├── Cargo.toml
│   └── tauri.conf.json
└── package.json
```

## 开发

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npx tauri dev

# 构建 release
npx tauri build
```

产物位于 `src-tauri/target/release/git-gui.exe`。

## 配置

运行时配置保存在 exe 同目录的 `git-gui-config.json`，包含：

- 项目列表 + 当前选中项目
- 自动移除未跟踪文件开关
- 合并后自动推送开关
- 提交日志显示条数（默认 30）
- 合并 commit message 模板
