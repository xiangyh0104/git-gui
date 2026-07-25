interface ServerDef {
  label: string;
  script: string;
}

const SERVERS: ServerDef[] = [
  { label: "webgm", script: "start_webgm_server.bat" },
  { label: "1服", script: "start_gs_1.bat" },
  { label: "2服", script: "start_gs_2.bat" },
  { label: "活动服", script: "start_gs_activity.bat" },
  { label: "中心服", script: "start_center_server.bat" },
  { label: "战斗1服", script: "start_cs_1.bat" },
  { label: "战斗2服", script: "start_cs_2.bat" },
  { label: "listserver", script: "start_list_server.bat" },
  { label: "logserver", script: "start_log_server.bat" },
  { label: "mongo", script: "start_mongodb.bat" },
  { label: "rank", script: "start_rank_server.bat" },
  { label: "social", script: "start_social_server.bat" },
];

interface Props {
  onLaunch: (label: string, script: string) => void;
  onClose: () => void;
}

export default function ServerLauncherDialog({ onLaunch, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2>启动服务器</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="server-grid">
            {SERVERS.map((s) => (
              <button
                key={s.script}
                className="btn btn-server"
                onClick={() => onLaunch(s.label, s.script)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
