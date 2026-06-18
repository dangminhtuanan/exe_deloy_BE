const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

function swaggerDocs(app, port = process.env.PORT || 5000) {
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;
  const baseUrl =
    process.env.BACKEND_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    vercelUrl ||
    `http://localhost:${port}`;

  const options = {
    definition: {
      openapi: "3.0.0",
      info: {
        title: "EXE201 Fashion Shop API",
        version: "1.0.0",
        description: "Fashion shop backend API",
      },
      servers: [
        {
          url: `${baseUrl}/api`,
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
    apis: [`${__dirname}/routes/*.js`],
  };

  const swaggerSpec = swaggerJsdoc(options);
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  console.log(`Swagger: ${baseUrl}/docs`);
}

module.exports = swaggerDocs;
