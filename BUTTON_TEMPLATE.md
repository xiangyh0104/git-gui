# 新增按钮参考模板

新增一个按钮功能需要改动以下位置：

## 1. 后端：新建命令文件

`src-tauri/src/git/<your_feature>.rs`

```rust
use super::common::run_git;

#[tauri::command]
pub async fn git_your_feature(project_path: String) -> Result<String, String> {
    let (output, code) = run_git(&project_path, &["your", "git", "args"]).await?;
    if code != 0 {
        return Err(format!("git your-feature failed: {}", output));
    }
    Ok(output)
}
```

## 2. 后端：注册模块

`src-tauri/src/git/mod.rs` — 添加两行：

```rust
mod your_feature;
pub use your_feature::git_your_feature;
```

`src-tauri/src/lib.rs` — 在 `use git::{...}` 中添加 `git_your_feature`，并在 `generate_handler![...]` 中注册。

## 3. 前端：添加调用函数

`src/lib/commands.ts`

```typescript
export async function gitYourFeature(projectPath: string): Promise<string> {
  return invoke<string>('git_your_feature', { projectPath });
}
```

## 4. 前端：添加按钮定义

`src/components/ActionButtons.tsx` — 在 `actions` 数组中添加：

```typescript
{ id: "your-feature", label: "Your Feature" },
```

## 5. 前端：添加按钮处理逻辑

`src/App.tsx` — 在 `handleAction` 的 `switch(action)` 中添加 case：

```typescript
case "your-feature": {
  addLog("command", "> git your-feature");
  const result = await gitYourFeature(projectPath);
  addLog("success", result || "完成");
  succeeded = true;
  break;
}
```

记得在文件顶部 import 新增的函数。

## 核对清单

- [ ] `src-tauri/src/git/<feature>.rs` — 新建命令文件
- [ ] `src-tauri/src/git/mod.rs` — 声明 + re-export
- [ ] `src-tauri/src/lib.rs` — use + generate_handler 注册
- [ ] `src/lib/commands.ts` — invoke 包装函数
- [ ] `src/components/ActionButtons.tsx` — actions 数组
- [ ] `src/App.tsx` — handleAction case
