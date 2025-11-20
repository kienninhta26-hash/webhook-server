// index.js
// 🚀 Webhook server - Pancake full (Express + file JSON storage)
// - Yêu cầu: node >= 16
// - Env: PANCAKE_API_KEY

const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const DATA_FILE = path.join(__dirname, "products.json");

// ===========================================
// 🔑 LẤY API KEY TỪ VERCEL ENV
// ===========================================
const PANCAKE_API_KEY = process.env.PANCAKE_API_KEY || "";

// helper: đọc/ghi file
function readProductsFile() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw || "[]");
  } catch (e) {
    console.error("Error readProductsFile:", e);
    return [];
  }
}
function writeProductsFile(list) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error("Error writeProductsFile:", e);
  }
}

// ===========================================
// 📌 GỌI API PANCAKE (giả lập đầu cuối pos.pages.fm)
// ===========================================
const PANCAKE_BASE = "https://pos.pages.fm/api/v1";

async function pancakeGet(endpoint, params = {}) {
  if (!PANCAKE_API_KEY) throw new Error("Missing PANCAKE_API_KEY env");
  return axios.get(`${PANCAKE_BASE}${endpoint}`, {
    params,
    headers: { Authorization: `Bearer ${PANCAKE_API_KEY}` },
    timeout: 15000,
  });
}

// Lấy 1 sản phẩm theo id
async function getProductDetail(productId) {
  try {
    const resp = await pancakeGet(`/products/${productId}`);
    return resp.data?.data || null;
  } catch (err) {
    console.error("getProductDetail error:", err.response?.data || err.message);
    return null;
  }
}

// Lấy list sản phẩm (có phân trang tuỳ API Pancake, ở đây lấy mặc định)
async function getAllProducts(page = 1, per_page = 200) {
  try {
    const resp = await pancakeGet(`/products`, { page, per_page });
    return resp.data?.data || [];
  } catch (err) {
    console.error("getAllProducts error:", err.response?.data || err.message);
    return [];
  }
}

// Lấy products by category (nếu API hỗ trợ query category_id)
async function getProductsByCategory(categoryId, page = 1, per_page = 200) {
  try {
    const resp = await pancakeGet(`/products`, { category_id: categoryId, page, per_page });
    return resp.data?.data || [];
  } catch (err) {
    console.error("getProductsByCategory error:", err.response?.data || err.message);
    return [];
  }
}

// ===========================================
// 📌 WEBHOOK NHẬN SẢN PHẨM TỪ PANCAKE (POST /webhook)
// Pancake gửi payload khi có tạo / sửa sản phẩm
// ===========================================
app.post("/webhook", async (req, res) => {
  try {
    console.log("📥 webhook payload:", JSON.stringify(req.body).slice(0, 1000));
    const productId = req.body?.data?.id || req.body?.data?.product_id || req.body?.id;
    if (!productId) return res.status(400).json({ ok: false, message: "Missing product id in payload" });

    const product = await getProductDetail(productId);
    if (!product) return res.status(500).json({ ok: false, message: "Cannot fetch product detail" });

    const current = readProductsFile();
    const idx = current.findIndex(p => Number(p.id) === Number(product.id));
    if (idx >= 0) current[idx] = product;
    else current.push(product);
    writeProductsFile(current);

    console.log("✅ Webhook synced product:", product.name || product.id);
    return res.json({ ok: true, product });
  } catch (err) {
    console.error("webhook handler error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// ===========================================
// 📌 API: Lấy 1 product theo id (for bot) -> /product?id=
// ===========================================
app.get("/product", (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ ok: false, message: "Missing id" });
    const list = readProductsFile();
    const p = list.find(x => String(x.id) === String(id));
    if (!p) return res.status(404).json({ ok: false, message: "Not found" });
    return res.json({ ok: true, product: p });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e.message });
  }
});

// ===========================================
// 📌 API: Tìm sản phẩm theo tên -> /product/search?q=...
// ===========================================
app.get("/product/search", (req, res) => {
  const q = (req.query.q || "").toLowerCase().trim();
  if (!q) return res.json([]);
  const list = readProductsFile();
  const r = list.filter(p => (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q));
  return res.json(r);
});

// ===========================================
// 📌 API: Lấy ảnh SKU theo sản phẩm -> /product/sku-img?id=...
// Trả về mảng { sku, image_url }
// ===========================================
app.get("/product/sku-img", (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ ok: false, message: "Missing id" });
  const list = readProductsFile();
  const p = list.find(x => String(x.id) === String(id));
  if (!p) return res.status(404).json({ ok: false, message: "Not found" });

  const skus = (p.skus || []).map(s => ({
    sku: s.code || s.sku || s.name || "",
    image: s.image || s.image_url || null,
    stock: s.stock ?? s.qty ?? null
  }));
  return res.json({ ok: true, skus });
});

// ===========================================
// 📌 API: Lấy toàn bộ sản phẩm (for bot) -> /products
// ===========================================
app.get("/products", (req, res) => {
  const list = readProductsFile();
  return res.json(list);
});

// ===========================================
// 📌 API: Đồng bộ toàn bộ sản phẩm từ Pancake -> /products/sync-all
// Gọi endpoint Pancake, lưu vào products.json
// ===========================================
app.get("/products/sync-all", async (req, res) => {
  try {
    // nếu API hỗ trợ phân trang, ta lặp để lấy hết; ở đây cố lấy page 1..10 để an toàn
    let all = [];
    for (let page = 1; page <= 10; page++) {
      const pageData = await getAllProducts(page, 200);
      if (!pageData || pageData.length === 0) break;
      all = all.concat(pageData);
      if (pageData.length < 200) break;
    }
    writeProductsFile(all);
    return res.json({ ok: true, message: "Synced all products", total: all.length });
  } catch (e) {
    console.error("sync-all error", e);
    return res.status(500).json({ ok: false, message: e.message });
  }
});

// ===========================================
// 📌 API: Đồng bộ theo danh mục -> /products/sync-category?category_id=xxx
// ===========================================
app.get("/products/sync-category", async (req, res) => {
  const categoryId = req.query.category_id;
  if (!categoryId) return res.status(400).json({ ok: false, message: "Missing category_id" });
  try {
    let all = [];
    for (let page = 1; page <= 10; page++) {
      const pageData = await getProductsByCategory(categoryId, page, 200);
      if (!pageData || pageData.length === 0) break;
      all = all.concat(pageData);
      if (pageData.length < 200) break;
    }
    // merge into existing file (replace products having same id)
    const existing = readProductsFile();
    const map = new Map(existing.map(p => [String(p.id), p]));
    all.forEach(p => map.set(String(p.id), p));
    const merged = Array.from(map.values());
    writeProductsFile(merged);
    return res.json({ ok: true, message: "Synced category", category_id: categoryId, added: all.length });
  } catch (e) {
    console.error("sync-category error", e);
    return res.status(500).json({ ok: false, message: e.message });
  }
});

// ===========================================
// 📌 API: Đồng bộ SKU riêng -> /products/sync-sku?sku=SKU_CODE
// Lấy sản phẩm chứa SKU đó và cập nhật
// ===========================================
app.get("/products/sync-sku", async (req, res) => {
  const sku = req.query.sku;
  if (!sku) return res.status(400).json({ ok: false, message: "Missing sku" });
  try {
    // nếu Pancake có API tìm theo sku thì gọi (không chắc có). Fallback: sync-all và tìm sku trong file.
    // CHÚ Ý: Nếu API Pancake hỗ trợ: /products?sku=xxxxx -> dùng pancakeGet('/products',{ sku })
    let found = null;
    try {
      const resp = await pancakeGet(`/products`, { sku });
      const data = resp.data?.data || [];
      if (data.length) found = data[0];
    } catch (e) {
      // ignore
    }

    if (!found) {
      // fallback: sync all & search
      const list = await getAllProducts();
      found = list.find(p => (p.skus || []).some(s => s.code === sku || s.sku === sku || s.name === sku));
      if (!found) return res.status(404).json({ ok: false, message: "SKU not found" });
    }

    const existing = readProductsFile();
    const idx = existing.findIndex(x => String(x.id) === String(found.id));
    if (idx >= 0) existing[idx] = found;
    else existing.push(found);
    writeProductsFile(existing);

    return res.json({ ok: true, product: found });
  } catch (e) {
    console.error("sync-sku error", e);
    return res.status(500).json({ ok: false, message: e.message });
  }
});

// ===========================================
// 📌 API: Sinh mô tả ngắn cho bot -> /product/describe?id=
// - Mô tả là template từ tên, price, flavor, notes (không gọi OpenAI ở đây)
// ===========================================
app.get("/product/describe", (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ ok: false, message: "Missing id" });
    const list = readProductsFile();
    const p = list.find(x => String(x.id) === String(id));
    if (!p) return res.status(404).json({ ok: false, message: "Product not found" });

    // generate simple description
    const price = p.price || p.price_sell || (p.prices && p.prices[0]) || null;
    const notes = p.note || p.description || p.meta_description || "";
    const taste = p.tags ? p.tags.join(", ") : (p.flavor || "");
    const desc = `Tên: ${p.name}. Giá: ${price ? price + " đ" : "Liên hệ"}. Hương: ${taste || "Đặc trưng"}. Mô tả: ${notes ? notes : "Sản phẩm chất lượng, phù hợp quán/khách hàng."}`;

    return res.json({ ok: true, description: desc });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e.message });
  }
});

// ===========================================
// 📌 API: Phân tích tồn kho -> /product/inventory?id=
// - trả tổng tồn của product (tổng các sku), từng sku list
// ===========================================
app.get("/product/inventory", (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ ok: false, message: "Missing id" });
  const list = readProductsFile();
  const p = list.find(x => String(x.id) === String(id));
  if (!p) return res.status(404).json({ ok: false, message: "Not found" });
  const skus = p.skus || [];
  let total = 0;
  const details = skus.map(s => {
    const qty = Number(s.stock ?? s.qty ?? s.inventory ?? 0);
    total += qty;
    return { sku: s.code || s.sku || s.name, qty, image: s.image || s.image_url || null };
  });
  return res.json({ ok: true, total, details });
});

// ===========================================
// 📌 API: Gợi ý upsell theo product -> /product/upsell?id=&limit=3
// - logic: lấy cùng category (nếu có), sắp theo giá cao hơn hoặc trending
// ===========================================
app.get("/product/upsell", (req, res) => {
  try {
    const id = req.query.id;
    const limit = Number(req.query.limit || 3);
    if (!id) return res.status(400).json({ ok: false, message: "Missing id" });
    const list = readProductsFile();
    const p = list.find(x => String(x.id) === String(id));
    if (!p) return res.status(404).json({ ok: false, message: "Not found" });

    const sameCat = list.filter(x => {
      if (String(x.id) === String(p.id)) return false;
      // try category id or tags
      if (p.category_id && x.category_id) return String(x.category_id) === String(p.category_id);
      // fallback by tags
      const t1 = (p.tags || []).map(s => String(s).toLowerCase());
      const t2 = (x.tags || []).map(s => String(s).toLowerCase());
      return t1.some(t => t2.includes(t));
    });

    // sort by price desc (or fallback)
    const sorted = sameCat.sort((a, b) => {
      const pa = Number(a.price || a.price_sell || 0);
      const pb = Number(b.price || b.price_sell || 0);
      return pb - pa;
    });

    const suggestions = sorted.slice(0, limit).map(x => ({ id: x.id, name: x.name, price: x.price || x.price_sell || null, image: x.image || (x.skus && x.skus[0] && x.skus[0].image) || null }));
    return res.json({ ok: true, suggestions });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e.message });
  }
});

// ===========================================
// 📌 TEST / HEALTH
// ===========================================
app.get("/", (req, res) => {
  res.send("Webhook Server Running - Pancake Full");
});

// ===========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server chạy port", PORT));