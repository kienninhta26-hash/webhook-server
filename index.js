// index.js
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const app = express();

app.use(express.json());

// --- LẤY API KEY TỪ ENV ---
const PANCAKE_API_KEY = process.env.PANCAKE_API_KEY || "";
if (!PANCAKE_API_KEY) {
  console.warn("⚠️ PANCAKE_API_KEY chưa được đặt. Vercel -> Settings -> Environment Variables");
}

// --- File chứa "master" (mô phỏng DB) - optional ---
// Lưu ý: Vercel không lưu file lâu dài giữa deployments. Đây chỉ để test nhanh.
const MASTER_FILE = path.join(__dirname, "products_master.json");

// helper: đọc master list (nếu có)
function readMaster() {
  try {
    if (fs.existsSync(MASTER_FILE)) {
      const raw = fs.readFileSync(MASTER_FILE, "utf8");
      return JSON.parse(raw || "{}");
    } else {
      return {};
    }
  } catch (e) {
    console.error("Error readMaster:", e);
    return {};
  }
}

// helper: ghi master list (test)
function writeMaster(obj) {
  try {
    fs.writeFileSync(MASTER_FILE, JSON.stringify(obj, null, 2));
    return true;
  } catch (e) {
    console.error("Error writeMaster:", e);
    return false;
  }
}

// ======================
// Hàm lấy chi tiết sản phẩm từ Pancake
// endpoint giả sử: https://pos.pages.fm/api/v1/products/{id}
// điều chỉnh nếu API khác
// ======================
async function fetchPancakeProduct(productId) {
  try {
    const url = `https://pos.pages.fm/api/v1/products/${productId}`;
    const resp = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${PANCAKE_API_KEY}`,
        Accept: "application/json",
      },
      timeout: 10000,
    });
    return resp.data?.data || resp.data;
  } catch (err) {
    console.error("❌ fetchPancakeProduct error:", err.response?.data || err.message || err);
    return null;
  }
}

// ======================
// Hàm cập nhật product trên Pancake (nếu cần chỉnh lại info)
// (ví dụ PUT hoặc PATCH; API Pancake có thể khác — kiểm tra docs)
// ======================
async function updatePancakeProduct(productId, payload) {
  try {
    const url = `https://pos.pages.fm/api/v1/products/${productId}`; // nếu API dùng khác, chỉnh ở đây
    const resp = await axios.put(url, payload, {
      headers: {
        Authorization: `Bearer ${PANCAKE_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
    return resp.data;
  } catch (err) {
    console.error("❌ updatePancakeProduct error:", err.response?.data || err.message || err);
    return null;
  }
}

// ======================
// LOGIC ĐỒNG BỘ
// - Khi Pancake gửi webhook (product created/updated) -> fetch chi tiết -> so sánh với MASTER -> nếu khác -> update Pancake hoặc ghi master
// - Anh có thể chỉnh: tự động sửa Pancake (dangerous) hoặc chỉ log / tạo task cho admin
// ======================

app.post("/webhook", async (req, res) => {
  try {
    console.log("📥 Received webhook:", JSON.stringify(req.body).slice(0, 1000));

    // 1) Lấy productId từ payload pancake (cấu trúc payload khác nhau, anh kiểm tra payload thực tế)
    // Ví dụ các payload em thấy trước đó có: req.body.data.id hoặc req.body?.id...
    const productId =
      req.body?.data?.id ||
      req.body?.resource?.id ||
      req.body?.id ||
      req.body?.product_id ||
      null;

    if (!productId) {
      console.warn("⚠️ Không tìm thấy productId trong payload. payload keys:", Object.keys(req.body || {}));
      return res.status(400).json({ ok: false, message: "Không tìm thấy productId trong webhook payload" });
    }

    // 2) Lấy chi tiết sản phẩm từ Pancake
    const pancakeProduct = await fetchPancakeProduct(productId);
    if (!pancakeProduct) {
      return res.status(500).json({ ok: false, message: "Lấy chi tiết sản phẩm thất bại" });
    }

    // 3) Load master list (nếu anh đang dùng 1 nguồn chuẩn)
    const master = readMaster(); // master là object: { "<product_sku_or_id>": { name, price, image, ... } }
    const lookupKey = pancakeProduct.sku || pancakeProduct.id || `${productId}`;
    const masterRecord = master[lookupKey];

    // 4) So sánh: nếu master tồn tại -> nếu khác -> => cập nhật Pancake hoặc log
    if (masterRecord) {
      const diffs = [];
      if (masterRecord.name && masterRecord.name !== pancakeProduct.name) diffs.push("name");
      if (masterRecord.price && Number(masterRecord.price) !== Number(pancakeProduct.price)) diffs.push("price");
      if (masterRecord.image && masterRecord.image !== pancakeProduct.image) diffs.push("image");

      if (diffs.length === 0) {
        console.log(`✅ Product ${lookupKey} đã khớp master. Không cần action.`);
        return res.json({ ok: true, message: "Sản phẩm đã khớp master, no action." });
      }

      // Nếu khác -> tùy chọn: auto update trên Pancake (lưu ý: thao tác này sẽ thay đổi dữ liệu trực tiếp)
      // Tùy anh bật tắt autoUpdate
      const autoUpdate = process.env.AUTO_UPDATE_PANCAKE === "1" || process.env.AUTO_UPDATE_PANCAKE === "true";

      if (!autoUpdate) {
        console.log(`⚠️ Product ${lookupKey} khác master ở: ${diffs.join(", ")}. AUTO_UPDATE disabled -> chỉ log.`);
        return res.json({ ok: true, message: "Khác master, AUTO_UPDATE off, logged.", diffs });
      }

      // Build payload update (chỉ cập nhật những field cần)
      const updatePayload = {};
      if (diffs.includes("name")) updatePayload.name = masterRecord.name;
      if (diffs.includes("price")) updatePayload.price = masterRecord.price;
      if (diffs.includes("image")) updatePayload.image = masterRecord.image;

      const updateResp = await updatePancakeProduct(productId, updatePayload);
      if (!updateResp) {
        return res.status(500).json({ ok: false, message: "Cập nhật Pancake thất bại" });
      }

      console.log(`✅ Updated product ${lookupKey} on Pancake`, updatePayload);
      return res.json({ ok: true, updated: updatePayload });
    } else {
      // Nếu master không có -> lưu tạm vào master để admin check hoặc add vào nguồn chuẩn
      console.log(`ℹ️ Master không có record cho ${lookupKey}. Lưu tạm để kiểm tra.`);
      master[lookupKey] = {
        id: pancakeProduct.id || productId,
        sku: pancakeProduct.sku || "",
        name: pancakeProduct.name || "",
        price: pancakeProduct.price || "",
        image: pancakeProduct.image || "",
        raw: pancakeProduct,
      };
      writeMaster(master);
      return res.json({ ok: true, message: "Lưu tạm vào master để kiểm tra", record: master[lookupKey] });
    }
  } catch (err) {
    console.error("❌ webhook handler error:", err?.response?.data || err.message || err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// Test path
app.get("/", (req, res) => {
  res.send("Webhook server: OK");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
