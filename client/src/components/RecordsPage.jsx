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

function getGoogleMapsUrl(record) {
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return "";
  }

  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

function getRecordPhotoUrl(record) {
  if (!record.photoUrl) {
    return "";
  }

  return `${API_URL}${record.photoUrl}`;
}

function formatRecordSource(record) {
  return record.source || record.sourceLabel || "Direct / Unknown";
}

function RecordsPage() {
  const [records, setRecords] = useState([]);
  const [selectedRecordIds, setSelectedRecordIds] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

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
          setSelectedRecordIds([]);
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

  const allRecordIds = records.map((record) => record.id);
  const selectedRecordIdSet = new Set(selectedRecordIds);
  const hasRecords = records.length > 0;
  const isAllSelected = hasRecords && selectedRecordIds.length === records.length;

  const toggleRecord = (recordId) => {
    setSelectedRecordIds((currentIds) => (
      currentIds.includes(recordId)
        ? currentIds.filter((id) => id !== recordId)
        : [...currentIds, recordId]
    ));
  };

  const toggleAllRecords = () => {
    setSelectedRecordIds(isAllSelected ? [] : allRecordIds);
  };

  const deleteSelectedRecords = async () => {
    if (!selectedRecordIds.length || isDeleting) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedRecordIds.length} selected records?\n确定删除选中的 ${selectedRecordIds.length} 条记录吗？`,
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/game-records`, {
        body: JSON.stringify({
          ids: selectedRecordIds,
        }),
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Delete failed.");
      }

      const deletedIds = new Set(selectedRecordIds);
      setRecords((currentRecords) => currentRecords.filter((record) => !deletedIds.has(record.id)));
      setSelectedRecordIds([]);
    } catch (deleteError) {
      setError(deleteError.message || "Delete failed.");
    } finally {
      setIsDeleting(false);
    }
  };

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
          <a className="records-game-link" href="/tetris/">
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
          <>
            <div className="records-toolbar">
              <button type="button" onClick={toggleAllRecords}>
                {isAllSelected ? "Clear selection / 取消全选" : "Select all / 全选"}
              </button>
              <button
                className="records-delete-button"
                type="button"
                disabled={!selectedRecordIds.length || isDeleting}
                onClick={deleteSelectedRecords}
              >
                {isDeleting
                  ? "Deleting... / 删除中..."
                  : `Delete selected / 删除选中 (${selectedRecordIds.length})`}
              </button>
            </div>

            <div className="records-table-wrap">
              <table className="records-table">
                <thead>
                  <tr>
                    <th>Select / 选择</th>
                    <th>User / 用户</th>
                    <th>IP</th>
                    <th>Location / 所属地</th>
                    <th>Source / 来源</th>
                    <th>Browser / 浏览器</th>
                    <th>GPS / 浏览器定位</th>
                    <th>Photo / 照片</th>
                    <th>Time / 时间</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <input
                          aria-label={`Select record ${record.id}`}
                          checked={selectedRecordIdSet.has(record.id)}
                          type="checkbox"
                          onChange={() => toggleRecord(record.id)}
                        />
                      </td>
                      <td>{record.username}</td>
                      <td>{record.ipAddress}</td>
                      <td>{record.ipLocation}</td>
                      <td>
                        {record.referrerUrl ? (
                          <a
                            className="records-source-link"
                            href={record.referrerUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {formatRecordSource(record)}
                          </a>
                        ) : formatRecordSource(record)}
                      </td>
                      <td title={record.userAgent || ""}>{record.browser || "Unknown"}</td>
                      <td>
                        {getGoogleMapsUrl(record) ? (
                          <a
                            className="records-map-link"
                            href={getGoogleMapsUrl(record)}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {formatBrowserLocation(record)}
                          </a>
                        ) : "-"}
                      </td>
                      <td>
                        {record.photoUrl ? (
                          <a
                            className="records-photo-link"
                            href={getRecordPhotoUrl(record)}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Open photo / 查看照片
                          </a>
                        ) : "-"}
                      </td>
                      <td>{formatRecordTime(record.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default RecordsPage;
