const express = require("express");
const app = express();
app.use(express.json());

// BOT WEBHOOK — TRẢ VỀ NỘI DUNG CHUẨN CHO PANCAKE
app.post("/webhook", (req, res) => {
  const msg = req.body?.message?.toLowerCase() || "";

  // TRẢ LỜI DEMO — ANH SẼ THAY BẰNG LOGIC TƯ VẤN SAU
  if (msg.includes("hi") || msg.includes("hello")) {
    return res.json({
      reply: "Dạ em chào anh ạ! Anh dùng cà phê cho cá nhân hay cho quán ạ?"
    });
  }

  if (msg.includes("giá")) {
    return res.json({
      reply: "Dạ anh ơi, anh muốn hỏi giá sản phẩm nào để em báo đúng ạ?"
    });
  }

  return res.json({
    reply: "Dạ anh ơi, anh nói rõ giúp em để em hỗ trợ đúng ý nhất ạ ❤️"
  });
});

app.get("/", (req, res) => {
  res.send("Webhook Server Running...");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server is running on port " + PORT));
