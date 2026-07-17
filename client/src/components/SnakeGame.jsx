import { useCallback, useEffect, useRef, useState } from "react";

const GRID_SIZE = 20;
const DEFAULT_TICK_MS = 180;
const BEST_SCORE_KEY = "private-chat:snake-best-score";
const SPEED_KEY = "private-chat:snake-speed";
const SPEED_OPTIONS = [
  { label: "Slow / 慢", value: 260 },
  { label: "Normal / 正常", value: 180 },
  { label: "Fast / 快", value: 125 },
  { label: "Very fast / 很快", value: 90 },
];

const START_SNAKE = [
  { x: 9, y: 10 },
  { x: 8, y: 10 },
  { x: 7, y: 10 },
];

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function isSameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

function isOpposite(a, b) {
  return a.x + b.x === 0 && a.y + b.y === 0;
}

function readBestScore() {
  const savedScore = Number(window.localStorage.getItem(BEST_SCORE_KEY));
  return Number.isFinite(savedScore) ? savedScore : 0;
}

function readSpeed() {
  const savedSpeed = Number(window.localStorage.getItem(SPEED_KEY));
  const isValidSpeed = SPEED_OPTIONS.some((option) => option.value === savedSpeed);
  return isValidSpeed ? savedSpeed : DEFAULT_TICK_MS;
}

function wrapCell(cell) {
  return {
    x: (cell.x + GRID_SIZE) % GRID_SIZE,
    y: (cell.y + GRID_SIZE) % GRID_SIZE,
  };
}

function createFood(snake) {
  const availableCells = [];

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const cell = { x, y };

      if (!snake.some((part) => isSameCell(part, cell))) {
        availableCells.push(cell);
      }
    }
  }

  return availableCells[Math.floor(Math.random() * availableCells.length)] || { x: 10, y: 10 };
}

function SnakeGame() {
  const [snake, setSnake] = useState(START_SNAKE);
  const [food, setFood] = useState(() => createFood(START_SNAKE));
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(readBestScore);
  const [tickMs, setTickMs] = useState(readSpeed);
  const [status, setStatus] = useState("idle");
  const directionRef = useRef(DIRECTIONS.right);
  const nextDirectionRef = useRef(DIRECTIONS.right);
  const touchStartRef = useRef(null);

  const startGame = useCallback(() => {
    const freshSnake = START_SNAKE.map((part) => ({ ...part }));
    directionRef.current = DIRECTIONS.right;
    nextDirectionRef.current = DIRECTIONS.right;
    setSnake(freshSnake);
    setFood(createFood(freshSnake));
    setScore(0);
    setStatus("running");
  }, []);

  const setMoveDirection = useCallback((direction) => {
    const nextDirection = DIRECTIONS[direction];

    if (!nextDirection || isOpposite(directionRef.current, nextDirection)) {
      return;
    }

    nextDirectionRef.current = nextDirection;

    if (status === "idle") {
      setStatus("running");
    }
  }, [status]);

  const togglePause = useCallback(() => {
    setStatus((currentStatus) => {
      if (currentStatus === "running") {
        return "paused";
      }

      if (currentStatus === "paused" || currentStatus === "idle") {
        return "running";
      }

      return currentStatus;
    });
  }, []);

  const updateSpeed = (event) => {
    const nextSpeed = Number(event.target.value);
    setTickMs(nextSpeed);
    window.localStorage.setItem(SPEED_KEY, String(nextSpeed));
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      const keyMap = {
        ArrowUp: "up",
        w: "up",
        W: "up",
        ArrowDown: "down",
        s: "down",
        S: "down",
        ArrowLeft: "left",
        a: "left",
        A: "left",
        ArrowRight: "right",
        d: "right",
        D: "right",
      };

      if (keyMap[event.key]) {
        event.preventDefault();
        setMoveDirection(keyMap[event.key]);
        return;
      }

      if (event.key === " ") {
        event.preventDefault();
        togglePause();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setMoveDirection, togglePause]);

  useEffect(() => {
    if (status !== "running") {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setSnake((currentSnake) => {
        const direction = nextDirectionRef.current;
        const nextHead = wrapCell({
          x: currentSnake[0].x + direction.x,
          y: currentSnake[0].y + direction.y,
        });
        const willEat = isSameCell(nextHead, food);
        const bodyToCheck = willEat ? currentSnake : currentSnake.slice(0, -1);
        const hitSelf = bodyToCheck.some((part) => isSameCell(part, nextHead));

        if (hitSelf) {
          setStatus("lost");
          return currentSnake;
        }

        directionRef.current = direction;

        const nextSnake = [nextHead, ...currentSnake];

        if (willEat) {
          setScore((currentScore) => {
            const nextScore = currentScore + 1;
            setBestScore((currentBest) => {
              const nextBest = Math.max(currentBest, nextScore);
              window.localStorage.setItem(BEST_SCORE_KEY, String(nextBest));
              return nextBest;
            });
            return nextScore;
          });
          setFood(createFood(nextSnake));
          return nextSnake;
        }

        nextSnake.pop();
        return nextSnake;
      });
    }, tickMs);

    return () => window.clearInterval(timerId);
  }, [food, status, tickMs]);

  const handleTouchStart = (event) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches[0];

    if (!start || !touch) {
      return;
    }

    const diffX = touch.clientX - start.x;
    const diffY = touch.clientY - start.y;

    if (Math.max(Math.abs(diffX), Math.abs(diffY)) < 24) {
      return;
    }

    if (Math.abs(diffX) > Math.abs(diffY)) {
      setMoveDirection(diffX > 0 ? "right" : "left");
    } else {
      setMoveDirection(diffY > 0 ? "down" : "up");
    }
  };

  const statusText = {
    idle: "Ready / 准备",
    running: "Playing / 游戏中",
    paused: "Paused / 暂停",
    lost: "Game over / 游戏结束",
  }[status];

  return (
    <main className="snake-page">
      <section className="snake-shell" aria-label="Snake game / 贪吃蛇游戏">
        <div className="snake-header">
          <div>
            <a className="snake-back-link" href="/">
              Private Chat
            </a>
            <h1>Snake / 贪吃蛇</h1>
          </div>
          <div className="snake-scoreboard" aria-label="Score / 分数">
            <span>Score {score}</span>
            <span>Best {bestScore}</span>
          </div>
        </div>

        <label className="snake-speed-control">
          <span>Speed / 速度</span>
          <select value={tickMs} onChange={updateSpeed}>
            {SPEED_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div
          className="snake-board"
          onTouchEnd={handleTouchEnd}
          onTouchStart={handleTouchStart}
          role="application"
          aria-label="Snake board / 贪吃蛇棋盘"
        >
          {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
            const cell = { x: index % GRID_SIZE, y: Math.floor(index / GRID_SIZE) };
            const isHead = isSameCell(cell, snake[0]);
            const isBody = snake.slice(1).some((part) => isSameCell(part, cell));
            const isFood = isSameCell(cell, food);
            const className = [
              "snake-cell",
              isHead ? "snake-head" : "",
              isBody ? "snake-body" : "",
              isFood ? "snake-food" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return <div className={className} key={`${cell.x}-${cell.y}`} />;
          })}
        </div>

        <div className="snake-footer">
          <div className="snake-status">{statusText}</div>
          <div className="snake-actions">
            <button type="button" onClick={status === "lost" ? startGame : togglePause}>
              {status === "lost" ? "Restart / 重新开始" : "Pause / 暂停"}
            </button>
            <button type="button" onClick={startGame}>
              New game / 新游戏
            </button>
          </div>
        </div>

        <div className="snake-controls" aria-label="Direction controls / 方向控制">
          <button type="button" aria-label="Up / 上" onClick={() => setMoveDirection("up")}>
            ↑
          </button>
          <div>
            <button type="button" aria-label="Left / 左" onClick={() => setMoveDirection("left")}>
              ←
            </button>
            <button type="button" aria-label="Down / 下" onClick={() => setMoveDirection("down")}>
              ↓
            </button>
            <button type="button" aria-label="Right / 右" onClick={() => setMoveDirection("right")}>
              →
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default SnakeGame;
