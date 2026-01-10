import { useState, useEffect, useRef } from "react";
import "./App.css";
import {
  Button,
  Col,
  InputNumber,
  Row,
  Radio,
  Space,
  Typography,
  Input,
  Alert,
  List,
  message,
} from "antd";
import { generateRandomLevelFunc, validateLevel } from "./utils/levelGenerator";

const { Text } = Typography;
const { TextArea } = Input;

// 定义方向类型
type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";

// 修改：格子数据类型
type CellData = {
  snakeId: number | null; // 属于哪条蛇的ID
  snakeIndex: number | null; // 在蛇身上的索引 (1, 2, 3...)
  type: "empty" | "snake" | "block"; // 移除 "ice"，冰块作为独立属性
  ice: { direction: Direction } | null; // 新增：冰块属性
};

// 定义蛇的类型
type Snake = {
  id: number;
  color: string;
  cells: number[]; // 存储格子索引
};

// 定义关卡数据类型
type LevelData = {
  id: number;
  config: { rows: number; cols: number };
  paths: { row: number; col: number }[][];
  blocks: { row: number; col: number }[];
  icePlates?: { row: number; col: number; direction: Direction }[];
};

function App() {
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);

  // 输入框的临时状态
  const [inputRows, setInputRows] = useState(5);
  const [inputCols, setInputCols] = useState(5);

  // 当前选中的工具状态，新增 ice
  const [tool, setTool] = useState<"snake" | "block" | "ice" | "clear">(
    "snake"
  );

  // 网格数据状态
  const [gridData, setGridData] = useState<CellData[]>([]);

  // 蛇的数据状态
  const [snakes, setSnakes] = useState<Snake[]>([]);

  // 导出数据状态
  const [jsonOutput, setJsonOutput] = useState("");

  // 验证警告状态
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    warnings: string[];
  } | null>(null);

  // 绘图状态
  const [isDrawing, setIsDrawing] = useState(false);
  const currentSnakeIdRef = useRef<number | null>(null);

  // 新增：关卡管理状态
  const [levelFiles, setLevelFiles] = useState<File[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [currentLevelData, setCurrentLevelData] = useState<LevelData | null>(
    null
  );

  // 新增：关卡目录句柄
  const [levelsDirHandle, setLevelsDirHandle] =
    useState<FileSystemDirectoryHandle | null>(null);

  // 新增：目标目录句柄
  const [targetDirHandle, setTargetDirHandle] =
    useState<FileSystemDirectoryHandle | null>(null);

  // 新增：难度状态
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">(
    "medium"
  );

  // 初始化网格
  useEffect(() => {
    if (gridData.length !== rows * cols) {
      const newGrid = Array(rows * cols)
        .fill(null)
        .map(() => ({
          snakeId: null,
          snakeIndex: null,
          type: "empty" as const,
          ice: null, // 初始化无冰块
        }));
      setGridData(newGrid);
      setSnakes([]);
    }
  }, [rows, cols]);

  // 实时生成 JSON 数据
  useEffect(() => {
    const paths = snakes.map((snake) =>
      snake.cells.map((cellIndex) => ({
        row: Math.floor(cellIndex / cols),
        col: cellIndex % cols,
      }))
    );

    const blocks: { row: number; col: number }[] = [];
    const icePlates: { row: number; col: number; direction: Direction }[] = [];

    gridData.forEach((cell, index) => {
      const pos = {
        row: Math.floor(index / cols),
        col: index % cols,
      };

      if (cell.type === "block") {
        blocks.push(pos);
      }

      // 修改：独立检查冰块属性
      if (cell.ice) {
        icePlates.push({
          ...pos,
          direction: cell.ice.direction,
        });
      }
    });

    const output: LevelData = {
      config: { rows, cols },
      paths,
      blocks,
      icePlates,
    };

    setJsonOutput(JSON.stringify(output, null, 2));
  }, [snakes, gridData, rows, cols, currentLevelData]);

  // 修改：选择关卡目录（使用 File System Access API）
  const selectLevelsDirectory = async () => {
    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      setLevelsDirHandle(dirHandle);
      await refreshLevelFiles(dirHandle); // 抽取刷新逻辑
      message.success(`Directory selected.`);
    } catch (e) {
      message.error("Failed to select directory.");
      console.error(e);
    }
  };

  // 新增：刷新文件列表并排序
  const refreshLevelFiles = async (dirHandle: FileSystemDirectoryHandle) => {
    const files: File[] = [];
    for await (const [name, handle] of dirHandle.entries()) {
      if (name.endsWith(".json") && handle.kind === "file") {
        const file = await handle.getFile();
        files.push(file);
      }
    }

    // 排序逻辑：倒序排列，支持数字 (level_2 > level_1)
    files.sort((a, b) => {
      const nameA = a.name.replace(".json", "");
      const nameB = b.name.replace(".json", "");

      // 尝试提取数字部分进行比较
      const numA = parseInt(nameA.replace(/[^0-9]/g, ""));
      const numB = parseInt(nameB.replace(/[^0-9]/g, ""));

      if (!isNaN(numA) && !isNaN(numB)) {
        return numB - numA; // 数字倒序
      }
      return nameB.localeCompare(nameA, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

    setLevelFiles(files);
  };

  // 新增：自动添加下一个关卡文件
  const addNextLevelFile = async () => {
    if (!levelsDirHandle) {
      message.error("Please select a levels directory first.");
      return;
    }

    // 1. 找到当前最大编号
    let maxNum = 0;
    levelFiles.forEach((file) => {
      const match = file.name.match(/level_(\d+)\.json/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    });

    const nextNum = maxNum + 1;
    const newFileName = `level_${nextNum}.json`;

    // 2. 创建空白关卡数据
    const emptyLevel: LevelData = {
      id: Date.now(),
      config: { rows: 5, cols: 5 },
      paths: [],
      blocks: [],
      icePlates: [],
    };
    const content = JSON.stringify(emptyLevel, null, 2);

    try {
      // 3. 写入文件
      const fileHandle = await levelsDirHandle.getFileHandle(newFileName, {
        create: true,
      });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();

      message.success(`Created ${newFileName}`);

      // 4. 刷新列表并加载新文件
      await refreshLevelFiles(levelsDirHandle);

      // 自动加载新创建的文件（需要重新获取File对象）
      const newFileHandle = await levelsDirHandle.getFileHandle(newFileName);
      const newFile = await newFileHandle.getFile();
      loadLevel(newFile);
    } catch (e) {
      message.error("Failed to create new level file.");
      console.error(e);
    }
  };

  // 加载关卡
  const loadLevel = async (file: File) => {
    try {
      const text = await file.text();
      const data: LevelData = JSON.parse(text);
      setCurrentLevelData(data);
      setSelectedLevel(file.name);
      handleImportJson(data); // 复用导入逻辑
      message.success(`Loaded level: ${file.name}`);
    } catch (error) {
      message.error(`Failed to load level: ${file.name}`);
      console.error(error);
    }
  };

  // 保存关卡到文件
  const saveLevelToFile = async (fileName: string) => {
    if (!levelsDirHandle) {
      message.error("No levels directory selected.");
      return;
    }
    if (!jsonOutput) {
      message.error("No data to save.");
      return;
    }

    try {
      const fileHandle = await levelsDirHandle.getFileHandle(fileName, {
        create: true,
      });
      const writable = await fileHandle.createWritable();
      await writable.write(jsonOutput);
      await writable.close();
      message.success(`Level saved to ${fileName}.`);
    } catch (e) {
      message.error("Failed to save file.");
      console.error(e);
    }
  };

  // 选择目标目录
  const selectTargetDirectory = async () => {
    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      setTargetDirHandle(dirHandle);
      message.success("Target directory selected.");
    } catch (e) {
      message.error(
        "Failed to select directory. Ensure your browser supports File System Access API."
      );
      console.error(e);
    }
  };

  // 保存关卡（支持写入目录或下载）
  const saveLevel = async () => {
    if (!jsonOutput) {
      message.error("No data to save.");
      return;
    }

    const filename = selectedLevel || `level_${Date.now()}.json`;

    if (targetDirHandle) {
      try {
        const fileHandle = await targetDirHandle.getFileHandle(filename, {
          create: true,
        });
        const writable = await fileHandle.createWritable();
        await writable.write(jsonOutput);
        await writable.close();
        message.success(`Level saved to ${filename} in selected directory.`);
      } catch (e) {
        message.error("Failed to save file to directory.");
        console.error(e);
      }
    } else {
      // 回退到下载
      const blob = new Blob([jsonOutput], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      message.success("Level downloaded! (No target directory selected)");
    }
  };

  // 创建新关卡
  const createNewLevel = () => {
    setSelectedLevel(null);
    setCurrentLevelData(null);
    handleReset();
    message.info("New level created. Edit and save.");
  };

  // 生成随机关卡
  const generateRandomLevel = () => {
    const level = generateRandomLevelFunc(rows, cols, difficulty); // 调用生成函数
    handleImportJson(level);
    // setSelectedLevel(null);
    // setCurrentLevelData(level);
    message.success("Random level generated!");
  };

  // 验证关卡
  const validateCurrentLevel = () => {
    const level: LevelData = JSON.parse(jsonOutput);
    const result = validateLevel(level);
    console.log("🚀 ~ validateCurrentLevel ~ result:", result);
    setValidationResult(result);
  };

  // 复用的导入逻辑（修改为接受数据参数）
  const handleImportJson = (data?: LevelData) => {
    const levelData = data || JSON.parse(jsonOutput);

    if (!levelData.config || !levelData.paths) {
      alert("Invalid JSON format");
      return;
    }

    const newRows = levelData.config.rows;
    const newCols = levelData.config.cols;

    setRows(newRows);
    setCols(newCols);
    setInputRows(newRows);
    setInputCols(newCols);

    const newGrid: CellData[] = Array(newRows * newCols)
      .fill(null)
      .map(() => ({
        snakeId: null,
        snakeIndex: null,
        type: "empty" as const,
        ice: null,
      }));

    const newSnakes: Snake[] = [];

    levelData.paths.forEach((path) => {
      const snakeId = Date.now() + Math.random();
      const color = getRandomColor();
      const cells: number[] = [];

      path.forEach((pos, index) => {
        const cellIndex = pos.row * newCols + pos.col;
        if (cellIndex < newGrid.length) {
          cells.push(cellIndex);
          newGrid[cellIndex] = {
            snakeId,
            snakeIndex: index + 1,
            type: "snake",
          };
        }
      });

      newSnakes.push({ id: snakeId, color, cells });
    });

    if (levelData.blocks) {
      levelData.blocks.forEach((block) => {
        const cellIndex = block.row * newCols + block.col;
        if (cellIndex < newGrid.length) {
          newGrid[cellIndex] = {
            snakeId: null,
            snakeIndex: null,
            type: "block",
          };
        }
      });
    }

    if (levelData.icePlates) {
      levelData.icePlates.forEach((ice) => {
        const cellIndex = ice.row * newCols + ice.col;
        if (cellIndex < newGrid.length) {
          // 修改：只更新 ice 属性，不覆盖 type
          newGrid[cellIndex] = {
            ...newGrid[cellIndex],
            ice: { direction: ice.direction },
          };
        }
      });
    }

    setSnakes(newSnakes);
    setGridData(newGrid);
  };

  // 重置画布
  const handleReset = () => {
    if (window.confirm("Are you sure you want to clear the entire board?")) {
      const newGrid = Array(rows * cols)
        .fill(null)
        .map(() => ({
          snakeId: null,
          snakeIndex: null,
          type: "empty" as const,
          ice: null,
        }));
      setGridData(newGrid);
      setSnakes([]);
    }
  };

  // 生成随机颜色
  const getRandomColor = () => {
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  };

  // 鼠标按下开始绘制
  const handleMouseDown = (index: number) => {
    if (tool === "snake") {
      setIsDrawing(true);
      const newSnakeId = Date.now(); // 使用时间戳作为简单ID
      currentSnakeIdRef.current = newSnakeId;
      const newColor = getRandomColor();

      // 创建新蛇，并清理该格子可能存在的旧蛇数据（但不清除冰块）
      setSnakes((prev) => {
        const cleaned = prev
          .map((s) => ({
            ...s,
            cells: s.cells.filter((c) => c !== index),
          }))
          .filter((s) => s.cells.length > 0);

        return [
          ...cleaned,
          { id: newSnakeId, color: newColor, cells: [index] },
        ];
      });

      // 更新格子
      setGridData((prev) => {
        const newData = [...prev];
        // 保留原有的 ice 属性
        newData[index] = {
          ...newData[index],
          snakeId: newSnakeId,
          snakeIndex: 1,
          type: "snake",
        };
        return newData;
      });
    } else if (tool === "block") {
      handleBlockCell(index);
    } else if (tool === "ice") {
      handleIceCell(index);
    } else if (tool === "clear") {
      handleClearCell(index);
    }
  };

  // 鼠标移动（进入格子）
  const handleMouseEnter = (index: number) => {
    if (!isDrawing || tool !== "snake" || currentSnakeIdRef.current === null)
      return;

    // 如果碰到障碍物，停止绘制该格
    if (gridData[index].type === "block") return;

    const currentSnakeId = currentSnakeIdRef.current;

    setSnakes((prevSnakes) => {
      const snakeIndex = prevSnakes.findIndex((s) => s.id === currentSnakeId);
      if (snakeIndex === -1) return prevSnakes;

      const currentSnake = prevSnakes[snakeIndex];
      // 防止重复添加到同一个格子
      if (currentSnake.cells.includes(index)) return prevSnakes;

      // 清理其他蛇占用的该格子
      const cleanedSnakes = prevSnakes
        .map((s) => {
          if (s.id === currentSnakeId) return s;
          return {
            ...s,
            cells: s.cells.filter((c) => c !== index),
          };
        })
        .filter((s) => s.cells.length > 0);

      // 重新查找当前蛇索引（因为数组可能变了）
      const newSnakeIndex = cleanedSnakes.findIndex(
        (s) => s.id === currentSnakeId
      );
      if (newSnakeIndex === -1) return cleanedSnakes;

      const updatedSnake = {
        ...cleanedSnakes[newSnakeIndex],
        cells: [...cleanedSnakes[newSnakeIndex].cells, index],
      };

      const newSnakes = [...cleanedSnakes];
      newSnakes[newSnakeIndex] = updatedSnake;
      return newSnakes;
    });

    setGridData((prev) => {
      // 找到当前蛇的长度来确定 index
      const currentSnake = snakes.find((s) => s.id === currentSnakeId);
      const nextIndex = currentSnake ? currentSnake.cells.length + 1 : 1;

      const newData = [...prev];
      // 覆盖旧数据，但保留 ice
      newData[index] = {
        ...newData[index], // 保留 ice
        snakeId: currentSnakeId,
        snakeIndex: nextIndex,
        type: "snake",
      };
      return newData;
    });
  };

  // 鼠标抬起结束绘制
  const handleMouseUp = () => {
    setIsDrawing(false);
    currentSnakeIdRef.current = null;
  };

  // 处理放置障碍物
  const handleBlockCell = (index: number) => {
    // Block 会清除蛇和冰块
    setSnakes((prev) =>
      prev
        .map((s) => ({
          ...s,
          cells: s.cells.filter((c) => c !== index),
        }))
        .filter((s) => s.cells.length > 0)
    );

    setGridData((prev) => {
      const newData = [...prev];
      newData[index] = {
        snakeId: null,
        snakeIndex: null,
        type: "block",
        ice: null, // Block 处不能有冰块
      };
      return newData;
    });
  };

  // 处理放置/旋转冰块
  const handleIceCell = (index: number) => {
    setGridData((prev) => {
      const newData = [...prev];
      const currentCell = newData[index];

      // 如果是 Block，不能放冰块
      if (currentCell.type === "block") return prev;

      if (currentCell.ice) {
        // 旋转方向
        const dirs: Direction[] = ["UP", "RIGHT", "DOWN", "LEFT"];
        const currentIdx = dirs.indexOf(currentCell.ice.direction);
        const nextDir = dirs[(currentIdx + 1) % 4];

        newData[index] = {
          ...currentCell,
          ice: { direction: nextDir },
        };
      } else {
        // 放置新冰块
        newData[index] = {
          ...currentCell,
          ice: { direction: "UP" },
        };
      }
      return newData;
    });
  };

  // 处理清除逻辑
  const handleClearCell = (index: number) => {
    const targetCell = gridData[index];

    if (targetCell.type === "empty") return;

    if (targetCell.type === "block") {
      // 清除 Block
      setGridData((prev) => {
        const newData = [...prev];
        newData[index] = {
          snakeId: null,
          snakeIndex: null,
          type: "empty",
          ice: null,
        };
        return newData;
      });
    } else if (targetCell.ice) {
      // 清除冰块
      setGridData((prev) => {
        const newData = [...prev];
        newData[index] = { ...newData[index], ice: null };
        return newData;
      });
    } else if (targetCell.type === "snake" && targetCell.snakeId) {
      // 清除整条蛇，保留冰块
      const idToRemove = targetCell.snakeId;

      // 1. 从 snakes 数组中移除
      setSnakes((prev) => prev.filter((s) => s.id !== idToRemove));

      // 2. 从 gridData 中移除所有属于该蛇的格子
      setGridData((prev) =>
        prev.map((cell) =>
          cell.snakeId === idToRemove
            ? { ...cell, snakeId: null, snakeIndex: null, type: "empty" } // 保留 ice
            : cell
        )
      );
    }
  };

  // 创建网格样式
  const gridStyle = {
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, 50px)`,
    gridTemplateRows: `repeat(${rows}, 50px)`,
    gap: "1px",
    backgroundColor: "#ccc",
    border: "1px solid #ccc",
    userSelect: "none" as const, // 防止拖拽时选中文本
  };

  const cellStyle = {
    backgroundColor: "#fff",
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: tool === "snake" ? "crosshair" : "pointer",
    fontSize: "14px",
    fontWeight: "bold",
    color: "#fff",
  };

  const handleUpdateGrid = () => {
    setRows(inputRows);
    setCols(inputCols);
    // Grid data will be reset by useEffect
  };

  // 计算方向箭头：从当前格子指向目标格子（前一个格子）
  const getDirectionArrow = (fromIndex: number, toIndex: number) => {
    const fromRow = Math.floor(fromIndex / cols);
    const fromCol = fromIndex % cols;
    const toRow = Math.floor(toIndex / cols);
    const toCol = toIndex % cols;

    const dRow = toRow - fromRow;
    const dCol = toCol - fromCol;

    if (dRow === -1 && dCol === 0) return "⬆️";
    if (dRow === 1 && dCol === 0) return "⬇️";
    if (dRow === 0 && dCol === -1) return "⬅️";
    if (dRow === 0 && dCol === 1) return "➡️";

    // 处理斜向（防止快速拖动时产生的斜向连接）
    if (dRow === -1 && dCol === -1) return "↖️";
    if (dRow === -1 && dCol === 1) return "↗️";
    if (dRow === 1 && dCol === -1) return "↙️";
    if (dRow === 1 && dCol === 1) return "↘️";

    return "";
  };

  return (
    <div
      onMouseUp={handleMouseUp}
      style={{ minHeight: "100vh", width: "100vw", overflow: "hidden" }}
    >
      <Row style={{ height: "100vh" }}>
        {/* 左侧：画板和工具栏 */}
        <Col
          span={16}
          style={{ height: "100%", overflowY: "auto", padding: "20px" }}
        >
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            {/* 画板区域 */}
            <div
              className="container"
              style={{
                overflow: "auto",
                border: "1px solid #eee",
                padding: "20px",
                borderRadius: "8px",
                background: "#fff",
                minHeight: "400px",
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
              }}
            >
              <div style={gridStyle}>
                {gridData.map((cell, index) => {
                  let backgroundColor = "#fff";
                  let content: React.ReactNode = "";

                  // 渲染优先级：Block > Snake > Ice (背景)
                  if (cell.type === "block") {
                    backgroundColor = "#555";
                    content = "🧱";
                  } else {
                    // 冰块处理 (作为背景或底层)
                    if (cell.ice) {
                      backgroundColor = "#e6f7ff"; // 冰块底色
                      const arrowMap: Record<string, string> = {
                        UP: "⬆️",
                        DOWN: "⬇️",
                        LEFT: "⬅️",
                        RIGHT: "➡️",
                      };
                      // 如果没有蛇，显示大箭头
                      if (cell.type !== "snake") {
                        content = (
                          <span style={{ fontSize: "24px", color: "#1890ff" }}>
                            {arrowMap[cell.ice.direction]}
                          </span>
                        );
                      }
                    }

                    // 蛇处理 (覆盖在冰块上)
                    if (cell.type === "snake" && cell.snakeId) {
                      const snake = snakes.find((s) => s.id === cell.snakeId);
                      if (snake) {
                        backgroundColor = snake.color; // 蛇的颜色覆盖冰块底色

                        // 蛇的内容
                        let snakeContent: React.ReactNode = "";
                        if (cell.snakeIndex === 1) {
                          const r = Math.floor(index / cols);
                          const c = index % cols;
                          snakeContent = (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                lineHeight: 1,
                              }}
                            >
                              <span style={{ fontSize: "16px" }}>🐍</span>
                              <span style={{ fontSize: "10px" }}>
                                {r},{c}
                              </span>
                            </div>
                          );
                        } else if (cell.snakeIndex && cell.snakeIndex > 1) {
                          // 获取前一个格子的索引 (snakeIndex 是 1-based，所以 -2 获取前一个)
                          const prevIndex = snake.cells[cell.snakeIndex - 2];
                          const arrow = getDirectionArrow(index, prevIndex);

                          snakeContent = (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                lineHeight: 1,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "16px",
                                  marginBottom: "-4px",
                                }}
                              >
                                {arrow}
                              </span>
                              <span
                                style={{
                                  fontSize: "12px",
                                  textShadow: "0 0 2px #000",
                                }}
                              >
                                {cell.snakeIndex}
                              </span>
                            </div>
                          );
                        }

                        // 如果有冰块，叠加显示
                        if (cell.ice) {
                          const arrowMap: Record<string, string> = {
                            UP: "⬆️",
                            DOWN: "⬇️",
                            LEFT: "⬅️",
                            RIGHT: "➡️",
                          };
                          content = (
                            <div
                              style={{
                                position: "relative",
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {/* 蛇的内容 */}
                              {snakeContent || content}
                              {/* 冰块小图标，显示在右上角 */}
                              <div
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  right: 0,
                                  fontSize: "10px",
                                  background: "rgba(255,255,255,0.7)",
                                  borderRadius: "50%",
                                }}
                              >
                                {arrowMap[cell.ice.direction]}
                              </div>
                            </div>
                          );
                        } else {
                          content = snakeContent || content;
                        }
                      }
                    }
                  }

                  return (
                    <div
                      key={index}
                      style={{ ...cellStyle, backgroundColor }}
                      onMouseDown={() => handleMouseDown(index)}
                      onMouseEnter={() => handleMouseEnter(index)}
                    >
                      {content}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 工具栏区域 */}
            <div
              className="tools"
              style={{
                padding: "20px",
                background: "#fafafa",
                borderRadius: "8px",
                border: "1px solid #eee",
              }}
            >
              <Space
                direction="vertical"
                size="middle"
                style={{ width: "100%" }}
              >
                {/* 网格设置区域 */}
                <Row gutter={16} align="middle">
                  <Col>
                    <Space>
                      <Text>Cols:</Text>
                      <InputNumber
                        min={1}
                        max={50}
                        value={inputCols}
                        onChange={(val) => setInputCols(val || 5)}
                      />
                    </Space>
                  </Col>
                  <Col>
                    <Space>
                      <Text>Rows:</Text>
                      <InputNumber
                        min={1}
                        max={50}
                        value={inputRows}
                        onChange={(val) => setInputRows(val || 5)}
                      />
                    </Space>
                  </Col>
                  <Col>
                    <Button type="primary" onClick={handleUpdateGrid}>
                      Update Grid
                    </Button>
                  </Col>
                </Row>

                {/* 工具选择区域 */}
                <Row gutter={16} align="middle">
                  <Col>
                    <Text strong>Tool Mode:</Text>
                  </Col>
                  <Col>
                    <Radio.Group
                      value={tool}
                      onChange={(e) => setTool(e.target.value)}
                      buttonStyle="solid"
                    >
                      <Radio.Button value="snake">Snake 🐍</Radio.Button>
                      <Radio.Button value="block">Block 🧱</Radio.Button>
                      <Radio.Button value="ice">Ice ❄️</Radio.Button>
                      <Radio.Button value="clear">Clear 🧹</Radio.Button>
                    </Radio.Group>
                  </Col>
                </Row>

                <div style={{ color: "#888", fontSize: "12px" }}>
                  Current Action: {tool.toUpperCase()}
                </div>

                {/* 难度选择和生成按钮 */}
                <Row gutter={16} align="middle">
                  <Col>
                    <Text strong>Difficulty:</Text>
                  </Col>
                  <Col>
                    <Radio.Group
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                    >
                      <Radio.Button value="easy">Easy</Radio.Button>
                      <Radio.Button value="medium">Medium</Radio.Button>
                      <Radio.Button value="hard">Hard</Radio.Button>
                    </Radio.Group>
                  </Col>
                  <Col>
                    <Button onClick={generateRandomLevel}>
                      Generate Random Level
                    </Button>
                  </Col>
                </Row>
              </Space>
            </div>
          </Space>
        </Col>

        {/* 右侧：关卡列表和JSON编辑器 */}
        <Col
          span={8}
          style={{
            height: "100%",
            borderLeft: "1px solid #eee",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* 关卡管理工具栏 */}
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            <Row gutter={8}>
              <Col>
                <Button onClick={selectLevelsDirectory}>
                  Select Levels Directory
                </Button>
              </Col>
              <Col>
                <Button onClick={selectTargetDirectory}>
                  Select Target Directory
                </Button>
              </Col>
            </Row>
            <Row gutter={8}>
              <Col>
                <Button onClick={createNewLevel}>Reset Board</Button>
              </Col>
              <Col>
                <Button onClick={addNextLevelFile} type="dashed">
                  Add Level File
                </Button>
              </Col>
            </Row>
            <Row gutter={8}>
              <Col>
                <Button onClick={saveLevel} type="primary">
                  Save Level
                </Button>
              </Col>
              <Col>
                <Button onClick={validateCurrentLevel}>Validate Level</Button>
              </Col>
            </Row>
          </Space>

          {/* 验证结果 */}
          {validationResult && (
            <Alert
              message={
                validationResult.isValid
                  ? "Level is valid!"
                  : "Level has issues!"
              }
              description={
                <ul style={{ paddingLeft: "20px", margin: 0 }}>
                  {validationResult.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              }
              type={validationResult.isValid ? "success" : "error"}
              showIcon
              closable
              onClose={() => setValidationResult(null)}
            />
          )}

          {/* 当前关卡信息 */}
          {selectedLevel && (
            <Text strong style={{ marginBottom: "10px" }}>
              Editing: {selectedLevel}
            </Text>
          )}

          {/* 目标目录信息 */}
          {targetDirHandle && (
            <Text style={{ marginBottom: "10px", color: "#52c41a" }}>
              Target Directory: Selected
            </Text>
          )}

          {/* 关卡列表 */}
          <div style={{ flex: 1, overflowY: "auto", marginBottom: "10px" }}>
            <List
              size="small"
              bordered
              dataSource={levelFiles}
              renderItem={(file) => (
                <List.Item
                  actions={[
                    <Button
                      size="small"
                      onClick={() => loadLevel(file)}
                      disabled={selectedLevel === file.name}
                    >
                      Load
                    </Button>,
                    <Button
                      size="small"
                      onClick={() => saveLevelToFile(file.name)}
                      type="primary"
                    >
                      Save
                    </Button>,
                  ]}
                >
                  {file.name}
                </List.Item>
              )}
            />
          </div>

          {/* JSON 编辑器 */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <Text strong style={{ marginBottom: "10px" }}>
              Level JSON Data:
            </Text>
            <TextArea
              value={jsonOutput}
              onChange={(e) => setJsonOutput(e.target.value)}
              style={{
                fontFamily: "monospace",
                backgroundColor: "#f5f5f5",
                flex: 1,
                resize: "none",
              }}
            />
          </div>
        </Col>
      </Row>
    </div>
  );
}

export default App;
