import { useState } from "react";
import type { Config, MergeTemplate } from "../types";
import { saveConfig } from "../lib/commands";

interface Props {
  config: Config;
  onConfigChange: (config: Config) => void;
  onClose: () => void;
}

export default function Settings({ config, onConfigChange, onClose }: Props) {
  const [localConfig, setLocalConfig] = useState<Config>({ ...config });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editTemplate, setEditTemplate] = useState<MergeTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  const handleToggle = () => {
    setLocalConfig((c) => ({ ...c, autoRemoveUntracked: !c.autoRemoveUntracked }));
  };

  const handleTogglePush = () => {
    setLocalConfig((c) => ({ ...c, skipPushConfirm: !c.skipPushConfirm }));
  };

  const handleEditTemplate = (index: number) => {
    setEditingIndex(index);
    setEditTemplate({ ...localConfig.mergeTemplates[index] });
  };

  const handleSaveTemplate = () => {
    if (editTemplate === null || editingIndex === null) return;
    const templates = [...localConfig.mergeTemplates];
    templates[editingIndex] = editTemplate;
    setLocalConfig((c) => ({ ...c, mergeTemplates: templates }));
    setEditingIndex(null);
    setEditTemplate(null);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditTemplate(null);
  };

  const handleAddTemplate = () => {
    const newTemplate: MergeTemplate = {
      currentBranch: "",
      sourceBranch: "",
      taskId: "",
      title: "",
      url: "",
      description: "",
    };
    const templates = [...localConfig.mergeTemplates, newTemplate];
    setLocalConfig((c) => ({ ...c, mergeTemplates: templates }));
    setEditingIndex(templates.length - 1);
    setEditTemplate(newTemplate);
  };

  const handleRemoveTemplate = (index: number) => {
    const templates = localConfig.mergeTemplates.filter((_, i) => i !== index);
    setLocalConfig((c) => ({ ...c, mergeTemplates: templates }));
    if (editingIndex === index) {
      setEditingIndex(null);
      setEditTemplate(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveConfig(localConfig);
      onConfigChange(localConfig);
      onClose();
    } catch (e) {
      console.error("Failed to save config:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h2>设置</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="settings-section">
            <div className="settings-section-title">未跟踪文件处理</div>
            <div className="settings-toggle">
              <div
                className={`toggle-switch ${localConfig.autoRemoveUntracked ? "active" : ""}`}
                onClick={handleToggle}
              />
              <span className="toggle-label">自动移除未跟踪文件（跳过询问）</span>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">合并推送确认</div>
            <div className="settings-toggle">
              <div
                className={`toggle-switch ${localConfig.skipPushConfirm ? "active" : ""}`}
                onClick={handleTogglePush}
              />
              <span className="toggle-label">合并后自动推送（跳过确认）</span>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">提交日志条数</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                className="input"
                type="number"
                min={5}
                max={200}
                value={localConfig.logCount ?? 30}
                onChange={(e) =>
                  setLocalConfig((c) => ({
                    ...c,
                    logCount: Math.max(5, Math.min(200, parseInt(e.target.value) || 30)),
                  }))
                }
                style={{ width: 80 }}
              />
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                显示最近 N 条提交记录（5-200）
              </span>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">合并 Commit Message 模板</div>
            <div className="template-list">
              {localConfig.mergeTemplates.map((t, i) => (
                <div key={i}>
                  <div className="template-item">
                    <div className="template-item-info">
                      <div className="template-item-branches">
                        {t.currentBranch} ← {t.sourceBranch}
                      </div>
                      <div className="template-item-task">
                        {t.taskId} {t.title}
                      </div>
                    </div>
                    <div className="template-actions">
                      <button
                        className="template-edit-btn"
                        onClick={() => handleEditTemplate(i)}
                      >
                        编辑
                      </button>
                      <button
                        className="template-edit-btn"
                        onClick={() => handleRemoveTemplate(i)}
                      >
                        删除
                      </button>
                    </div>
                  </div>

                  {editingIndex === i && editTemplate && (
                    <div className="template-editor">
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">当前分支</label>
                          <input
                            className="input"
                            value={editTemplate.currentBranch}
                            onChange={(e) => setEditTemplate({ ...editTemplate, currentBranch: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">源分支</label>
                          <input
                            className="input"
                            value={editTemplate.sourceBranch}
                            onChange={(e) => setEditTemplate({ ...editTemplate, sourceBranch: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">任务 ID</label>
                          <input
                            className="input"
                            value={editTemplate.taskId}
                            onChange={(e) => setEditTemplate({ ...editTemplate, taskId: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">标题</label>
                          <input
                            className="input"
                            value={editTemplate.title}
                            onChange={(e) => setEditTemplate({ ...editTemplate, title: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">URL</label>
                        <input
                          className="input"
                          value={editTemplate.url}
                          onChange={(e) => setEditTemplate({ ...editTemplate, url: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">描述</label>
                        <textarea
                          className="input"
                          value={editTemplate.description}
                          onChange={(e) => setEditTemplate({ ...editTemplate, description: e.target.value })}
                          rows={3}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button className="btn btn-primary" onClick={handleSaveTemplate}>
                          确认
                        </button>
                        <button className="btn btn-secondary" onClick={handleCancelEdit}>
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              className="btn btn-secondary"
              onClick={handleAddTemplate}
              style={{ marginTop: 12 }}
            >
              + 添加模板
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
