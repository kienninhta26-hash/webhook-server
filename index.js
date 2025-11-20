// ==============================
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
// 📌 HÀM LẤY CHI TIẾT SẢN PHẨM
// ===========================================
async function getProductDetail(productId) {
    try {
        const res = await axios.get(
            `https://pos.pages.fm/api/v1/products/${productId}`,
            { headers: { Authorization: `Bearer ${PANCAKE_API_KEY}` } }
        );
        return res.data.data;
    } catch (err) {
        console.log("❌ Lỗi lấy chi tiết sp:", err.response?.data || err);
        return null;
    }
}

// ===========================================
// 📌 HÀM LẤY DANH SÁCH TẤT CẢ SẢN PHẨM
// ===========================================
async function getAllProducts() {
    try {
        const res = await axios.get(
            `https://pos.pages.fm/api/v1/products`,
            { headers: { Authorization: `Bearer ${PANCAKE_API_KEY}` } }
        );
        return res.data.data;
    } catch (err) {
        console.log("❌ Lỗi lấy list sản phẩm:", err.response?.data || err);
        return [];
    }
}

// ===========================================
// 📌 HÀM LƯU SẢN PHẨM LOCAL (products.json)
// ===========================================
function saveProductsToFile(products) {
    try {
        fs.writeFileSync("products.json", JSON.stringify(products, null, 2));
        console.log("💾 Đã lưu file products.json");
    } catch (err) {
        console.log("❌ Không lưu được file products.json", err);
    }
}

// ===========================================
// 📌 WEBHOOK NHẬN SẢN PHẨM CẬP NHẬT TỪ PANCAKE
// ===========================================
app.post("/webhook", async (req, res) => {
    console.log("📥 Webhook nhận:", req.body);

    const productId = req.body?.data?.id;
    if (!productId) return res.status(400).json({ message: "Không có productId" });

    const product = await getProductDetail(productId);
    if (!product) return res.status(500).json({ message: "Không lấy được sản phẩm" });

    saveProductsToFile(product);

    res.json({ message: "Đã nhận và lưu sản phẩm", product });
});

// ===========================================
// 📌 API 1: TÌM SẢN PHẨM THEO TÊN
// ===========================================
app.get("/search", async (req, res) => {
    const keyword = req.query.q?.toLowerCase();
    if (!keyword) return res.json([]);

    const list = JSON.parse(fs.readFileSync("products.json", "utf8"));

    const result = list.filter(p =>
        p.name.toLowerCase().includes(keyword)
    );

    res.json(result);
});

// ===========================================
// 📌 API 2: LẤY ẢNH SKU
// ===========================================
app.get("/sku-image", async (req, res) => {
    const skuId = req.query.id;
    if (!skuId) return res.json({ error: "Thiếu sku id" });

    const list = JSON.parse(fs.readFileSync("products.json", "utf8"));

    let img = null;

    list.forEach(product => {
        product.variants?.forEach(v => {
            if (v.id == skuId) img = v.image_url;
        });
    });

    res.json({ skuId, image: img });
});

// ===========================================
// 📌 API 3: ĐỒNG BỘ TOÀN BỘ SẢN PHẨM
// ===========================================
app.get("/sync-all", async (req, res) => {
    const list = await getAllProducts();
    saveProductsToFile(list);

    res.json({
        message: "Đồng bộ full sản phẩm OK",
        total: list.length
    });
});

// ===========================================
// 📌 API 4: CHO BOT LẤY DANH SÁCH SẢN PHẨM
// ===========================================
app.get("/products", (req, res) => {
    const list = JSON.parse(fs.readFileSync("products.json", "utf8"));
    res.json(list);
});

// ===========================================
app.get("/", (req, res) => {
    res.send("Webhook Server OK");
});

// ===========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server chạy:", PORT));