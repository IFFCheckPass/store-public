/**
 * 年段 / 班级的解析与拼装。
 * 统一格式：`高一(3)` 这种「年段 + (班号)」，班级号 1-17。
 * 后端对应规则见 server/lib/validate.js 的 assertClassName，两边保持一致。
 */
export const GRADES = ['高一', '高二', '高三'];
export const CLASS_NO_MIN = 1;
export const CLASS_NO_MAX = 17;

/** 把「高二(3)班」「高二（3）」「高二3」等写法解析成 { grade, classNo } */
export function parseClassName(value) {
  const text = String(value || '')
    .trim()
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/\s+/g, '');
  const match = text.match(/^(高一|高二|高三)\(?(\d{1,2})\)?班?$/);
  if (!match) return { grade: '', classNo: '', valid: false };
  const classNo = Number(match[2]);
  if (!Number.isInteger(classNo) || classNo < CLASS_NO_MIN || classNo > CLASS_NO_MAX) {
    return { grade: '', classNo: '', valid: false };
  }
  return { grade: match[1], classNo: String(classNo), valid: true };
}

/** 拼成标准班级名，参数不合法返回空串 */
export function buildClassName(grade, classNo) {
  const n = Number(classNo);
  if (!GRADES.includes(grade) || !Number.isInteger(n) || n < CLASS_NO_MIN || n > CLASS_NO_MAX) {
    return '';
  }
  return `${grade}(${n})班`;
}

/** 排序权重：高一 < 高二 < 高三，同一年级按班号；无法解析的排最后 */
export function classSortValue(className) {
  const { grade, classNo } = parseClassName(className);
  const gradeIndex = GRADES.indexOf(grade);
  if (gradeIndex < 0) return 9999;
  return gradeIndex * 100 + Number(classNo || 0);
}
