const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

// Lấy API key từ Environment
const PANCAKE_API_KEY = process.env.PANCAKE_API_KEY;

// Bộ nhớ tạm thay cho products.json (vì Vercel không cho lưu file)
let TEMP_PRODUCTS = {};

// Lấy chi tiết sản phẩm từ Pancake
async function getProductDetail(productId) {
    try {
        const response = await axios.get(
            `https://pos.pages.fm/api/v1/products/${productId}`,
            {
                headers: { Authorization: `Bearer ${PANCAKE_API_KEY}` }
            }
        );

        return response.data.data;
    } catch (err) {
        console.log("❌ Lỗi lấy chi tiết sản phẩm:", err.response?.data || err);
        return null;
    }
}

// Webhook nhận sản phẩm
app.post("/webhook", async (req, res) => {
    console.log("📥 Webhook nhận:", req.body);

    const productId = req.body?.data?.id;
    if (!productId) {
        return res.status(400).json({ message: "Không tìm thấy productId" });
    }

    const product = await getProductDetail(productId);

    if (!product) {
        return res.status(500).json({ message: "Lấy sản phẩm thất bại" });
    }

    // Lưu tạm RAM
    TEMP_PRODUCTS[product.id] = product;

    console.log("✅ Đã đồng bộ:", product.name);
    res.json({ message: "OK", product });
});

// Test server
app.get("/", (req, res) => {
    res.send("Webhook Server Running OK!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server chạy port", PORT));
