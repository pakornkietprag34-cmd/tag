/* ============================================================
   ตัวคำนวณภาษีเงินได้บุคคลธรรมดา (แบบขั้นบันได)
   - คำนวณภาษีจาก UI
   - บันทึก / เรียกคืนข้อมูลที่เคยกรอกด้วย localStorage
   ============================================================ */

const STORAGE_KEY = "taxHelper:lastEntry";
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_KEY = "YOUR_PUBLISHABLE_KEY";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);
// อัตราภาษีเงินได้บุคคลธรรมดาแบบขั้นบันได (บาท)
const TAX_BRACKETS = [
  { min: 0,       max: 150000,   rate: 0.00 },
  { min: 150000,  max: 300000,   rate: 0.05 },
  { min: 300000,  max: 500000,   rate: 0.10 },
  { min: 500000,  max: 750000,   rate: 0.15 },
  { min: 750000,  max: 1000000,  rate: 0.20 },
  { min: 1000000, max: 2000000,  rate: 0.25 },
  { min: 2000000, max: 5000000,  rate: 0.30 },
  { min: 5000000, max: Infinity, rate: 0.35 },
];

// ===== DOM refs =====
const form = document.getElementById("taxForm");
const nameInput = document.getElementById("name");
const incomeInput = document.getElementById("income");
const maritalSelect = document.getElementById("maritalStatus");
const childrenInput = document.getElementById("children");
const otherDeductionsInput = document.getElementById("otherDeductions");

const saveBtn = document.getElementById("saveBtn");
const loadBtn = document.getElementById("loadBtn");
const clearBtn = document.getElementById("clearBtn");
const storageStatus = document.getElementById("storageStatus");

const emptyState = document.getElementById("emptyState");
const resultState = document.getElementById("resultState");
const netIncomeOut = document.getElementById("netIncomeOut");
const taxOut = document.getElementById("taxOut");
const effectiveRateOut = document.getElementById("effectiveRateOut");
const topBracketOut = document.getElementById("topBracketOut");
const taxLadder = document.getElementById("taxLadder");
const adviceBox = document.getElementById("adviceBox");

// ===== Helpers =====
function formatBaht(n) {
  return Math.round(n).toLocaleString("th-TH");
}

function readForm() {
  return {
    name: nameInput.value.trim(),
    income: Number(incomeInput.value) || 0,
    maritalStatus: maritalSelect.value,
    children: Number(childrenInput.value) || 0,
    otherDeductions: Number(otherDeductionsInput.value) || 0,
  };
}

function fillForm(data) {
  if (!data) return;
  nameInput.value = data.name || "";
  incomeInput.value = data.income || "";
  maritalSelect.value = data.maritalStatus || "single";
  childrenInput.value = data.children || 0;
  otherDeductionsInput.value = data.otherDeductions || 0;
}

// ===== Core tax calculation =====
function calculateDeductions(data) {
  // ค่าใช้จ่าย: 50% ของรายได้ สูงสุด 100,000
  const expenseDeduction = Math.min(data.income * 0.5, 100000);

  // ค่าลดหย่อนส่วนตัว
  let personalAllowance = 60000;

  // คู่สมรส
  if (data.maritalStatus === "spouse") {
    personalAllowance += 60000;
  } else {
    personalAllowance += 0;
  }

  // บุตร คนละ 30,000
  const childDeduction = data.children > 0 ? data.children * 30000 : 0;

  const otherDeductions = data.otherDeductions > 0 ? data.otherDeductions : 0;

  return expenseDeduction + personalAllowance + childDeduction + otherDeductions;
}

function calculateTax(netIncome) {
  let tax = 0;
  let topBracketLabel = "ไม่ต้องเสียภาษี";
  const breakdown = [];

  for (let i = 0; i < TAX_BRACKETS.length; i++) {
    const bracket = TAX_BRACKETS[i];

    if (netIncome > bracket.min) {
      const taxableInThisBracket = Math.min(netIncome, bracket.max) - bracket.min;
      const taxForBracket = taxableInThisBracket * bracket.rate;

      tax += taxForBracket;
      breakdown.push({ ...bracket, taxableInThisBracket, taxForBracket });

      if (bracket.rate > 0) {
        topBracketLabel = `${Math.round(bracket.rate * 100)}%`;
      }
    } else {
      breakdown.push({ ...bracket, taxableInThisBracket: 0, taxForBracket: 0 });
    }
  }

  return { tax, topBracketLabel, breakdown };
}

function buildAdvice(data, netIncome, tax, effectiveRate) {
  // ใช้ if/else จำแนกประเภทคำแนะนำ
  if (data.income <= 0) {
    return "กรอกรายได้ต่อปีของคุณเพื่อเริ่มคำนวณ";
  } else if (netIncome <= 0) {
    return "เงินได้สุทธิของคุณต่ำกว่าเกณฑ์ที่ต้องเสียภาษี ยินดีด้วย! ไม่ต้องจ่ายภาษีในปีนี้";
  } else if (tax === 0) {
    return "เงินได้สุทธิของคุณอยู่ในช่วงยกเว้นภาษี (ไม่เกิน 150,000 บาท) ไม่ต้องชำระภาษี";
  } else if (effectiveRate < 10) {
    return "ภาระภาษีของคุณยังอยู่ในระดับต่ำ ลองพิจารณาซื้อกองทุน SSF/RMF หรือประกันชีวิตเพิ่มเติม เพื่อใช้สิทธิลดหย่อนในปีถัดไป";
  } else if (effectiveRate < 20) {
    return "ภาระภาษีอยู่ในระดับปานกลาง การเพิ่มค่าลดหย่อน เช่น กองทุนสำรองเลี้ยงชีพหรือประกันสุขภาพ จะช่วยลดฐานภาษีได้อย่างมีนัยสำคัญ";
  } else {
    return "คุณอยู่ในขั้นภาษีสูง ควรวางแผนภาษีล่วงหน้า เช่น กระจายรายได้ ใช้สิทธิลดหย่อนเต็มวงเงิน หรือปรึกษาผู้เชี่ยวชาญด้านภาษี";
  }
}

function renderLadder(breakdown) {
  taxLadder.innerHTML = "";
  const maxTaxable = Math.max(...breakdown.map(b => b.max === Infinity ? b.min * 1.3 : b.max - b.min), 1);

  breakdown.forEach((b) => {
    const isActive = b.taxableInThisBracket > 0;
    const rangeLabel = b.max === Infinity
      ? `${(b.min / 1000000).toFixed(1)}ล้าน+`
      : `${(b.min / 1000).toFixed(0)}k-${(b.max / 1000).toFixed(0)}k`;

    const rung = document.createElement("div");
    rung.className = "rung" + (isActive ? " active" : "");

    const widthPercent = Math.min((b.taxableInThisBracket / maxTaxable) * 100, 100);

    rung.innerHTML = `
      <span>${rangeLabel} · ${Math.round(b.rate * 100)}%</span>
      <span class="rung-bar-track"><span class="rung-bar-fill" style="width:${widthPercent}%"></span></span>
      <span class="rung-amount">${b.taxForBracket > 0 ? formatBaht(b.taxForBracket) : "-"}</span>
    `;
    taxLadder.appendChild(rung);
  });
}

function runCalculation() {
  const data = readForm();
  const totalDeductions = calculateDeductions(data);
  const netIncome = Math.max(data.income - totalDeductions, 0);
  const { tax, topBracketLabel, breakdown } = calculateTax(netIncome);
  const effectiveRate = data.income > 0 ? (tax / data.income) * 100 : 0;

  netIncomeOut.textContent = formatBaht(netIncome);
  taxOut.textContent = formatBaht(tax);
  effectiveRateOut.textContent = `${effectiveRate.toFixed(1)}%`;
  topBracketOut.textContent = topBracketLabel;

  renderLadder(breakdown);
  adviceBox.textContent = buildAdvice(data, netIncome, tax, effectiveRate);

  emptyState.classList.add("hidden");
  resultState.classList.remove("hidden");
}

// ===== localStorage: save / load / clear =====
function saveToStorage() {
  const data = readForm();

  if (data.income <= 0) {
    storageStatus.textContent = "กรอกรายได้ก่อนบันทึกข้อมูล";
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    storageStatus.textContent = "บันทึกข้อมูลแล้ว ✓";
    storageStatus.classList.add("saved");
  } catch (err) {
    storageStatus.textContent = "บันทึกไม่สำเร็จ";
  }
}

function loadFromStorage(isManual = false) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      storageStatus.textContent = "ยังไม่มีข้อมูลที่บันทึกไว้";
      storageStatus.classList.remove("saved");
      return false;
    }
    const data = JSON.parse(raw);
    fillForm(data);
    storageStatus.textContent = isManual
      ? `เรียกข้อมูลของ "${data.name || "ผู้ใช้"}" กลับมาแล้ว ✓`
      : `โหลดข้อมูลเดิมของ "${data.name || "ผู้ใช้"}" อัตโนมัติ`;
    storageStatus.classList.add("saved");
    return true;
  } catch (err) {
    storageStatus.textContent = "ไม่สามารถโหลดข้อมูลเดิมได้";
    return false;
  }
}

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
  storageStatus.textContent = "ล้างข้อมูลที่บันทึกไว้แล้ว";
  storageStatus.classList.remove("saved");
}

// ===== Events =====
form.addEventListener("submit", (e) => {
  e.preventDefault();
  runCalculation();
});

saveBtn.addEventListener("click", saveToStorage);
loadBtn.addEventListener("click", () => {
  const loaded = loadFromStorage(true);
  if (loaded) {
    runCalculation();
  }
});
clearBtn.addEventListener("click", clearStorage);

// เรียกคืนข้อมูลที่เคยกรอกไว้ทันทีที่เปิดหน้า
window.addEventListener("DOMContentLoaded", loadFromStorage);
