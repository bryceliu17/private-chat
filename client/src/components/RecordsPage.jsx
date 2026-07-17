import { useEffect, useState } from "react";
import { API_URL } from "../api";

function formatRecordTime(createdAt) {
  const date = new Date(Number(createdAt));

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function formatBrowserLocation(record) {
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return "-";
  }

  const accuracy = Number(record.locationAccuracy);
  const accuracyText = Number.isFinite(accuracy) ? ` ±${Math.round(accuracy)}m` : "";

  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}${accuracyText}`;
}

function RecordsPage() {
  const [records, setRecords] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadRecords() {
      try {
        const response = await fetch(`${API_URL}/api/game-records`, {
          credentials: "include",
        });

        if (response.status === 401) {
          if (isMounted) {
            setStatus("unauthorized");
          }
          return;
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.message || "Cannot load records.");
        }

        if (isMounted) {
          setRecords(data.records || []);
          setStatus("ready");
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message || "Cannot load records.");
          setStatus("error");
        }
      }
    }

    loadRecords();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="records-page">
      <section className="records-shell">
        <div className="records-header">
          <div>
            <a className="records-back-link" href="/">
              Private Chat
            </a>
            <h1>Records / 访问记录</h1>
          </div>
          <a className="records-game-link" href="/tetris">
            Tetris / 俄罗斯方块
          </a>
        </div>

        {status === "loading" && <p className="records-message">Loading / 加载中...</p>}

        {status === "unauthorized" && (
          <div className="records-empty">
            <h2>Please log in first / 请先登录</h2>
            <p>Any logged-in account can view these records. / 任意已登录账号都可以查看这些记录。</p>
            <a href="/">Go to login / 去登录</a>
          </div>
        )}

        {status === "error" && <p className="records-error">{error}</p>}

        {status === "ready" && records.length === 0 && (
          <p className="records-message">No records yet / 暂无记录</p>
        )}

        {status === "ready" && records.length > 0 && (
          <div className="records-table-wrap">
            <table className="records-table">
              <thead>
                <tr>
                  <th>User / 用户</th>
                  <th>Game / 游戏</th>
                  <th>IP</th>
                  <th>Location / 所属地</th>
                  <th>GPS / 浏览器定位</th>
                  <th>Time / 时间</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>{record.username}</td>
                    <td>{record.game}</td>
                    <td>{record.ipAddress}</td>
                    <td>{record.ipLocation}</td>
                    <td>{formatBrowserLocation(record)}</td>
                    <td>{formatRecordTime(record.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export default RecordsPage;
