// 坐标
export interface ICoord {
  row: number;
  col: number;
}

// 蛇的路径 (支持可选颜色)
export interface ISnakePath {
  id: string; // 编辑器内部用的唯一ID
  color?: string; // 可选指定颜色
  coords: ICoord[];
}

// 关卡数据
export interface ILevelData {
  id: number;
  config: {
    rows: number;
    cols: number;
  };
  paths: ISnakePath[]; // 最终导出时会转换格式
  blocks: ICoord[];
}

// 编辑器模式
export type EditorMode = "SELECT" | "SNAKE" | "BLOCK" | "ERASE";
