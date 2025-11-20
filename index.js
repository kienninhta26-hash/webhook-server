const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// ===============================
// 🔑 LẤY API KEY PANCAKE
// ===============================
const PANCAKE_API_KEY = process.env.PANCAKE_API_KEY;

// ===============================
// 📌 FILE LƯU DỮ LIỆU SẢN PHẨM
// ===============================
const PRODUCT_FILE = path.join(__dirname, "products.json");

function saveProducts(list) {
    fs.writeFileSync(PRODUCT_FILE, JSON.stringify(list, null, 2));
}

function loadProducts() {
    if (!fs.existsSync(PRODUCT_FILE)) return [];
    return JSON.parse(fs.readFileSync(PRODUCT_FILE));
}

// ===============================
// 📌 API LẤY TẤT CẢ SẢN PHẨM TỪ PANCAKE (FULL SYNC)
// ===============================
app.get("/sync-all", async (req, res) => {
    try {
        console.log("🔄 Đang đồng bộ toàn bộ sản phẩm...");

        const response = await axios.get(
            "https://pos.pages.fm/api/v1/products",
            {
                headers: { Authorization: `Bearer ${PANCAKE_API_KEY}` }
            }
        );

        const data = response.data.data.items || [];
        saveProducts(data);

        console.log("✅ Đã đồng bộ:", data.length, "sản phẩm");
        res.json({ message: "Đồng bộ toàn bộ OK", total: data.length });

    } catch (err) {
        console.log("❌ Lỗi SYNC:", err.response?.data || err);
        res.status(500).json({ error: "Lỗi sync-all" });
    }
});

// ===============================
// 📌 API TÌM SẢN PHẨM THEO TÊN
// ===============================
app.get("/product/search", (req, res) => {
    const q = req.query.q?.toLowerCase();
    if (!q) return res.json([]);

    const list = loadProducts();
    const result = list.filter(p =>
        p.name.toLowerCase().includes(q)
    );

    res.json(result);
});

// ===============================
// 📌 API LẤY ẢNH THEO SKU
// ===============================
app.get("/product/sku/:sku", (req, res) => {
    const sku = req.params.sku.toLowerCase();

    const list = loadProducts();

    const found = list.find(p =>
        (p.variants || []).some(v => v.sku?.toLowerCase() === sku)
    );

    if (!found) return res.json({ image: null });

    const variant = found.variants.find(v => v.sku.toLowerCase() === sku);
    const img = variant.images?.[0] || found.images?.[0] || null;

    res.json({ image: img });
});

// ===============================
// 📌 API LẤY THÔNG TIN 1 SẢN PHẨM CHO BOT
// ===============================
app.get("/product/:id", (req, res) => {
    const id = req.params.id;
    const list = loadProducts();

    const found = list.find(p => String(p.id) === String(id));

    res.json(found || {});
});

// ===============================
// 📌 WEBHOOK TỪ PANCAKE (TỰ ĐỘNG NHẬN CẬP NHẬT)
// ===============================
app.post("/webhook", async (req, res) => {
    const data = req.body.data;
    if (!data?.id) return res.json({ message: "Không có ID" });

    try {
        const detail = await axios.get(
            `https://pos.pages.fm/api/v1/products/${data.id}`,
            {
                headers: { Authorization: `Bearer ${PANCAKE_API_KEY}` }
            }
        );

        const product = detail.data.data;

        // cập nhật vào file JSON
        const list = loadProducts();
        const index = list.findIndex(p => p.id === product.id);

        if (index >= 0) list[index] = product;
        else list.push(product);

        saveProducts(list);

        console.log("📥 Đã cập nhật sản phẩm:", product.name);
        res.json({ message: "Webhook OK" });

    } catch (err) {
        console.log("❌ Lỗi webhook:", err.response?.data || err);
        res.status(500).json({ error: "Webhook lỗi" });
    }
});

// ===============================
// 📌 TRANG KIỂM TRA SERVER
// ===============================
app.get("/", (req, res) => {
    res.send("Webhook Server is running...");
});

// ===============================
module.exports = app;