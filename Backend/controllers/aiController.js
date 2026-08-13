const AIBehaviorLog = require("../models/AIBehaviorLog");
const AIOutfitRecommendation = require("../models/AIOutfitRecommendation");
const AIRecommendation = require("../models/AIRecommendation");
const ChatbotLog = require("../models/ChatbotLog");
const Product = require("../models/Product");
const cloudinary = require("../config/cloudinary");
const mongoose = require("mongoose");
const fs = require("fs/promises");
const path = require("path");
const { parsePagination, buildPagination } = require("../utils/pagination");

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";
const FITROOM_API_URL = "https://platform.fitroom.app";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || "gemini-2.0-flash,gemini-1.5-flash")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const MIX_MATCH_TYPES = {
  top: {
    label: "ao",
    target: "bottom",
    tokens: [
      "ao",
      "top",
      "shirt",
      "tshirt",
      "tee",
      "blouse",
      "hoodie",
      "sweater",
      "jacket",
      "coat",
      "polo",
      "somi",
      "thun",
      "khoac",
    ],
  },
  bottom: {
    label: "quan",
    target: "top",
    tokens: [
      "quan",
      "bottom",
      "pants",
      "trousers",
      "jean",
      "jeans",
      "short",
      "shorts",
      "skirt",
      "chanvay",
      "legging",
      "jogger",
    ],
  },
};
const REVEALING_TOP_TOKENS = [
  "babytee",
  "bralette",
  "bra",
  "bustier",
  "camisole",
  "boxy",
  "cropped",
  "croptop",
  "crop",
  "cutout",
  "cut-out",
  "halter",
  "strapless",
  "tank",
  "tube",
];

const hasCloudinaryConfig = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );

function escapeRegex(value) {
  return value.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getMimeType(filePathOrUrl) {
  const extension = path.extname(filePathOrUrl.split("?")[0]).toLowerCase();

  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/jpeg";
}

function getFilename(filePathOrUrl, fallback) {
  const cleanValue = filePathOrUrl.split("?")[0];
  const filename = path.basename(cleanValue);
  return filename && filename.includes(".") ? filename : fallback;
}

function resolveImageSource(source) {
  if (/^https?:\/\//i.test(source)) {
    return source;
  }

  if (source.startsWith("/src/") || source.startsWith("/assets/")) {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    return `${frontendUrl.replace(/\/+$/, "")}${source}`;
  }

  if (source.startsWith("/image/")) {
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    return `${backendUrl.replace(/\/+$/, "")}${source}`;
  }

  return source;
}

async function imageSourceToBlob(source, fallbackFilename, label = "image") {
  if (!source) {
    throw new Error("Image URL is required");
  }

  const resolvedSource = resolveImageSource(source);

  if (/^https?:\/\//i.test(resolvedSource)) {
    const response = await fetch(resolvedSource);

    if (!response.ok) {
      throw new Error(`Cannot download ${label} image: ${response.status} (${resolvedSource})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const mimeType = response.headers.get("content-type") || getMimeType(source);

    return {
      blob: new Blob([arrayBuffer], { type: mimeType }),
      filename: getFilename(resolvedSource, fallbackFilename),
    };
  }

  const localPath = path.resolve(__dirname, "..", resolvedSource.replace(/^\/+/, ""));
  const buffer = await fs.readFile(localPath).catch((error) => {
    throw new Error(`Cannot read ${label} image: ${error.message}`);
  });

  return {
    blob: new Blob([buffer], { type: getMimeType(localPath) }),
    filename: getFilename(localPath, fallbackFilename),
  };
}

function normalizeFitroomClothType(value) {
  if (value === "lower" || value === "full_set" || value === "combo") {
    return value;
  }

  if (value === "full") {
    return "full_set";
  }

  return "upper";
}

async function createFitroomTask({ modelImageUrl, clothingImageUrl, lowerClothingImageUrl, clothType, hdMode, apiKey }) {
  const selectedApiKey = apiKey || process.env.FITROOM_API_KEY;

  if (!selectedApiKey) {
    const error = new Error("Missing FITROOM_API_KEY");
    error.statusCode = 503;
    error.code = "MISSING_FITROOM_API_KEY";
    throw error;
  }

  const modelImage = await imageSourceToBlob(modelImageUrl, "model.jpg", "model");
  const clothingImage = await imageSourceToBlob(clothingImageUrl, "cloth.jpg", "clothing");
  const lowerClothingImage =
    clothType === "combo"
      ? await imageSourceToBlob(lowerClothingImageUrl, "lower-cloth.jpg", "lower clothing")
      : null;

  const formData = new FormData();
  formData.append("model_image", modelImage.blob, modelImage.filename);
  formData.append("cloth_image", clothingImage.blob, clothingImage.filename);
  if (lowerClothingImage) {
    formData.append("lower_cloth_image", lowerClothingImage.blob, lowerClothingImage.filename);
  }
  formData.append("cloth_type", clothType);
  formData.append("hd_mode", hdMode ? "true" : "false");

  const response = await fetch(`${FITROOM_API_URL}/api/tryon/v2/tasks`, {
    method: "POST",
    headers: {
      "X-API-KEY": selectedApiKey,
    },
    body: formData,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Cannot create Fitroom try-on task");
    error.statusCode = response.status;
    error.providerResponse = data;
    throw error;
  }

  return data;
}

async function getFitroomTaskStatus(taskId, apiKey) {
  const response = await fetch(`${FITROOM_API_URL}/api/tryon/v2/tasks/${taskId}`, {
    headers: {
      "X-API-KEY": apiKey || process.env.FITROOM_API_KEY,
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Cannot get Fitroom task status");
    error.statusCode = response.status;
    error.providerResponse = data;
    throw error;
  }

  return data;
}

async function waitForFitroomResult(taskId, maxAttempts = 35, apiKey) {
  let latestStatus = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    latestStatus = await getFitroomTaskStatus(taskId, apiKey);

    if (latestStatus.status === "COMPLETED" || latestStatus.status === "FAILED") {
      return latestStatus;
    }
  }

  return latestStatus;
}

async function persistGeneratedResultImage(imageUrl, taskId) {
  if (!imageUrl || !hasCloudinaryConfig() || imageUrl.includes("res.cloudinary.com")) {
    return imageUrl;
  }

  try {
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder: "exe201_fashion_shop/ai_results",
      public_id: taskId ? `fitroom_${taskId}` : undefined,
      overwrite: true,
      resource_type: "image",
    });

    return result.secure_url || imageUrl;
  } catch (error) {
    console.error("Cannot persist AI result image to Cloudinary:", error.message);
    return imageUrl;
  }
}

function normalizeText(value = "") {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function getProductTypeText(product) {
  const category =
    typeof product.category === "object" && product.category !== null
      ? `${product.category.name || ""} ${product.category.slug || ""}`
      : "";

  return normalizeText([product.name, product.description, category].join(" "));
}

function detectMixMatchType(product) {
  const compactText = getProductTypeText(product).replace(/\s+/g, "");
  const spacedText = getProductTypeText(product);
  const words = new Set(spacedText.split(/[^a-z0-9]+/).filter(Boolean));

  for (const [type, config] of Object.entries(MIX_MATCH_TYPES)) {
    const hasTypeToken = config.tokens.some((token) => words.has(token) || compactText.includes(token));

    if (hasTypeToken) {
      return type;
    }
  }

  return null;
}

function getRandomItem(items) {
  if (!items.length) {
    return null;
  }

  return items[Math.floor(Math.random() * items.length)];
}

function isGenderCompatible(selectedGender, candidateGender) {
  if (selectedGender === "unisex") {
    return !candidateGender || candidateGender === "unisex";
  }

  return (
    !selectedGender ||
    !candidateGender ||
    candidateGender === "unisex" ||
    selectedGender === candidateGender
  );
}

function hasAnyToken(product, tokens) {
  const compactText = getProductTypeText(product).replace(/\s+/g, "");
  const words = new Set(getProductTypeText(product).split(/[^a-z0-9]+/).filter(Boolean));

  return tokens.some((token) => words.has(token) || compactText.includes(token.replace(/[^a-z0-9]+/g, "")));
}

function normalizeOutfitGender(value) {
  return ["men", "women", "unisex", "kids"].includes(value) ? value : "";
}

function isStyleCompatibleForGender(outfitGender, candidateProduct, targetType) {
  if (targetType !== "top") {
    return true;
  }

  const selectedGender = normalizeOutfitGender(outfitGender) || "unisex";
  const candidateGender = candidateProduct.gender || "unisex";
  const isMensOutfit = selectedGender === "men" || (selectedGender === "unisex" && candidateGender === "men");

  if (selectedGender === "unisex" && candidateGender === "women") {
    return false;
  }

  if (!isMensOutfit) {
    return selectedGender !== "unisex" || !hasAnyToken(candidateProduct, REVEALING_TOP_TOKENS);
  }

  if (candidateGender === "women") {
    return false;
  }

  return !hasAnyToken(candidateProduct, REVEALING_TOP_TOKENS);
}

async function buildMixMatchOutfit(productId, modelGender) {
  if (!productId) {
    const error = new Error("Product ID is required");
    error.statusCode = 400;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    const error = new Error("Product ID is invalid");
    error.statusCode = 400;
    throw error;
  }

  const selectedProduct = await Product.findOne({
    _id: productId,
    isActive: true,
    stock: { $gt: 0 },
  }).populate("category", "name slug");

  if (!selectedProduct) {
    const error = new Error("Selected product not found or out of stock");
    error.statusCode = 404;
    throw error;
  }

  const selectedType = detectMixMatchType(selectedProduct);
  if (!selectedType) {
    const error = new Error("Selected product must be a top or bottom item");
    error.statusCode = 400;
    throw error;
  }

  const targetType = MIX_MATCH_TYPES[selectedType].target;
  const outfitGender = normalizeOutfitGender(modelGender) || selectedProduct.gender || "unisex";
  if (!isStyleCompatibleForGender(outfitGender, selectedProduct, selectedType)) {
    const error = new Error("Selected product is not suitable for this model gender");
    error.statusCode = 400;
    throw error;
  }

  const products = await Product.find({
    _id: { $ne: selectedProduct._id },
    isActive: true,
    stock: { $gt: 0 },
    images: { $exists: true, $ne: [] },
  })
    .populate("category", "name slug")
    .sort({ isFeatured: -1, averageRating: -1, sold: -1, createdAt: -1 })
    .limit(300);

  const typedCandidates = products.filter((product) => detectMixMatchType(product) === targetType);
  const styleSafeCandidates = typedCandidates.filter((product) =>
    isStyleCompatibleForGender(outfitGender, product, targetType)
  );
  const candidatePool = styleSafeCandidates;
  const exactGenderCandidates = outfitGender
    ? candidatePool.filter((product) => product.gender === outfitGender)
    : [];
  const genderMatchedCandidates = candidatePool.filter((product) =>
    isGenderCompatible(outfitGender, product.gender)
  );
  const candidates = exactGenderCandidates.length > 0
    ? exactGenderCandidates
    : genderMatchedCandidates.length > 0
    ? genderMatchedCandidates
    : [];
  const matchedProduct = getRandomItem(candidates);

  if (!matchedProduct) {
    const error = new Error(`No ${MIX_MATCH_TYPES[targetType].label} product found to mix with selected product`);
    error.statusCode = 404;
    throw error;
  }

  const outfit =
    selectedType === "top"
      ? { top: selectedProduct, bottom: matchedProduct }
      : { top: matchedProduct, bottom: selectedProduct };

  return {
    selectedType,
    targetType,
    selectedProduct,
    matchedProduct,
    outfit,
  };
}

async function createAndWaitFitroomStep({
  userId,
  product,
  modelImageUrl,
  clothingImageUrl,
  lowerClothingImageUrl,
  clothType,
  hdMode,
  apiKey,
}) {
  const outfitLog = await AIOutfitRecommendation.create({
    user: userId || null,
    product: product?._id || null,
    modelImageUrl,
    clothingImageUrl,
    clothType,
    hdMode,
    status: "CREATED",
    progress: 0,
    rawResponse: {
      apiKeyEnv: apiKey ? "FITROOM_API_KEY_2" : "FITROOM_API_KEY",
      lowerClothingImageUrl: lowerClothingImageUrl || "",
    },
  });

  try {
    const task = await createFitroomTask({
      modelImageUrl,
      clothingImageUrl,
      lowerClothingImageUrl,
      clothType,
      hdMode,
      apiKey,
    });

    outfitLog.taskId = task.task_id || task.id || "";
    outfitLog.status = task.status || "CREATED";
    outfitLog.rawResponse = task;
    await outfitLog.save();

    const taskStatus = await waitForFitroomResult(outfitLog.taskId, 35, apiKey);
    if (taskStatus) {
      const signedResultImageUrl = taskStatus.download_signed_url || "";
      const persistedResultImageUrl = await persistGeneratedResultImage(signedResultImageUrl, outfitLog.taskId);

      outfitLog.status = taskStatus.status || outfitLog.status;
      outfitLog.progress = Number(taskStatus.progress) || outfitLog.progress;
      outfitLog.resultImageUrl = persistedResultImageUrl || outfitLog.resultImageUrl;
      outfitLog.error = taskStatus.error || "";
      outfitLog.rawResponse = {
        ...taskStatus,
        download_signed_url: signedResultImageUrl,
        persisted_result_url: persistedResultImageUrl,
        lowerClothingImageUrl: lowerClothingImageUrl || "",
      };
      await outfitLog.save();
    }

    if (outfitLog.status !== "COMPLETED" || !outfitLog.resultImageUrl) {
      const error = new Error(outfitLog.error || "Fitroom try-on step failed");
      error.statusCode = 502;
      error.outfitLog = outfitLog;
      throw error;
    }

    return outfitLog;
  } catch (error) {
    outfitLog.status = "FAILED";
    outfitLog.error = error.message;
    outfitLog.rawResponse = error.providerResponse || outfitLog.rawResponse;
    await outfitLog.save().catch(() => {});
    throw error;
  }
}

function getSearchTokens(value) {
  const stopWords = new Set([
    "ban",
    "ben",
    "cho",
    "co",
    "cua",
    "dep",
    "gi",
    "goi",
    "hay",
    "khong",
    "minh",
    "mot",
    "nao",
    "nhe",
    "phu",
    "san",
    "toi",
    "tu",
    "van",
    "voi",
    "y",
  ]);

  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stopWords.has(token))
    .slice(0, 8);
}

function getIntentTokens(tokens) {
  const productTypeTokens = [
    "ao",
    "khoac",
    "hoodie",
    "somi",
    "so",
    "mi",
    "vay",
    "dam",
    "quan",
    "jean",
    "cotton",
    "bomber",
  ];

  return tokens.filter((token) => productTypeTokens.includes(token));
}

function getProductSearchText(product) {
  const category =
    typeof product.category === "object" && product.category !== null
      ? `${product.category.name || ""} ${product.category.slug || ""}`
      : "";

  return normalizeText(
    [
      product.name,
      product.description,
      product.brand,
      product.material,
      product.gender,
      category,
      ...(product.colors || []),
      ...(product.sizes || []),
    ].join(" ")
  );
}

function scoreProduct(product, question) {
  const tokens = getSearchTokens(question);
  const haystack = getProductSearchText(product);
  const productTokens = new Set(haystack.split(/[^a-z0-9]+/).filter(Boolean));
  const normalizedQuestion = normalizeText(question);
  const normalizedName = normalizeText(product.name);
  const nameTokens = new Set(normalizedName.split(/[^a-z0-9]+/).filter(Boolean));
  const intentTokens = getIntentTokens(tokens);
  let score = 0;

  if (intentTokens.length > 0 && !intentTokens.every((token) => productTokens.has(token))) {
    return 0;
  }

  if (normalizedName && normalizedQuestion.includes(normalizedName)) {
    score += 12;
  }

  for (const token of tokens) {
    if (nameTokens.has(token)) {
      score += 6;
    } else if (productTokens.has(token)) {
      score += 2;
    }
  }

  if (product.isFeatured) score += 0.5;
  if (product.averageRating) score += Math.min(product.averageRating, 5) / 10;
  if (product.sold) score += Math.min(product.sold, 100) / 200;

  return score;
}

function buildKeywordFilter(keyword) {
  const filter = { isActive: true, stock: { $gt: 0 } };

  if (keyword) {
    const tokens = getSearchTokens(keyword);
    const patterns = tokens.length > 0 ? tokens : [keyword];

    filter.$or = patterns.flatMap((token) => {
      const pattern = new RegExp(escapeRegex(token), "i");

      return [{ name: pattern }, { description: pattern }, { brand: pattern }, { material: pattern }];
    });
  }

  return filter;
}

function cleanBotAnswer(answer) {
  return answer
    .replace(/\*\*/g, "")
    .replace(/^[\s-]*\d+\.\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function findRelevantProducts(question, limit) {
  const tokens = getSearchTokens(question);
  const filter = buildKeywordFilter(question);
  let candidates = [];

  if (tokens.length > 0) {
    candidates = await Product.find(filter)
      .populate("category", "name slug")
      .sort({ isFeatured: -1, averageRating: -1, sold: -1, createdAt: -1 })
      .limit(40);
  }

  const scoredProducts = candidates
    .map((product) => ({
      product,
      score: scoreProduct(product, question),
    }))
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, limit)
    .map((item) => item.product);

  if (scoredProducts.length > 0) {
    return scoredProducts;
  }

  return Product.find({ isActive: true, stock: { $gt: 0 } })
    .populate("category", "name slug")
    .sort({ isFeatured: -1, averageRating: -1, sold: -1, createdAt: -1 })
    .limit(limit);
}

function summarizeProducts(products) {
  return products
    .map((product, index) => {
      const category =
        typeof product.category === "object" && product.category !== null
          ? product.category.name
          : "";

      return [
        `${index + 1}. ${product.name}`,
        category ? `Danh muc: ${category}` : "",
        product.brand ? `Thuong hieu: ${product.brand}` : "",
        product.price ? `Gia: ${product.price.toLocaleString("vi-VN")} VND` : "",
        product.colors?.length ? `Mau: ${product.colors.join(", ")}` : "",
        product.sizes?.length ? `Size: ${product.sizes.join(", ")}` : "",
        product.description ? `Mo ta: ${product.description.slice(0, 220)}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");
}

function buildFallbackAnswer(products, question) {
  if (!products.length) {
    return "Mình chưa tìm thấy sản phẩm phù hợp trong cửa hàng. Bạn có thể nói rõ hơn về kiểu áo, màu sắc, size hoặc dịp mặc để mình gợi ý chính xác hơn.";
  }

  const productNames = products.slice(0, 2).map((product) => product.name).join(" và ");
  const hasSpecificQuestion = getSearchTokens(question).length > 0;

  return hasSpecificQuestion
    ? `Mình gợi ý ${productNames} vì phù hợp nhất với nhu cầu bạn vừa nhập. Bạn có thể xem các sản phẩm bên dưới để chọn màu, size và mức giá phù hợp.`
    : `Mình gợi ý ${productNames} trong các sản phẩm nổi bật hiện có. Bạn có thể nói thêm về phong cách, màu sắc hoặc ngân sách để mình lọc kỹ hơn.`;
}

function isGreetingMessage(value) {
  const normalized = normalizeText(value).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const greetings = new Set([
    "hi",
    "hello",
    "hey",
    "xin chao",
    "chao",
    "chao ban",
    "chao shop",
    "alo",
  ]);

  return greetings.has(normalized);
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n")
    .trim();

  return text || "Toi chua tao duoc cau tra loi phu hop luc nay.";
}

async function generateWithModel(model, prompt, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${GEMINI_API_URL}/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 700,
        },
      }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = data?.error?.message || "Gemini request failed";
      const error = new Error(message);
      error.statusCode = response.status;
      error.providerStatusCode = response.status;
      error.model = model;
      throw error;
    }

    return {
      answer: cleanBotAnswer(extractGeminiText(data)),
      model,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const error = new Error("Missing GEMINI_API_KEY");
    error.statusCode = 503;
    error.code = "MISSING_GEMINI_API_KEY";
    throw error;
  }

  const models = [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS].filter(
    (model, index, list) => model && list.indexOf(model) === index
  );
  let lastError;

  for (const model of models) {
    try {
      return await generateWithModel(model, prompt, apiKey);
    } catch (error) {
      lastError = error;

      if (![429, 500, 502, 503, 504].includes(error.statusCode)) {
        throw error;
      }
    }
  }

  throw lastError;
}

exports.createBehaviorLog = async (req, res) => {
  try {
    const log = await AIBehaviorLog.create({
      user: req.user?.id || null,
      product: req.body.productId || req.body.product || null,
      action: req.body.action || "other",
      keyword: req.body.keyword || "",
      metadata: req.body.metadata || {},
    });

    res.status(201).json({ message: "Create behavior log successfully", log });
  } catch (error) {
    res.status(500).json({ message: "Cannot create behavior log", error: error.message });
  }
};

exports.createChatbotLog = async (req, res) => {
  try {
    const { question, answer = "", intent = "general", metadata = {} } = req.body;

    if (!question) {
      return res.status(400).json({ message: "Question is required" });
    }

    const log = await ChatbotLog.create({
      user: req.user?.id || null,
      question,
      answer,
      intent,
      metadata,
    });

    res.status(201).json({ message: "Create chatbot log successfully", log });
  } catch (error) {
    res.status(500).json({ message: "Cannot create chatbot log", error: error.message });
  }
};

exports.chatWithGemini = async (req, res) => {
  try {
    const question = (req.body.question || req.body.message || "").trim();

    if (!question) {
      return res.status(400).json({ message: "Question is required" });
    }

    if (isGreetingMessage(question)) {
      const answer = "Xin chào bạn! Mình là trợ lý thời trang của OUTFIO. Bạn muốn tìm sản phẩm, chọn trang phục theo dịp hay cần mình tư vấn phối đồ?";

      await ChatbotLog.create({
        user: req.user?.id || null,
        question,
        answer,
        intent: "greeting",
        metadata: { model: "local-intent" },
      });

      return res.json({
        message: "Chat successfully",
        answer,
        model: "local-intent",
        products: [],
      });
    }

    const limit = Math.min(Math.max(Number(req.body.limit) || 4, 1), 8);
    const products = await findRelevantProducts(question, limit);

    const productContext = products.length
      ? summarizeProducts(products)
      : "Khong co san pham nao trong database phu hop de goi y.";
    const prompt = [
      "Ban la tro ly mua sam cho website thoi trang.",
      "Tra loi bang tieng Viet co dau, ngan gon, than thien, tap trung tu van san pham.",
      "Khong dung markdown, khong dung dau **, khong lap lai danh sach theo kieu danh so.",
      "Frontend se hien thi card san pham rieng, nen cau tra loi chi can 1-2 cau tom tat ly do goi y.",
      "Chi dua ra thong tin dua tren danh sach san pham duoc cung cap. Neu khong du thong tin, hay noi ro va hoi them nhu cau.",
      "Neu co san pham phu hop, nhac den toi da 2 ten san pham noi bat va ly do ngan gon.",
      "",
      `Cau hoi khach hang: ${question}`,
      "",
      "San pham trong database:",
      productContext,
    ].join("\n");

    let geminiResult;
    try {
      geminiResult = await callGemini(prompt);
    } catch (error) {
      geminiResult = {
        answer: buildFallbackAnswer(products, question),
        model: "local-fallback",
        providerError: error.message,
      };
    }

    const answer = geminiResult.answer;

    await ChatbotLog.create({
      user: req.user?.id || null,
      question,
      answer,
      intent: "gemini_chat",
      metadata: {
        model: geminiResult.model,
        productIds: products.map((product) => product._id),
      },
    });

    res.json({
      message: "Chat successfully",
      answer,
      model: geminiResult.model,
      products,
    });
  } catch (error) {
    const statusCode = error.statusCode || (error.name === "AbortError" ? 504 : 500);

    res.status(statusCode).json({
      message:
        error.code === "MISSING_GEMINI_API_KEY"
          ? "Gemini API key is not configured"
          : [429, 500, 502, 503, 504].includes(statusCode)
          ? "Gemini is temporarily unavailable, please try again"
          : "Cannot process AI chat",
      error: error.message,
      model: error.model,
    });
  }
};

exports.createTryOn = async (req, res) => {
  let outfitLog = null;

  try {
    const modelImageUrl = String(req.body.modelImageUrl || "").trim();
    const requestedClothingImageUrl = String(req.body.clothingImageUrl || "").trim();
    const lowerClothingImageUrl = String(req.body.lowerClothingImageUrl || "").trim();
    const productId = req.body.productId || null;
    const clothType = normalizeFitroomClothType(req.body.clothType || "upper");
    const hdMode = req.body.hdMode === true || req.body.hdMode === "true";

    if (!modelImageUrl) {
      return res.status(400).json({ message: "Model image URL is required" });
    }

    let product = null;
    if (productId) {
      product = await Product.findById(productId);
    }

    const clothingImageUrl = requestedClothingImageUrl || product?.images?.[0] || "";
    if (!clothingImageUrl) {
      return res.status(400).json({ message: "Clothing image URL is required" });
    }
    if (clothType === "combo" && !lowerClothingImageUrl) {
      return res.status(400).json({ message: "Lower clothing image URL is required for combo try-on" });
    }

    outfitLog = await AIOutfitRecommendation.create({
      user: req.user?.id || null,
      product: product?._id || null,
      modelImageUrl,
      clothingImageUrl,
      clothType,
      hdMode,
      status: "CREATED",
      progress: 0,
      rawResponse: {
        lowerClothingImageUrl: lowerClothingImageUrl || "",
      },
    });

    const task = await createFitroomTask({
      modelImageUrl,
      clothingImageUrl,
      lowerClothingImageUrl,
      clothType,
      hdMode,
    });

    outfitLog.taskId = task.task_id || task.id || "";
    outfitLog.status = task.status || "CREATED";
    outfitLog.rawResponse = {
      ...task,
      lowerClothingImageUrl: lowerClothingImageUrl || "",
    };
    await outfitLog.save();

    const taskStatus = await waitForFitroomResult(outfitLog.taskId);
    if (taskStatus) {
      const signedResultImageUrl = taskStatus.download_signed_url || "";
      const persistedResultImageUrl = await persistGeneratedResultImage(signedResultImageUrl, outfitLog.taskId);

      outfitLog.status = taskStatus.status || outfitLog.status;
      outfitLog.progress = Number(taskStatus.progress) || outfitLog.progress;
      outfitLog.resultImageUrl = persistedResultImageUrl || outfitLog.resultImageUrl;
      outfitLog.error = taskStatus.error || "";
      outfitLog.rawResponse = {
        ...taskStatus,
        download_signed_url: signedResultImageUrl,
        persisted_result_url: persistedResultImageUrl,
        lowerClothingImageUrl: lowerClothingImageUrl || "",
      };
      await outfitLog.save();
    }

    if (outfitLog.status === "FAILED") {
      return res.status(502).json({
        message: outfitLog.error || "Fitroom try-on failed",
        recommendation: outfitLog,
      });
    }

    res.status(201).json({
      message:
        outfitLog.status === "COMPLETED"
          ? "Create AI try-on successfully"
          : "AI try-on task is still processing",
      recommendation: outfitLog,
      taskId: outfitLog.taskId,
      status: outfitLog.status,
      progress: outfitLog.progress,
      resultImageUrl: outfitLog.resultImageUrl,
    });
  } catch (error) {
    if (outfitLog) {
      outfitLog.status = "FAILED";
      outfitLog.error = error.message;
      outfitLog.rawResponse = error.providerResponse || outfitLog.rawResponse;
      await outfitLog.save().catch(() => {});
    }

    res.status(error.statusCode || 500).json({
      message:
        error.code === "MISSING_FITROOM_API_KEY"
          ? "Fitroom API key is not configured"
          : error.message || "Cannot create AI try-on",
      error: error.message,
    });
  }
};

exports.getMyTryOns = async (req, res) => {
  try {
    const filter = {
      user: req.user.id,
      status: "COMPLETED",
      resultImageUrl: { $exists: true, $ne: "", $regex: "res.cloudinary.com" },
      "rawResponse.mixMatchIntermediate": { $ne: true },
    };

    const pagination = parsePagination(req, { defaultLimit: 25, maxLimit: 100 });
    const [recommendations, total] = await Promise.all([
      AIOutfitRecommendation.find(filter)
        .populate("product", "name slug images price")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      AIOutfitRecommendation.countDocuments(filter),
    ]);

    res.json({
      message: "Get AI try-ons successfully",
      recommendations,
      pagination: buildPagination(total, pagination.page, pagination.limit),
    });
  } catch (error) {
    res.status(500).json({ message: "Cannot get AI try-ons", error: error.message });
  }
};

exports.createMixMatch = async (req, res) => {
  try {
    const productId = req.body.productId || req.body.selectedProductId || req.body.product;
    const modelGender = normalizeOutfitGender(req.body.modelGender);
    const { selectedType, targetType, selectedProduct, matchedProduct, outfit } = await buildMixMatchOutfit(
      productId,
      modelGender
    );

    res.status(201).json({
      message: "Create AI mix and match successfully",
      selectedType,
      targetType,
      selectedProduct,
      matchedProduct,
      outfit,
      fitroom: {
        apiKeyEnv: "FITROOM_API_KEY_2",
        configured: Boolean(process.env.FITROOM_API_KEY_2),
        note: "Mix and match only selects products from database. Fitroom credit is used only when creating try-on image.",
      },
      rules: {
        selectedProductMustBe: "top_or_bottom",
        randomTarget: targetType,
        requireInStock: true,
        preferSameGenderOrUnisex: true,
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: "Cannot create AI mix and match", error: error.message });
  }
};

exports.createMixMatchTryOn = async (req, res) => {
  try {
    const productId = req.body.productId || req.body.selectedProductId || req.body.product;
    const modelImageUrl = String(req.body.modelImageUrl || "").trim();
    const modelGender = normalizeOutfitGender(req.body.modelGender);
    const hdMode = req.body.hdMode === true || req.body.hdMode === "true";
    const apiKey = process.env.FITROOM_API_KEY_2;

    if (!modelImageUrl) {
      return res.status(400).json({ message: "Model image URL is required" });
    }

    if (!apiKey) {
      return res.status(503).json({ message: "FITROOM_API_KEY_2 is not configured" });
    }

    const { selectedType, targetType, selectedProduct, matchedProduct, outfit } = await buildMixMatchOutfit(
      productId,
      modelGender
    );
    const topImageUrl = outfit.top?.images?.[0] || "";
    const bottomImageUrl = outfit.bottom?.images?.[0] || "";

    if (!topImageUrl || !bottomImageUrl) {
      return res.status(400).json({ message: "Top and bottom products must both have image URLs" });
    }

    const lowerTryOn = await createAndWaitFitroomStep({
      userId: req.user?.id || null,
      product: outfit.bottom,
      modelImageUrl,
      clothingImageUrl: bottomImageUrl,
      clothType: "lower",
      hdMode,
      apiKey,
    });
    lowerTryOn.rawResponse = {
      ...(lowerTryOn.rawResponse || {}),
      mixMatchIntermediate: true,
      mixMatchStep: "lower",
    };
    await lowerTryOn.save();

    const upperTryOn = await createAndWaitFitroomStep({
      userId: req.user?.id || null,
      product: outfit.top,
      modelImageUrl: lowerTryOn.resultImageUrl,
      clothingImageUrl: topImageUrl,
      clothType: "upper",
      hdMode,
      apiKey,
    });
    upperTryOn.rawResponse = {
      ...(upperTryOn.rawResponse || {}),
      lowerClothingImageUrl: bottomImageUrl,
      lowerStepTaskId: lowerTryOn.taskId,
      mixMatchFinal: true,
      mixMatchStep: "upper",
    };
    await upperTryOn.save();

    res.status(201).json({
      message: "Create AI mix and match try-on successfully",
      selectedType,
      targetType,
      selectedProduct,
      matchedProduct,
      outfit,
      taskId: upperTryOn.taskId,
      steps: [
        {
          bottom: outfit.bottom,
          clothType: "lower",
          status: lowerTryOn.status,
          resultImageUrl: lowerTryOn.resultImageUrl,
        },
        {
          top: outfit.top,
          clothType: "upper",
          status: upperTryOn.status,
          resultImageUrl: upperTryOn.resultImageUrl,
        },
      ],
      status: upperTryOn.status,
      progress: upperTryOn.progress,
      resultImageUrl: upperTryOn.resultImageUrl,
      creditCost: 2,
      fitroom: {
        apiKeyEnv: "FITROOM_API_KEY_2",
        configured: true,
        note: "This endpoint applies Fitroom try-on in two steps to avoid combo masking: lower first, then upper.",
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message:
        error.code === "MISSING_FITROOM_API_KEY"
          ? "FITROOM_API_KEY_2 is not configured"
          : error.message || "Cannot create AI mix and match try-on",
      error: error.message,
    });
  }
};

exports.getRecommendations = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 30);
    const filter = buildKeywordFilter(req.query.q || "");
    const input = {
      category: req.query.category || null,
      q: req.query.q || null,
      source: "api",
    };

    if (req.query.category) {
      filter.category = req.query.category;
    }

    const products = await Product.find(filter)
      .populate("category", "name slug")
      .sort({ isFeatured: -1, averageRating: -1, sold: -1, createdAt: -1 })
      .limit(limit);

    if (req.user?.id && products.length > 0) {
      await AIRecommendation.create({
        user: req.user.id,
        algorithm: "popular_category_rating",
        input,
        products: products.map((product, index) => ({
          product: product._id,
          score: products.length - index,
          reason: product.isFeatured ? "featured_product" : "popular_product",
        })),
      });
    }

    res.json({ message: "Get recommendations successfully", products });
  } catch (error) {
    res.status(500).json({ message: "Cannot get recommendations", error: error.message });
  }
};

exports.getBehaviorLogs = async (req, res) => {
  try {
    const pagination = parsePagination(req, { defaultLimit: 50, maxLimit: 200 });

    const [logs, total] = await Promise.all([
      AIBehaviorLog.find({})
        .populate("user", "username email role")
        .populate("product", "name slug")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      AIBehaviorLog.countDocuments(),
    ]);

    res.json({
      message: "Get behavior logs successfully",
      logs,
      pagination: buildPagination(total, pagination.page, pagination.limit),
    });
  } catch (error) {
    res.status(500).json({ message: "Cannot get behavior logs", error: error.message });
  }
};

exports.getChatbotLogs = async (req, res) => {
  try {
    const pagination = parsePagination(req, { defaultLimit: 50, maxLimit: 200 });

    const [logs, total] = await Promise.all([
      ChatbotLog.find({})
        .populate("user", "username email role")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      ChatbotLog.countDocuments(),
    ]);

    res.json({
      message: "Get chatbot logs successfully",
      logs,
      pagination: buildPagination(total, pagination.page, pagination.limit),
    });
  } catch (error) {
    res.status(500).json({ message: "Cannot get chatbot logs", error: error.message });
  }
};
