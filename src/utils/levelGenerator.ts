// 定义方向类型
type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";

// 定义关卡数据类型（与 App.tsx 保持一致）
type LevelData = {
  id: number;
  config: { rows: number; cols: number };
  paths: { row: number; col: number }[][];
  blocks: { row: number; col: number }[];
  icePlates: { row: number; col: number; direction: Direction }[];
};

/**
 * 随机生成关卡的函数 (优化版：增加难度和依赖性)
 * 策略：尝试构建依赖链，优先生成阻挡现有蛇路径的新蛇。
 */
export function generateRandomLevelFunc(
  rows: number,
  cols: number,
  difficulty: "easy" | "medium" | "hard"
): LevelData {
  let attempt = 0;
  const maxAttempts = rows * cols > 64 ? 50 : 50; // 大地图减少总尝试次数，因为单次生成时间变长

  // 提高大地图的填充率目标，避免空旷
  const targetFillRatio = rows * cols > 64 ? 0.8 : 0.85;

  // 难度控制：允许同时暴露（可直接移除）的蛇的最大数量
  let maxExposedSnakes = 3;
  if (difficulty === "medium") maxExposedSnakes = 2;
  if (difficulty === "hard") maxExposedSnakes = 1;

  while (attempt < maxAttempts) {
    attempt++;

    // 状态重置
    const paths: { row: number; col: number }[][] = [];
    const occupied = new Set<string>();
    const grid = new Map<string, number>();

    // 根据地图大小调整蛇的长度
    let minSnakeLen = 3;
    let maxSnakeLen = 6;

    if (rows * cols > 64) {
      minSnakeLen = 4;
      maxSnakeLen = 8;
    }

    if (difficulty === "hard") {
      minSnakeLen += 1;
      maxSnakeLen += 2;
    }

    // 使用连续失败次数作为退出条件，而不是总尝试次数
    // 这样可以确保只要还能放得下，就会一直尝试填满
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = rows * cols * 5;

    while (
      occupied.size < rows * cols * targetFillRatio &&
      consecutiveFailures < maxConsecutiveFailures
    ) {
      // 1. 策略性选择起点
      const candidateStarts: { r: number; c: number; score: number }[] = [];

      // 找出所有空格
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!occupied.has(`${r},${c}`)) {
            let score = 1;

            // 检查这个空格周围是否有蛇头
            paths.forEach((path) => {
              const head = path[0];
              const neck = path[1];
              let dr = head.row - neck.row;
              let dc = head.col - neck.col;

              if (head.row + dr === r && head.col + dc === c) {
                score += 20; // 大幅增加挡路位置的权重
              }
            });

            candidateStarts.push({ r, c, score });
          }
        }
      }

      if (candidateStarts.length === 0) break;

      // 轮盘赌选择
      const totalScore = candidateStarts.reduce(
        (sum, item) => sum + item.score,
        0
      );
      let randomVal = Math.random() * totalScore;
      let start = candidateStarts[0];
      for (const item of candidateStarts) {
        randomVal -= item.score;
        if (randomVal <= 0) {
          start = item;
          break;
        }
      }

      // 2. 生成蛇
      const currentMaxLen =
        Math.floor(Math.random() * (maxSnakeLen - minSnakeLen + 1)) +
        minSnakeLen;
      const newPath = generateSnakePath(
        rows,
        cols,
        occupied,
        minSnakeLen,
        currentMaxLen,
        { r: start.r, c: start.c }
      );

      let added = false;
      if (newPath.length >= minSnakeLen) {
        // 3. 验证
        const tempPaths = [...paths, newPath];
        const tempLevel: LevelData = {
          id: 0,
          config: { rows, cols },
          paths: tempPaths,
          blocks: [],
          icePlates: [],
        };

        const check = simulateAndCheck(tempLevel);
        const exposedCount = countExposedSnakes(tempLevel);

        // 动态难度调整：如果连续失败次数过多（说明很难找到符合难度要求的蛇），
        // 则放宽难度限制，优先填满地图。
        const isStruggling = consecutiveFailures > rows * cols;
        const difficultyPass =
          exposedCount <= maxExposedSnakes || paths.length < 3 || isStruggling;

        if (check.canAllLeave && difficultyPass) {
          paths.push(newPath);
          newPath.forEach((p) => {
            occupied.add(`${p.row},${p.col}`);
            grid.set(`${p.row},${p.col}`, paths.length - 1);
          });
          added = true;
          consecutiveFailures = 0; // 成功添加，重置失败计数
        }
      }

      if (!added) {
        consecutiveFailures++;
      }
    }

    // 最终检查：至少填充一定比例才算成功，否则重试
    if (paths.length > 0 && occupied.size >= rows * cols * 0.5) {
      const finalLevel = {
        id: Date.now(),
        config: { rows, cols },
        paths,
        blocks: [],
        icePlates: [],
      };
      const finalCheck = simulateAndCheck(finalLevel);
      if (finalCheck.canAllLeave) {
        console.log(
          `Generated Level: ${paths.length} snakes, Fill: ${(
            occupied.size /
            (rows * cols)
          ).toFixed(2)}`
        );
        return finalLevel;
      }
    }
  }

  console.warn("Failed to generate level.");
  return {
    id: Date.now(),
    config: { rows, cols },
    paths: [],
    blocks: [],
    icePlates: [],
  };
}

/**
 * 生成单条蛇路径
 * @param start 指定起点
 */
function generateSnakePath(
  rows: number,
  cols: number,
  occupied: Set<string>,
  minLength: number,
  maxLength: number,
  start: { r: number; c: number }
): { row: number; col: number }[] {
  const path: { row: number; col: number }[] = [];
  let currentRow = start.r;
  let currentCol = start.c;

  path.push({ row: currentRow, col: currentCol });
  // 注意：这里不要立即把 start 加入 occupied，因为 generateRandomLevelFunc 里是根据 path 结果统一加入的
  // 但为了内部判断不撞自己，我们需要一个临时的 occupied
  const tempOccupied = new Set(occupied);
  tempOccupied.add(`${currentRow},${currentCol}`);

  let lastDirection: Direction | null = null;
  const directions: Direction[] = ["UP", "DOWN", "LEFT", "RIGHT"];

  while (path.length < maxLength) {
    // 筛选可行方向
    const validMoves = directions.filter((dir) => {
      // 1. 不能回头
      if (lastDirection === "UP" && dir === "DOWN") return false;
      if (lastDirection === "DOWN" && dir === "UP") return false;
      if (lastDirection === "LEFT" && dir === "RIGHT") return false;
      if (lastDirection === "RIGHT" && dir === "LEFT") return false;

      // 2. 计算坐标
      let nr = currentRow,
        nc = currentCol;
      if (dir === "UP") nr--;
      else if (dir === "DOWN") nr++;
      else if (dir === "LEFT") nc--;
      else if (dir === "RIGHT") nc++;

      // 3. 检查边界和占用
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return false;
      if (tempOccupied.has(`${nr},${nc}`)) return false;

      return true;
    });

    if (validMoves.length === 0) break; // 无路可走

    // 随机选一个方向
    const dir = validMoves[Math.floor(Math.random() * validMoves.length)];

    if (dir === "UP") currentRow--;
    else if (dir === "DOWN") currentRow++;
    else if (dir === "LEFT") currentCol--;
    else if (dir === "RIGHT") currentCol++;

    path.push({ row: currentRow, col: currentCol });
    tempOccupied.add(`${currentRow},${currentCol}`);
    lastDirection = dir;
  }

  return path;
}

/**
 * 模拟蛇移动并检查是否所有蛇能离开面板
 * 逻辑优化：只要蛇能完全离开面板（路径上无阻挡），就直接移除该蛇。
 * @param level 关卡数据
 * @returns { canAllLeave: boolean; details: string[] } 是否能全部离开和详情
 */
function simulateAndCheck(level: LevelData): {
  canAllLeave: boolean;
  details: string[];
} {
  // const details: string[] = [];
  // 修正：从 config 中获取 rows 和 cols
  const {
    config: { rows, cols },
    paths,
    blocks,
    icePlates,
  } = level;

  // 1. 准备数据
  // 剩余的蛇列表，并确保坐标为整数
  const currentPaths = paths.map((path, index) => ({
    id: index,
    cells: path.map((p) => ({
      row: Math.round(p.row),
      col: Math.round(p.col),
    })),
  }));

  // 网格占用状态 (key: "row,col", value: "block" | "snake")
  const grid = new Map<string, string>();
  blocks.forEach((b) =>
    grid.set(`${Math.round(b.row)},${Math.round(b.col)}`, "block")
  );
  currentPaths.forEach((snake) => {
    snake.cells.forEach((pos) => grid.set(`${pos.row},${pos.col}`, "snake"));
  });

  // 冰块方向查找表
  const iceMap = new Map<string, Direction>();
  icePlates.forEach((ice) =>
    iceMap.set(`${Math.round(ice.row)},${Math.round(ice.col)}`, ice.direction)
  );

  // 获取蛇头方向
  const getSnakeDirection = (
    cells: { row: number; col: number }[]
  ): Direction | null => {
    if (cells.length < 2) return null;
    const head = cells[0];
    const neck = cells[1];
    if (head.row === neck.row) return head.col < neck.col ? "LEFT" : "RIGHT";
    if (head.col === neck.col) return head.row < neck.row ? "UP" : "DOWN";
    return null;
  };

  const exitOrder: string[] = [];
  let progress = true;

  // 2. 循环消除逻辑
  while (progress && currentPaths.length > 0) {
    progress = false;

    // 遍历所有剩余的蛇，寻找能直接走出去的
    for (let i = 0; i < currentPaths.length; i++) {
      const snake = currentPaths[i];
      const dir = getSnakeDirection(snake.cells);

      if (!dir) continue;

      // 路径探测
      let currRow = snake.cells[0].row;
      let currCol = snake.cells[0].col;
      let currDir = dir;
      let canExit = true;
      let blockedInfo = "";

      // 防止死循环的最大步数
      let steps = 0;
      const maxSteps = rows * cols * 2;

      // 模拟蛇头前进
      while (steps < maxSteps) {
        // 计算下一步位置
        let nextRow = currRow;
        let nextCol = currCol;
        if (currDir === "UP") nextRow--;
        else if (currDir === "DOWN") nextRow++;
        else if (currDir === "LEFT") nextCol--;
        else if (currDir === "RIGHT") nextCol++;

        // A. 出界 -> 成功离开
        if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) {
          canExit = true;
          break;
        }

        const key = `${nextRow},${nextCol}`;

        // B. 撞到障碍 (Block 或 其他蛇)
        if (grid.has(key)) {
          canExit = false;
          blockedInfo = `Blocked at (${nextRow},${nextCol}) by ${grid.get(
            key
          )}`;
          break;
        }

        // C. 遇到冰块转向
        if (iceMap.has(key)) {
          currDir = iceMap.get(key)!;
        }

        // 继续前进
        currRow = nextRow;
        currCol = nextCol;
        steps++;
      }

      if (steps >= maxSteps) {
        canExit = false;
        blockedInfo = "Path loop or too long";
      }

      // 如果能离开，移除该蛇并更新网格
      if (canExit) {
        snake.cells.forEach((pos) => grid.delete(`${pos.row},${pos.col}`));
        exitOrder.push(
          `Snake ${snake.id} (Head: ${snake.cells[0].row},${snake.cells[0].col})`
        );
        currentPaths.splice(i, 1);
        progress = true;
        break; // 重新开始循环，因为棋盘变了，可能解锁了前面的蛇
      } else {
        // 记录阻挡原因，用于最后输出
        (snake as any).blockedReason = blockedInfo;
      }
    }
  }

  // 3. 结果输出
  if (currentPaths.length === 0) {
    return {
      canAllLeave: true,
      details: ["Success! Exit order:", ...exitOrder],
    };
  } else {
    const stuckDetails = currentPaths.map((s) => {
      const head = s.cells[0];
      return `Snake ${s.id} at (${head.row},${head.col}) stuck. Reason: ${
        (s as any).blockedReason
      }`;
    });
    return {
      canAllLeave: false,
      details: [
        `Deadlock! ${currentPaths.length} snakes remaining.`,
        "Exit order so far: " +
          (exitOrder.length ? exitOrder.join(" -> ") : "None"),
        ...stuckDetails,
      ],
    };
  }
}

/**
 * 辅助函数：计算当前状态下，有多少条蛇可以直接离开面板
 */
function countExposedSnakes(level: LevelData): number {
  const {
    config: { rows, cols },
    paths,
    blocks,
  } = level;
  let count = 0;

  const occupied = new Set<string>();
  blocks.forEach((b) => occupied.add(`${b.row},${b.col}`));
  paths.forEach((p) => p.forEach((c) => occupied.add(`${c.row},${c.col}`)));

  for (const path of paths) {
    if (path.length < 2) continue;
    const head = path[0];
    const neck = path[1];
    let dr = head.row - neck.row;
    let dc = head.col - neck.col;

    // 检查路径直到出界
    let r = head.row;
    let c = head.col;
    let blocked = false;

    // 简单的直线检测，不考虑冰块（生成阶段暂不加冰块）
    while (true) {
      r += dr;
      c += dc;
      // 出界 -> 可离开
      if (r < 0 || r >= rows || c < 0 || c >= cols) break;

      // 撞墙
      if (occupied.has(`${r},${c}`)) {
        blocked = true;
        break;
      }
    }

    if (!blocked) count++;
  }
  return count;
}

/**
 * 验证和平衡性测试函数
 * 现在包括模拟检查。
 * @param level 关卡数据
 * @returns { isValid: boolean; warnings: string[] } 验证结果和警告列表
 */
export function validateLevel(level: LevelData): {
  isValid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  let isValid = true;

  const { paths, blocks, icePlates } = level;

  // 1. 检查路径不重叠
  const occupied = new Set<string>();
  for (const path of paths) {
    for (const pos of path) {
      const key = `${pos.row},${pos.col}`;
      if (occupied.has(key)) {
        warnings.push(`Snake overlap at (${pos.row},${pos.col})`);
        isValid = false;
      }
      occupied.add(key);
    }
  }

  // 2. 检查 blocks 和 icePlates 不与蛇重叠
  for (const block of blocks) {
    const key = `${block.row},${block.col}`;
    if (occupied.has(key)) {
      warnings.push(`Block overlaps with snake at (${block.row},${block.col})`);
      isValid = false;
    }
  }
  for (const ice of icePlates) {
    const key = `${ice.row},${ice.col}`;
    if (occupied.has(key)) {
      warnings.push(`Ice plate overlaps with snake at (${ice.row},${ice.col})`);
      isValid = false;
    }
  }

  // 3. 模拟并检查是否所有蛇能离开
  const simulation = simulateAndCheck(level);
  if (!simulation.canAllLeave) {
    warnings.push(...simulation.details);
    isValid = false;
  } else {
    warnings.push(...simulation.details);
    isValid = true;
  }

  return { isValid, warnings };
}

export function detectTrapsAndDeadlocks(level: LevelData): {
  hasTraps: boolean;
  hasDeadlocks: boolean;
  details: string[];
} {
  // TODO: 实现检测
  return { hasTraps: false, hasDeadlocks: false, details: [] };
}
