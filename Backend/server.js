const app = require("./app");

const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
  console.log(`Swagger: http://localhost:${PORT}/docs`);
});
