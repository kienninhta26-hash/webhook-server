// ===========================================
// 🚀 WEBHOOK SERVER – PANCAKE FULL Version FIX
// ===========================================

const express = require("express");
const axios = require("axios");
const fs = require("fs");

const app = express();
app.use(express.json());

// API KEY từ Vercel ENV
const PANCAKE_API_KEY = process.env.PANCAKE_API_KEY;

// ======================
// HÀM LẤY CHI TIẾT SP
// ======================
async function getProductDetail(productId) {
    try {
        const res = await axios.get(
            `https://pos.pages.fm/api/v1/products/${productId}`,
            { headers: { Authorization: `Bearer ${PANCAKE_API_KEY}` } }
        );
        return res.data.data;
    } catch (err) {
        console.log("❌ getProductDetail error:", err.response?.data || err);
        return null;
    }
}

// ======================
// WEBHOOK NHẬN TỪ PANCAKE
// ======================
app.post("/webhook", async (req, res) => {

    console.log("📥 Webhook nhận được:", req.body);

    const productId = req.body?.data?.id;

    // Nếu webhook KHÔNG PHẢI sản phẩm → ignore
    if (!productId) {
        console.log("⚠ Webhook không chứa ID sản phẩm → Bỏ qua.");
        return res.json({ ok: true, message: "Ignored non-product webhook" });
    }

    const product = await getProductDetail(productId);
    if (!product) {
        return res.json({ ok: false, message: "Không lấy được sản phẩm" });
    }

    // Lưu file
    let list = [];
    if (fs.existsSync("products.json"))
        list = JSON.parse(fs.readFileSync("products.json"));

    const idx = list.findIndex(p => p.id === product.id);
    if (idx >= 0) list[idx] = product;
    else list.push(product);

    fs.writeFileSync("products.json", JSON.stringify(list, null, 2));

    console.log("✅ Đã SYNC:", product.name);

    res.json({ ok: true, product });
});

// Trang test
app.get("/", (req, res) => {
    res.send("Webhook Server Running...");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server running on port " + PORT));