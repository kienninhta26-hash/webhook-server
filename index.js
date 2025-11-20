const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

// ===========================================
// 🔑 LẤY API KEY TỪ ENVIRONMENT CỦA VERCEL
// ===========================================
const PANCAKE_API_KEY = process.env.PANCAKE_API_KEY;

// ===========================================
// 📌 HÀM LẤY CHI TIẾT SẢN PHẨM TỪ PANCAKE
// ===========================================
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

// ===========================================
// 📌 HÀM LƯU SẢN PHẨM (ANH CÓ THỂ KẾT NỐI DB SAU)
// Tạm thời em lưu vào 1 file JSON trên server anh
// ===========================================
const fs = require("fs");
function saveProduct(product) {
    fs.writeFileSync("products.json", JSON.stringify(product, null, 2));
}

// ===========================================
// 📌 WEBHOOK NHẬN SẢN PHẨM TỪ PANCAKE
// ===========================================
app.post("/webhook", async (req, res) => {
    console.log("📥 Đã nhận webhook:", req.body);

    const productId = req.body?.data?.id;
    if (!productId) {
        return res.status(400).json({ message: "Không tìm thấy productId" });
    }

    // Lấy sản phẩm chuẩn từ Pancake
    const product = await getProductDetail(productId);

    if (!product) {
        return res.status(500).json({ message: "Lấy sản phẩm thất bại" });
    }

    // Lưu / cập nhật sản phẩm
    saveProduct(product);

    console.log("✅ Sản phẩm đã đồng bộ:", product.name);
    res.json({ message: "Đồng bộ OK", product });
});

// ===========================================
// 📌 TEST SERVER
// ===========================================
app.get("/", (req, res) => {
    res.send("Webhook Server Running...");
});

// ===========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server chạy port", PORT));
