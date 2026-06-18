const mongoose = require("mongoose");
const Product = require("../models/Product");
const Category = require("../models/Category");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined && item !== null && String(item).trim() !== "");
  }

  if (value === undefined || value === null || value === "") {
    return [];
  }

  return [value];
}

async function resolveCategory(categoryValue) {
  if (!categoryValue) {
    return null;
  }

  if (mongoose.Types.ObjectId.isValid(categoryValue)) {
    return Category.findById(categoryValue);
  }

  return Category.findOne({ slug: categoryValue });
}

function getProductSort(sort) {
  switch (sort) {
    case "price_asc":
      return { price: 1 };
    case "price_desc":
      return { price: -1 };
    case "rating":
      return { averageRating: -1, reviewCount: -1 };
    case "sold":
      return { sold: -1 };
    case "newest":
    default:
      return { createdAt: -1 };
  }
}

async function buildProductFilter(query) {
  const filter = { isActive: true };

  if (query.category) {
    const category = await resolveCategory(query.category);
    filter.category = category?._id || new mongoose.Types.ObjectId();
  }

  if (query.q) {
    const keyword = new RegExp(escapeRegExp(query.q.trim()), "i");
    filter.$or = [{ name: keyword }, { description: keyword }, { brand: keyword }, { material: keyword }];
  }

  if (query.gender) {
    filter.gender = query.gender;
  }

  if (query.size) {
    filter.sizes = query.size;
  }

  if (query.color) {
    filter.colors = query.color;
  }

  if (query.minPrice || query.maxPrice) {
    filter.price = {};
    if (query.minPrice) filter.price.$gte = Number(query.minPrice);
    if (query.maxPrice) filter.price.$lte = Number(query.maxPrice);
  }

  if (query.inStock === "true") {
    filter.stock = { $gt: 0 };
  }

  return filter;
}

exports.getProducts = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 100);
    const skip = (page - 1) * limit;
    const filter = await buildProductFilter(req.query);

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate("category", "name slug")
        .sort(getProductSort(req.query.sort))
        .skip(skip)
        .limit(limit),
      Product.countDocuments(filter),
    ]);

    res.json({
      message: "Get products successfully",
      products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Cannot get products", error: error.message });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const idOrSlug = req.params.id;
    const product = await Product.findOne({
      $or: [{ _id: mongoose.Types.ObjectId.isValid(idOrSlug) ? idOrSlug : null }, { slug: idOrSlug }],
      isActive: true,
    }).populate("category", "name slug");

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({ message: "Get product successfully", product });
  } catch (error) {
    res.status(500).json({ message: "Cannot get product", error: error.message });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const { name, category, price } = req.body;

    if (!name || !category || price === undefined) {
      return res.status(400).json({ message: "Name, category and price are required" });
    }

    const categoryDoc = await resolveCategory(category);
    if (!categoryDoc) {
      return res.status(400).json({ message: "Category is invalid" });
    }

    const product = await Product.create({
      ...req.body,
      category: categoryDoc._id,
      images: toArray(req.body.images || req.body.image),
      sizes: toArray(req.body.sizes),
      colors: toArray(req.body.colors),
      price: Number(price),
      originalPrice: Number(req.body.originalPrice || 0),
      stock: Number(req.body.stock || 0),
    });

    await product.populate("category", "name slug");
    res.status(201).json({ message: "Create product successfully", product });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ message: "Product already exists" });
    }
    res.status(500).json({ message: "Cannot create product", error: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const assignableFields = [
      "name",
      "slug",
      "description",
      "price",
      "originalPrice",
      "brand",
      "material",
      "gender",
      "stock",
      "isFeatured",
      "isActive",
      "variants",
    ];

    for (const field of assignableFields) {
      if (req.body[field] !== undefined) {
        product[field] = req.body[field];
      }
    }

    if (req.body.category !== undefined) {
      const categoryDoc = await resolveCategory(req.body.category);
      if (!categoryDoc) {
        return res.status(400).json({ message: "Category is invalid" });
      }
      product.category = categoryDoc._id;
    }

    if (req.body.images !== undefined || req.body.image !== undefined) {
      product.images = toArray(req.body.images || req.body.image);
    }

    if (req.body.sizes !== undefined) {
      product.sizes = toArray(req.body.sizes);
    }

    if (req.body.colors !== undefined) {
      product.colors = toArray(req.body.colors);
    }

    await product.save();
    await product.populate("category", "name slug");

    res.json({ message: "Update product successfully", product });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ message: "Product already exists" });
    }
    res.status(500).json({ message: "Cannot update product", error: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    product.isActive = false;
    await product.save();

    res.json({ message: "Delete product successfully" });
  } catch (error) {
    res.status(500).json({ message: "Cannot delete product", error: error.message });
  }
};
