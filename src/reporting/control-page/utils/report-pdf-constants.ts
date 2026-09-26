export const PAGE_MARGIN_MM = 10;
export const A4_PORTRAIT_WIDTH_MM = 210;
export const A4_PORTRAIT_HEIGHT_MM = 297;
export const A4_LANDSCAPE_WIDTH_MM = 297;
export const A4_LANDSCAPE_HEIGHT_MM = 210;

export const USABLE_WIDTH_PORTRAIT_MM = A4_PORTRAIT_WIDTH_MM - PAGE_MARGIN_MM * 2; // 190 mm
export const USABLE_HEIGHT_PORTRAIT_MM = A4_PORTRAIT_HEIGHT_MM - PAGE_MARGIN_MM * 2; // 277 mm

export const USABLE_WIDTH_LANDSCAPE_MM = A4_LANDSCAPE_WIDTH_MM - PAGE_MARGIN_MM * 2; // 277 mm
export const USABLE_HEIGHT_LANDSCAPE_MM = A4_LANDSCAPE_HEIGHT_MM - PAGE_MARGIN_MM * 2; // 190 mm

export const PDF_COLORS = {
  textPrimary: [23, 32, 51] as [number, number, number], // #172033
  textMuted: [100, 116, 139] as [number, number, number], // #64748b
  linkBlue: [2, 132, 199] as [number, number, number], // #0284c7
  borderGray: [203, 213, 225] as [number, number, number], // #cbd5e1
  bgSubtle: [248, 250, 252] as [number, number, number], // #f8fafc
  headerFill: [241, 245, 249] as [number, number, number], // #f1f5f9
  badgeNeutral: [226, 232, 240] as [number, number, number],
  badgeGreen: [220, 252, 231] as [number, number, number],
  badgeAmber: [254, 243, 199] as [number, number, number],
  badgeRed: [254, 226, 226] as [number, number, number],
  severityCritical: [185, 28, 28] as [number, number, number],
  severityHigh: [194, 65, 12] as [number, number, number],
  severityMedium: [180, 83, 9] as [number, number, number],
  severityLow: [71, 85, 105] as [number, number, number],
} as const;

export const PDF_FONT_SIZES = {
  h1: 18,
  h2: 13,
  h3: 11,
  body: 10,
  tableDefault: 9,
  tableFloor: 8,
  small: 8.5,
  footer: 8,
} as const;

export const PT_TO_MM = 0.352778;
