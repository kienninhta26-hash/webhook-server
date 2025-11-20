// index.js — Webhook + Product sync server for Pancake + Bot
const express = require("express");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const XLSX = require("xlsx");
const Fuse = require("fuse.js");
const morgan = require("morgan");

const app = express();
app.use(express.json());
app.use(morgan("tiny"));

// ========== ENV ==========
const PANCAKE_API_KEY = process.env.PANCAKE_API_KEY || "";
const PANCAKE_BASE_URL = process.env.PANCAKE_BASE_URL || "https://pos.pages.fm/api/v1"; // nếu cần
const MAP_FILE = process.env.MAP_FILE_PATH || "/mnt/data/FULL MAP ẢNH + MAP SKU.txt"; // file map sku->image
const PRODUCTS_XLSX = process.env.PRODUCT_XLSX_PATH || "/mnt/data/CÀ PHÊ.xlsx"; // file nguồn
const STORE_FILE = process.env.PRODUCT_STORE_FILE || "products.json";

// ========== HELPERS ==========
async function loadProductsFromXlsx() {
  if (!await fs.pathExists(PRODUCTS_XLSX)) return [];
  const wb = XLSX.readFile(PRODUCTS_XLSX);
  const sheetName = wb.SheetNames[0];
  const json = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
  // normalize: Mã mẫu mã -> sku (column "Mã mẫu mã"), Tên sản phẩm, Quy cách (Thuộc tính), Giá bán
  return json.map(r => ({
    sku: (r["Mã mẫu mã"] || "").toString().trim(),
    name: (r["Tên sản phẩm"] || "").toString().trim(),
    size: (r["Quy cách (Thuộc tính)"] || "").toString().trim(),
    price: r["Giá bán"] || r["Giá"] || "",
    images: (r["Images"] || r["Hình ảnh"] || "").toString().trim()
  }));
}

function loadMapFile() {
  if (!fs.existsSync(MAP_FILE)) return {};
  const text = fs.readFileSync(MAP_FILE, "utf8");
  const map = {};
  text.split(/\r?\n/).forEach(line => {
    const m = line.match(/(CF-[^\s]+)\s*→\s*(.+)/i) || line.match(/(.+?)\s*→\s*(.+)/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim();
      map[key.toUpperCase()] = val;
    }
  });
  return map;
}

async function saveProducts(products) {
  await fs.writeJSON(STORE_FILE, products, { spaces: 2 });
}
async function loadProducts() {
  if (!await fs.pathExists(STORE_FILE)) return [];
  return fs.readJSON(STORE_FILE);
}

// ========== INITIAL LOAD ==========
let skuImageMap = loadMapFile();
let productList = [];
(async () => {
  productList = await loadProductsFromXlsx();
  await saveProducts(productList);
})();

// ========== PANCAKE helper ==========
async function getPancakeProduct(productId) {
  try {
    const resp = await axios.get(`${PANCAKE_BASE_URL}/products/${productId}`, {
      headers: { Authorization: `Bearer ${PANCAKE_API_KEY}` }
    });
    return resp.data;
  } catch (e) {
    console.error("ERR get pancake product", e.response?.data || e.message);
    return null;
  }
}

// ========== WEBHOOK ==========
// expected: req.body.data.id (product id) OR payload shape per Pancake webhook
app.post("/webhook", async (req, res) => {
  console.log("📥 Webhook received:", JSON.stringify(req.body).slice(0,300));
  const productId = req.body?.data?.id || req.body?.id || req.body?.productId;
  if (!productId) return res.status(400).json({ ok: false, message: "productId not found" });

  const pancakeProduct = await getPancakeProduct(productId);
  if (!pancakeProduct) return res.status(500).json({ ok: false, message: "failed fetch pancake" });

  // Normalize and upsert into local store
  const normalized = {
    sku: pancakeProduct.sku || pancakeProduct.code || pancakeProduct["Mã mẫu mã"] || "",
    name: pancakeProduct.name || pancakeProduct.title,
    size: pancakeProduct.size || pancakeProduct.variant || pancakeProduct["Quy cách (Thuộc tính)"] || "",
    price: pancakeProduct.price || pancakeProduct["Giá bán"] || 0,
    images: pancakeProduct.images || pancakeProduct.image || ""
  };
  const store = await loadProducts();
  const idx = store.findIndex(p => p.sku === normalized.sku);
  if (idx >= 0) store[idx] = normalized; else store.push(normalized);
  await saveProducts(store);
  console.log("✅ Synced product:", normalized.sku);
  return res.json({ ok: true });
});

// ========== API: get all products (for bot) ==========
app.get("/api/products", async (req, res) => {
  const list = await loadProducts();
  return res.json({ ok: true, count: list.length, data: list });
});

// ========== API: search product by name (fuzzy) ==========
app.get("/api/product/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.status(400).json({ ok: false, message: "q required" });
  const list = await loadProducts();
  const fuse = new Fuse(list, { keys: ["name","sku"], threshold: 0.4 });
  const result = fuse.search(q).slice(0,10).map(r => r.item);
  return res.json({ ok: true, q, result });
});

// ========== API: get product by sku ==========
app.get("/api/product/:sku", async (req, res) => {
  const sku = (req.params.sku || "").toUpperCase();
  const list = await loadProducts();
  const p = list.find(x => (x.sku||"").toUpperCase() === sku);
  if (!p) return res.status(404).json({ ok: false, message: "not found" });
  // attach image from map if exists
  const imageFile = skuImageMap[sku] || p.images || null;
  return res.json({ ok: true, product: p, image: imageFile });
});

// ========== API: get image url/file for SKU ==========
app.get("/api/sku/:sku/image", async (req, res) => {
  const sku = (req.params.sku || "").toUpperCase();
  const imageFile = skuImageMap[sku] || null;
  if (!imageFile) return res.status(404).json({ ok: false, message: "image not found" });
  // If imageFile is a full URL, redirect; if it's local filename, serve from /public/images
  if (/^https?:\/\//i.test(imageFile)) return res.redirect(imageFile);
  // local file
  const local = path.join(__dirname, "public", "images", imageFile);
  if (!fs.existsSync(local)) return res.status(404).json({ ok: false, message: "local image not found", path: local });
  return res.sendFile(local);
});

// ========== API: sync full product list from XLSX into local products.json ==========
app.post("/api/sync/full", async (req, res) => {
  try {
    const list = await loadProductsFromXlsx();
    await saveProducts(list);
    productList = list;
    return res.json({ ok: true, count: list.length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ========== API: sync by category (filter by 'Danh mục' column) ==========
app.post("/api/sync/category", async (req, res) => {
  const category = (req.body.category || "").trim();
  if (!category) return res.status(400).json({ ok: false, message: "category required" });
  const list = await loadProductsFromXlsx();
  const filtered = list.filter(p => (p["Danh mục"] || p["category"] || "").toString().toLowerCase().includes(category.toLowerCase()));
  const store = await loadProducts();
  // upsert filtered
  filtered.forEach(f => {
    const ex = store.findIndex(s => (s.sku||"").toUpperCase() === (f.sku||"").toUpperCase());
    if (ex >= 0) store[ex] = f; else store.push(f);
  });
  await saveProducts(store);
  return res.json({ ok: true, updated: filtered.length });
});

// ========== API: sync single SKU ==========
app.post("/api/sync/sku", async (req, res) => {
  const sku = (req.body.sku || "").trim();
  if (!sku) return res.status(400).json({ ok: false, message: "sku required" });
  const list = await loadProductsFromXlsx();
  const item = list.find(x => (x.sku||"").toUpperCase() === sku.toUpperCase());
  if (!item) return res.status(404).json({ ok: false, message: "sku not found in xlsx" });
  const store = await loadProducts();
  const idx = store.findIndex(s => (s.sku||"").toUpperCase() === sku.toUpperCase());
  if (idx >= 0) store[idx] = item; else store.push(item);
  await saveProducts(store);
  return res.json({ ok: true, sku, item });
});

// ========== API: generate short description for bot (simple template) ==========
app.post("/api/generate-description", async (req, res) => {
  const sku = (req.body.sku || "").trim();
  if (!sku) return res.status(400).json({ ok: false, message: "sku required" });
  const list = await loadProducts();
  const p = list.find(x => (x.sku||"").toUpperCase() === sku.toUpperCase());
  if (!p) return res.status(404).json({ ok: false, message: "not found" });
  // short description only when asked later by customer
  const desc = `${p.name} — phù hợp cho ${p.size || "500g/1kg"}; vị ${p.taste || "cân bằng"}; thích hợp pha phin / pha máy.`;
  return res.json({ ok: true, sku, desc });
});

// ========== API: stock analysis (simple) ==========
app.get("/api/stock-analysis", async (req, res) => {
  const list = await loadProducts();
  // dummy: if quantity property exists, analyze; else return count
  const lowStock = list.filter(p => p.stock !== undefined && p.stock <= (parseInt(req.query.threshold||10) || 10));
  return res.json({ ok: true, total: list.length, lowStockCount: lowStock.length, lowStock });
});

// ========== API: upsell (basic rule) ==========
app.get("/api/upsell/:sku", async (req, res) => {
  const sku = (req.params.sku || "").toUpperCase();
  const list = await loadProducts();
  const current = list.find(x => (x.sku||"").toUpperCase() === sku);
  if (!current) return res.status(404).json({ ok: false, message: "sku not found" });
  // simple upsell: if robusta -> suggest arabica dark roast; if arabica -> suggest mix robusta
  const suggestions = [];
  if (/ROBUSTA/i.test(current.name)) suggestions.push(list.find(p=>/DARK ROAST|ARABICA DARK/i.test(p.name))?.sku);
  else suggestions.push(list.find(p=>/ROBUSTA|MIX ROBUSTA/i.test(p.name))?.sku);
  return res.json({ ok: true, sku, suggestions: suggestions.filter(Boolean) });
});

// ========== SERVER START ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));