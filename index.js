// ===========================================
// 🚀 PANCAKE WEBHOOK SERVER – FULL FIXED VERSION
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

if (!PANCAKE_API_KEY) {
    console.log("❌ ENV PANCAKE_API_KEY chưa được set!");
}

// ===========================================
// 📌 HÀM LẤY CHI TIẾT SẢN PHẨM
// ===========================================
async function getProductDetail(productId) {
    try {
        const url = `https://pos.pages.fm/api/v1/products/${productId}`;
        const response = await axios.get(url, {
            headers: { Authorization: `Bearer ${PANCAKE_API_KEY}` }
        });
        return response.data.data;
    } catch (err) {
        console.log("❌ getProductDetail error:", err.response?.data || err);
        return null;
    }
}

// ===========================================
// 📌 HÀM LẤY TOÀN BỘ SẢN PHẨM
// ===========================================
async function getAllProducts() {
    try {
        const response = await axios.get(
            `https://pos.pages.fm/api/v1/products`,
            {
                headers: { Authorization: `Bearer ${PANCAKE_API_KEY}` }
            }
        );

        return response.data.data || [];
    } catch (err) {
        console.log("❌ Lỗi lấy danh sách sản phẩm:", err.response?.data || err);
        return [];
    }
}

// ===========================================
// 📌 LƯU DỮ LIỆU VÀO FILE JSON
// ===========================================
function saveProducts(list) {
    fs.writeFileSync("products.json", JSON.stringify(list, null, 2));
}

// ===========================================
// 📌 WEBHOOK NHẬN TỪ PANCAKE — AUTO SYNC REALTIME
// ===========================================
app.post("/webhook", async (req, res) => {
    console.log("📥 Webhook nhận được:", req.body);

    const productId = req.body?.id ?? req.body?.data?.id;

    if (!productId) {
        console.log("⚠️ Webhook không chứa ID sản phẩm!");
        return res.status(200).json({
            ok: false,
            message: "Webhook không có ID"
        });
    }

    const product = await getProductDetail(productId);
    if (!product) {
        return res.status(500).json({
            ok: false,
            message: "Không lấy được chi tiết sản phẩm"
        });
    }

    let fileData = [];
    if (fs.existsSync("products.json")) {
        fileData = JSON.parse(fs.readFileSync("products.json"));
    }

    const index = fileData.findIndex((p) => p.id === product.id);
    if (index !== -1) fileData[index] = product;
    else fileData.push(product);

    saveProducts(fileData);

    console.log("✅ Đã cập nhật:", product.name);
    res.json({ ok: true, message: "Cập nhật thành công", product });
});

// ===========================================
// 📌 API 1 – TÌM KIẾM SẢN PHẨM
// ===========================================
app.get("/product/search", (req, res) => {
    const keyword = (req.query.q || "").toLowerCase();

    if (!fs.existsSync("products.json")) return res.json([]);

    const list = JSON.parse(fs.readFileSync("products.json"));

    const result = list.filter(
        (p) => p.name?.toLowerCase().includes(keyword)
    );

    res.json(result);
});

// ===========================================
// 📌 API 2 – LẤY ẢNH SKU
// ===========================================
app.get("/product/sku-img", (req, res) => {
    const id = req.query.id;

    if (!fs.existsSync("products.json")) return res.json([]);

    const list = JSON.parse(fs.readFileSync("products.json"));
    const product = list.find((p) => String(p.id) === String(id));

    if (!product) return res.json([]);

    const skus = product.variations?.map((x) => ({
        name: x.name,
        image: x.image
    }));

    res.json(skus);
});

// ===========================================
// 📌 API 3 – LẤY TẤT CẢ SẢN PHẨM
// ===========================================
app.get("/products", (req, res) => {
    if (!fs.existsSync("products.json")) return res.json([]);

    const list = JSON.parse(fs.readFileSync("products.json"));
    res.json(list);
});

// ===========================================
// 📌 API 4 – SYNC TOÀN BỘ
// ===========================================
app.get("/products/syncs", async (req, res) => {
    const list = await getAllProducts();

    saveProducts(list);

    res.json({
        ok: true,
        message: "Đã đồng bộ toàn bộ sản phẩm",
        total: list.length
    });
});

// ===========================================
// 📌 TRANG TEST
// ===========================================
app.get("/", (req, res) => {
    res.send("Webhook Server is running...");
});

// ===========================================
const PORT = 3000;
app.listen(PORT, () => console.log("🚀 Server chạy tại PORT", PORT));
