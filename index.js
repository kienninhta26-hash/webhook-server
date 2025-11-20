const express = require("express");
const axios = require("axios");
const fs = require("fs");

const app = express();
app.use(express.json());

const PANCAKE_API_KEY = process.env.PANCAKE_API_KEY;

// Lấy chi tiết SP từ Pancake
async function getProductDetail(productId) {
    try {
        const url = `https://pos.pages.fm/api/v1/products/${productId}`;
        const res = await axios.get(url, {
            headers: { Authorization: `Bearer ${PANCAKE_API_KEY}` },
        });
        return res.data.data;
    } catch (err) {
        console.log("❌ lỗi:", err.response?.data || err);
        return null;
    }
}

// Lưu sản phẩm vào file
function saveProduct(product) {
    fs.writeFileSync("products.json", JSON.stringify(product, null, 2));
}

// Webhook
app.post("/webhook", async (req, res) => {
    console.log("📥 webhook:", req.body);

    const productId = req.body?.data?.id;
    if (!productId) return res.json({ error: "no productId" });

    const product = await getProductDetail(productId);
    if (!product) return res.json({ error: "get fail" });

    saveProduct(product);

    console.log("✅ synced:", product.name);
    res.json({ message: "OK", product });
});

// test
app.get("/", (req, res) => {
    res.send("Webhook server OK!");
});

app.listen(3000, () => console.log("🔥 Server running"));
