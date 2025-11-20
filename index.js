// ===========================================
// 🚀 WEBHOOK SERVER – PANCAKE API FIXED
// ===========================================

const express = require("express");
const axios = require("axios");
const fs = require("fs");
const app = express();

app.use(express.json());

// ===========================================
// 🔑 LẤY API KEY TỪ VERCEL ENV
// ===========================================
const PANCAKE_API_KEY = process.env.PANCAKE_API_KEY;

// ===========================================
// 📌 API PANCAKE ĐÃ ĐỔI URL (BẮT BUỘC SỬA)
// ===========================================
// ❌ Sai: https://pos.pages.fm/api/v1/products/ID
// ✅ Đúng: https://pos.pancake.vn/api/products/ID

const API_PANCAKE = "https://pos.pancake.vn/api";

// ===========================================
// 📌 HÀM LẤY THÔNG TIN 1 SẢN PHẨM
// ===========================================
async function getProductDetail(id) {
    try {
        const res = await axios.get(`${API_PANCAKE}/products/${id}`, {
            headers: { Authorization: `Bearer ${PANCAKE_API_KEY}` }
        });

        return res.data?.data || null;
    } catch (err) {
        console.log("❌ getProductDetail error:", err.response?.data || err);
        return null;
    }
}

// ===========================================
// 📌 LẤY DANH SÁCH SẢN PHẨM
// ===========================================
async function getAllProducts() {
    try {
        const res = await axios.get(`${API_PANCAKE}/products`, {
            headers: { Authorization: `Bearer ${PANCAKE_API_KEY}` }
        });
        return res.data?.data || [];
    } catch (err) {
        console.log("❌ Lỗi getAllProducts:", err.response?.data || err);
        return [];
    }
}

// ===========================================
// 📌 LƯU FILE JSON
// ===========================================
function saveProducts(data) {
    fs.writeFileSync("products.json", JSON.stringify(data, null, 2));
}

// ===========================================
// 📌 WEBHOOK TỪ PANCAKE (CHỈ NHẬN SẢN PHẨM)
// ===========================================
app.post("/webhook", async (req, res) => {
    console.log("📥 Webhook:", req.body);

    const id = req.body?.data?.id;
    if (!id) return res.status(400).json({ ok: false, message: "Không có ID" });

    const product = await getProductDetail(id);

    if (!product) {
        return res.status(500).json({ ok: false, message: "Không lấy được sản phẩm" });
    }

    let list = [];

    if (fs.existsSync("products.json")) {
        list = JSON.parse(fs.readFileSync("products.json"));
    }

    const index = list.findIndex(p => p.id === id);

    if (index !== -1) list[index] = product;
    else list.push(product);

    saveProducts(list);

    res.json({ ok: true, message: "Đã đồng bộ", product });
});

// ===========================================
// 📌 API TÌM SẢN PHẨM
// ===========================================
app.get("/product/search", (req, res) => {
    if (!fs.existsSync("products.json")) return res.json([]);

    const q = (req.query.q || "").toLowerCase();
    const list = JSON.parse(fs.readFileSync("products.json"));

    const found = list.filter(p => p.name.toLowerCase().includes(q));
    res.json(found);
});

// ===========================================
// 📌 LẤY ẢNH SKU
// ===========================================
app.get("/product/sku-img", (req, res) => {
    if (!fs.existsSync("products.json")) return res.json([]);

    const id = Number(req.query.id);
    const list = JSON.parse(fs.readFileSync("products.json"));
    const product = list.find(p => p.id === id);

    if (!product) return res.json([]);

    res.json(product.skus?.map(s => ({ name: s.name, image: s.image })));
});

// ===========================================
// 📌 LẤY TOÀN BỘ SẢN PHẨM
// ===========================================
app.get("/products", (req, res) => {
    if (!fs.existsSync("products.json")) return res.json([]);
    res.json(JSON.parse(fs.readFileSync("products.json")));
});

// ===========================================
// 📌 ĐỒNG BỘ FULL SẢN PHẨM TỪ PANCAKE
// ===========================================
app.get("/products/sync-all", async (req, res) => {
    const list = await getAllProducts();
    saveProducts(list);

    res.json({
        ok: true,
        message: "Đã sync toàn bộ sản phẩm!",
        total: list.length
    });
});

// ===========================================
app.get("/", (_, res) => res.send("Webhook Server Running..."));
app.listen(3000, () => console.log("🚀 Server running!"));