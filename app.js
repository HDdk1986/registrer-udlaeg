if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));

const EMPLOYEE = { name: "Henrik D", area: "SYD" };
const MOBILE_STORAGE_KEY = "udlaeg-henrik-mobile";
const FINANCE_EMAIL = "oko@bomidtvest.dk";
const TYPES = {
  catering: { title: "Forplejning", requisition: "169439", label: "Hvad vedrører forplejningen?", placeholder: "Fx frokost ifm. besigtigelse", slug: "forplejning" },
  caretaker_meeting: { title: "Viceværtmøder", requisition: "169440", label: "Hvem har deltaget?", placeholder: "Skriv deltagernes navne", slug: "vicevaertmoede" },
  other: { title: "Andet", requisition: "", label: "Hvad vedrører udlægget?", placeholder: "Beskriv kort udlæggets formål", slug: "andet" },
};

const form = document.querySelector("#expense-form");
const receiptsInput = document.querySelector("#receipts");
const receiptList = document.querySelector("#receipt-list");
const resultPanel = document.querySelector("#result");
const submitButton = form.querySelector("button[type=submit]");
let receipts = [];
let pdfUrl = null;

function loadSavedMobile() {
  try { return localStorage.getItem(MOBILE_STORAGE_KEY) || ""; }
  catch { return ""; }
}

function saveMobile(value) {
  try {
    if (value) localStorage.setItem(MOBILE_STORAGE_KEY, value);
    else localStorage.removeItem(MOBILE_STORAGE_KEY);
  } catch {}
}

form.elements.mobile.value = loadSavedMobile();
form.elements.mobile.addEventListener("change", () => saveMobile(form.elements.mobile.value.trim()));
form.elements.date.value = new Date().toISOString().slice(0, 10);
form.elements.expenseType.addEventListener("change", () => {
  const type = TYPES[form.elements.expenseType.value] || TYPES.other;
  document.querySelector("#detail-label").textContent = type.label;
  form.elements.detail.placeholder = type.placeholder;
});

receiptsInput.addEventListener("change", () => {
  receipts.push(...[...receiptsInput.files].map(file => ({ file, preview: URL.createObjectURL(file) })));
  receiptsInput.value = "";
  renderReceipts();
});

function renderReceipts() {
  receiptList.innerHTML = receipts.map((receipt, index) => `<div class="receipt-item"><div class="receipt-thumb" style="background-image:url('${receipt.preview}')" aria-label="Bon ${index + 1}"></div><span class="receipt-number">${index + 1}</span><button class="remove-receipt" type="button" data-remove="${index}" aria-label="Fjern bon ${index + 1}">×</button></div>`).join("");
  receiptList.querySelectorAll("[data-remove]").forEach(button => button.addEventListener("click", () => {
    const [removed] = receipts.splice(Number(button.dataset.remove), 1);
    URL.revokeObjectURL(removed.preview);
    renderReceipts();
  }));
}

function parseAmount(value) {
  let cleaned = String(value).trim().toLowerCase().replace(/\s/g, "").replace(/kr\.?/g, "");
  if (cleaned.includes(",")) cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) cleaned = cleaned.replace(/\./g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) && number > 0 ? number : null;
}

const currency = value => new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" }).format(value);
const dateLabel = value => new Intl.DateTimeFormat("da-DK").format(new Date(`${value}T12:00:00`));

function wrapText(context, value, x, y, maxWidth, lineHeight) {
  const lines = [];
  let line = "";
  String(value).split(/\s+/).forEach(word => {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > maxWidth) { lines.push(line); line = word; }
    else line = next;
  });
  if (line) lines.push(line);
  lines.forEach((text, index) => context.fillText(text, x, y + index * lineHeight));
  return y + Math.max(lines.length, 1) * lineHeight;
}

async function summaryImage(summary) {
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1754;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#0b6268";
  context.fillRect(0, 0, canvas.width, 250);
  context.textBaseline = "top";
  context.fillStyle = "#fff";
  context.font = "700 62px Arial";
  context.fillText("Medarbejderudlæg", 96, 72);
  context.font = "31px Arial";
  context.fillText("Registrer udlæg", 96, 160);

  const rows = [
    ["Medarbejder/cvr:", `${summary.mobile} - ${EMPLOYEE.name}`],
    ["Område:", EMPLOYEE.area],
    ["Rekv. nr./vedrører:", summary.type],
    [summary.detailLabel, summary.detail],
    ["Beløb:", summary.amount],
    ["Dato:", summary.date],
    ["Antal bonner:", String(summary.count)],
  ];
  let y = 315;
  rows.forEach(([label, value]) => {
    context.fillStyle = "#607477";
    context.font = "700 27px Arial";
    context.fillText(label, 96, y);
    y += 42;
    context.fillStyle = "#153033";
    context.font = "38px Arial";
    y = wrapText(context, value, 96, y, 1048, 48) + 24;
    context.strokeStyle = "#d9e3e2";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(96, y);
    context.lineTo(1144, y);
    context.stroke();
    y += 27;
  });
  context.fillStyle = "#607477";
  context.font = "28px Arial";
  context.fillText("Efterfølgende sider indeholder bonner og kvitteringer.", 96, 1660);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", .9));
  return { width: canvas.width, height: canvas.height, bytes: new Uint8Array(await blob.arrayBuffer()) };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Billedet ${file.name} kunne ikke læses.`)); };
    image.src = url;
  });
}

async function receiptImage(file) {
  const image = await loadImage(file);
  const scale = Math.min(1, 2200 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", .86));
  return { width: canvas.width, height: canvas.height, bytes: new Uint8Array(await blob.arrayBuffer()) };
}

function pdfFromImages(images) {
  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let length = 0;
  const bytes = part => { chunks.push(part); length += part.byteLength; };
  const text = part => bytes(encoder.encode(part));
  const object = id => { offsets[id] = length; text(`${id} 0 obj\n`); };
  text("%PDF-1.4\n%âãÏÓ\n");
  object(1); text("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  object(2); text(`<< /Type /Pages /Count ${images.length} /Kids [${images.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>\nendobj\n`);
  images.forEach((image, index) => {
    const page = 3 + index * 3, imageId = page + 1, content = page + 2;
    const pageWidth = 595.28, pageHeight = 841.89, margin = 24;
    const scale = Math.min((pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height);
    const width = image.width * scale, height = image.height * scale;
    const command = `q\n${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${((pageWidth - width) / 2).toFixed(2)} ${((pageHeight - height) / 2).toFixed(2)} cm\n/Im${index + 1} Do\nQ\n`;
    object(page); text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${content} 0 R >>\nendobj\n`);
    object(imageId); text(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.byteLength} >>\nstream\n`); bytes(image.bytes); text("\nendstream\nendobj\n");
    object(content); text(`<< /Length ${encoder.encode(command).byteLength} >>\nstream\n${command}endstream\nendobj\n`);
  });
  const xref = length;
  const count = 2 + images.length * 3;
  text(`xref\n0 ${count + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= count; id++) text(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  text(`trailer\n<< /Size ${count + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: "application/pdf" });
}

function download(file) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function showResult(file, subject) {
  const body = "Hej økonomi,\n\nVedhæftet er et medarbejderudlæg.";
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  pdfUrl = URL.createObjectURL(file);
  resultPanel.innerHTML = `<div class="success-icon">✓</div><p class="eyebrow">PDF klar</p><h2>Udlægget er samlet</h2><p class="result-copy">PDF'en indeholder alle oplysninger og ${receipts.length} ${receipts.length === 1 ? "bon" : "bonner"}.</p><button class="primary-button" id="share">Del PDF til mail</button><button class="secondary-button" id="mail">Download PDF og åbn mail</button><a class="text-button" href="${pdfUrl}" download="${file.name}">Download kun PDF</a><p class="result-help">Mailen klargøres til ${FINANCE_EMAIL}.</p>`;
  resultPanel.classList.remove("is-hidden");
  const mailto = () => `mailto:${encodeURIComponent(FINANCE_EMAIL)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  resultPanel.querySelector("#share").addEventListener("click", async () => {
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      try { await navigator.share({ title: subject, text: body, files: [file] }); return; }
      catch (error) { if (error.name === "AbortError") return; }
    }
    download(file); location.href = mailto();
  });
  resultPanel.querySelector("#mail").addEventListener("click", () => { download(file); location.href = mailto(); });
  resultPanel.scrollIntoView({ behavior: "smooth" });
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const amount = parseAmount(form.elements.amount.value);
  const mobile = form.elements.mobile.value.trim();
  form.elements.amount.setCustomValidity(amount ? "" : "Indtast et gyldigt beløb, fx 245,50.");
  if (!form.reportValidity()) return;
  if (!receipts.length) {
    receiptsInput.setCustomValidity("Tilføj mindst én bon.");
    receiptsInput.reportValidity();
    receiptsInput.setCustomValidity("");
    return;
  }
  const type = TYPES[form.elements.expenseType.value];
  const typeText = type.requisition ? `${type.requisition} - ${type.title}` : type.title;
  saveMobile(mobile);
  submitButton.disabled = true;
  submitButton.textContent = "Laver PDF …";
  resultPanel.classList.add("is-hidden");
  try {
    const images = [await summaryImage({ mobile, type: typeText, detailLabel: type.label.replace("?", ":"), detail: form.elements.detail.value, amount: currency(amount), date: dateLabel(form.elements.date.value), count: receipts.length })];
    for (const receipt of receipts) {
      submitButton.textContent = `Behandler bon ${images.length} af ${receipts.length} …`;
      images.push(await receiptImage(receipt.file));
    }
    const file = new File([pdfFromImages(images)], `udlaeg-syd-${type.slug}-${form.elements.date.value}.pdf`, { type: "application/pdf" });
    showResult(file, `Udlæg - ${EMPLOYEE.name} - ${typeText} - ${form.elements.date.value}`);
  } catch (error) {
    resultPanel.innerHTML = `<h2>PDF'en kunne ikke laves</h2><p class="error-copy">${error.message || "Prøv igen."}</p>`;
    resultPanel.classList.remove("is-hidden");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Lav PDF og klargør mail";
  }
});
