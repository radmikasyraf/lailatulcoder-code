/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
export declare const MONTH_LABELS: string[];
export type HeatmapIntensity = 0 | 1 | 2 | 3 | 4;
export interface HeatmapCell {
    char: string;
    intensity: HeatmapIntensity;
    isToday?: boolean;
}
export interface HeatmapRow {
    label: string;
    cells: HeatmapCell[];
}
export interface HeatmapColLabel {
    col: number;
    text: string;
}
export interface HeatmapData {
    colLabels: HeatmapColLabel[];
    totalCols: number;
    startDate: string;
    endDate: string;
    rows: HeatmapRow[];
}
export declare function buildHeatmapData(data: Record<string, number>, weeks?: number, monthOffset?: number): HeatmapData;
export interface LineChartPoint {
    date: string;
    value: number;
}
export interface BrailleLineCell {
    char: string;
    filled: boolean;
    isDataPoint?: boolean;
}
export interface BrailleLineResult {
    rows: BrailleLineCell[][];
    yLabels: string[];
    xLabels: string;
    peak: number;
}
export declare function buildBrailleLineChart(data: LineChartPoint[], chartWidth: number, chartHeight?: number): BrailleLineResult | null;
