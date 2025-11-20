// ===========================================
// 🚀 WEBHOOK SERVER – PANCAKE FULL VERSION
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
// 📌 HÀM GỌI API GET 1 SẢN PHẨM THEO ID
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
// 📌 HÀM GỌI API LẤY DANH SÁCH SẢN PHẨM
// ===========================================
async function getAllProducts() {
    try {
        const response = await axios.get(
            `https://pos.pages.fm/api/v1/products`,
            { headers: { Authorization: `Bearer ${PANCAKE_API_KEY}` } }
        );

        return response.data.data;
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
// 📌 WEBHOOK NHẬN SẢN PHẨM TỪ PANCAKE
// ===========================================
app.post("/webhook", async (req, res) => {
    console.log("📥 Đã nhận webhook:", req.body);

    const productId = req.body?.data?.id;
    if (!productId) {
        return res.status(400).json({ message: "Không tìm thấy productId" });
    }

    const product = await getProductDetail(productId);
    if (!product) {
        return res.status(500).json({ message: "Không lấy được sản phẩm" });
    }

    // Đọc file hiện tại
    let fileData = [];
    if (fs.existsSync("products.json")) {
        fileData = JSON.parse(fs.readFileSync("products.json"));
    }

    // Cập nhật hoặc thêm
    const index = fileData.findIndex((p) => p.id === product.id);
    if (index !== -1) fileData[index] = product;
    else fileData.push(product);

    saveProducts(fileData);

    console.log("✅ Đã đồng bộ:", product.name);

    res.json({ message: "Đồng bộ OK", product });
});

// ===========================================
// 📌 API 1 – TÌM SẢN PHẨM THEO TÊN
// ===========================================
app.get("/product/search", (req, res) => {
    const keyword = (req.query.q || "").toLowerCase();

    if (!fs.existsSync("products.json"))
        return res.json([]);

    const list = JSON.parse(fs.readFileSync("products.json"));
    const result = list.filter(p =>
        p.name.toLowerCase().includes(keyword)
    );

    res.json(result);
});

// ===========================================
// 📌 API 2 – LẤY ẢNH SKU THEO SẢN PHẨM
// ===========================================
app.get("/product/sku-img", (req, res) => {
    const id = Number(req.query.id);

    if (!fs.existsSync("products.json"))
        return res.json([]);

    const list = JSON.parse(fs.readFileSync("products.json"));
    const product = list.find(p => p.id === id);

    if (!product) return res.json({ message: "Không tìm thấy sản phẩm" });

    const skus = product?.skus?.map(sku => ({
        name: sku.name,
        image: sku.image
    }));

    res.json(skus || []);
});

// ===========================================
// 📌 API 3 – LẤY DANH SÁCH TOÀN BỘ SẢN PHẨM
// ===========================================
app.get("/products", (req, res) => {
    if (!fs.existsSync("products.json"))
        return res.json([]);

    const list = JSON.parse(fs.readFileSync("products.json"));
    res.json(list);
});

// ===========================================
// 📌 API 4 – ĐỒNG BỘ TOÀN BỘ SẢN PHẨM TỪ PANCAKE
// ===========================================
app.get("/products/sync-all", async (req, res) => {
    const list = await getAllProducts();
    saveProducts(list);

    res.json({
        message: "Đã sync toàn bộ sản phẩm!",
        total: list.length
    });
});

// ===========================================
// 📌 TRANG TEST SERVER
// ===========================================
app.get("/", (req, res) => {
    res.send("Webhook Server Running...");
});

// ===========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
    console.log("🚀 Server chạy tại port", PORT)
);