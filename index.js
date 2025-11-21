// ===========================================
// 🚀 WEBHOOK SERVER – PANCAKE FULL VERSION (FIXED)
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
if (!PANCAKE_API_KEY) console.log("❌ Lỗi: Chưa có PANCAKE_API_KEY trong Environment!");

// ===========================================
// 📌 API: LẤY CHI TIẾT 1 SẢN PHẨM
// ===========================================
async function getProductDetail(productId) {
    try {
        const res = await axios.get(
            `https://pos.pages.fm/api/v1/products/${productId}`,
            {
                headers: { Authorization: `Bearer ${PANCAKE_API_KEY}` }
            }
        );
        return res.data.data || null;
    } catch (err) {
        console.log("❌ getProductDetail error:", err.response?.data || err);
        return null;
    }
}

// ===========================================
// 📌 API: LẤY TẤT CẢ SẢN PHẨM
// ===========================================
async function getAllProducts() {
    try {
        const res = await axios.get(
            `https://pos.pages.fm/api/v1/products`,
            {
                headers: { Authorization: `Bearer ${PANCAKE_API_KEY}` }
            }
        );
        return res.data.data || [];
    } catch (err) {
        console.log("❌ getAllProducts error:", err.response?.data || err);
        return [];
    }
}

// ===========================================
// 📌 LƯU FILE JSON
// ===========================================
function saveProducts(list) {
    try {
        fs.writeFileSync("products.json", JSON.stringify(list, null, 2));
    } catch (e) {
        console.log("❌ Error writeProductsFile:", e);
    }
}

// ===========================================
// 📌 WEBHOOK — NHẬN SẢN PHẨM TỪ PANCAKE
// ===========================================
app.post("/webhook", async (req, res) => {
    const data = req.body?.data;
    console.log("📩 Webhook nhận được:", data);

    if (!data?.id) {
        console.log("⚠️ Webhook không chứa ID sản phẩm");
        return res.json({ ok: false, message: "Webhook thiếu ID" });
    }

    const id = data.id;
    const product = await getProductDetail(id);

    if (!product) {
        console.log("❌ Không lấy được chi tiết sản phẩm từ Pancake");
        return res.json({ ok: false, message: "Không lấy được sản phẩm" });
    }

    // Đọc file và cập nhật
    let fileData = [];
    if (fs.existsSync("products.json")) {
        fileData = JSON.parse(fs.readFileSync("products.json"));
    }

    const index = fileData.findIndex((p) => p.id === product.id);
    if (index !== -1) fileData[index] = product;
    else fileData.push(product);

    saveProducts(fileData);

    console.log("✅ Đã cập nhật sản phẩm:", product.name);

    res.json({ ok: true, message: "Updated", product });
});

// ===========================================
// 📌 API SEARCH SẢN PHẨM
// ===========================================
app.get("/product/search", (req, res) => {
    const q = (req.query.q || "").toLowerCase();

    if (!fs.existsSync("products.json"))
        return res.json([]);

    const list = JSON.parse(fs.readFileSync("products.json"));
    const result = list.filter(p => p.name?.toLowerCase().includes(q));

    res.json(result);
});

// ===========================================
// 📌 API LẤY TẤT CẢ SẢN PHẨM
// ===========================================
app.get("/products", (req, res) => {
    if (!fs.existsSync("products.json"))
        return res.json([]);

    const list = JSON.parse(fs.readFileSync("products.json"));
    res.json(list);
});

// ===========================================
// 📌 API SYNC TOÀN BỘ SẢN PHẨM
// ===========================================
app.get("/products/sync-all", async (req, res) => {
    const list = await getAllProducts();
    saveProducts(list);

    res.json({
        ok: true,
        message: "Synced all products",
        total: list.length
    });
});

// ===========================================
// 📌 TRANG TEST SERVER
// ===========================================
app.get("/", (req, res) => {
    res.send("Webhook server OK!");
});

// ===========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running at port ${PORT}`));